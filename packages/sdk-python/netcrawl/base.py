"""
netcrawl/base.py

WorkerMeta metaclass and WorkerClass base class.
"""

import inspect
import time
from netcrawl.fields import WorkerField


class WorkerMeta(type):
    """
    Metaclass that discovers WorkerField declarations on class definition.
    Builds _fields dict: { field_name: field_instance }
    Used by daemon scanner to know deploy-time requirements.
    """

    def __new__(mcs, name, bases, namespace):
        fields: dict = {}

        # Inherit fields from parent classes (in MRO order so later bases win)
        for base in reversed(bases):
            if hasattr(base, '_fields'):
                fields.update(base._fields)

        # Discover new fields declared directly in this class
        for key, value in namespace.items():
            if isinstance(value, WorkerField):
                value._field_name = key
                fields[key] = value

        namespace['_fields'] = fields
        namespace['_class_name'] = name

        return super().__new__(mcs, name, bases, namespace)


class WorkerClass(metaclass=WorkerMeta):
    """
    Base class for all NetCrawl workers.

    Lifecycle:
    1. Daemon discovers class, reads _fields for requirements schema
    2. User deploys from UI, specifying items and routes
    3. Daemon forks subprocess with env vars
    4. Runner instantiates class, injects field values, calls on_startup()
    5. Runner calls on_loop() in a loop until process is killed

    Internal state:
    - Use regular Python instance variables in on_startup() and on_loop()
    - State persists between on_loop() calls (instance stays alive)

    Example:
        class Collector(WorkerClass):
            pickaxe = Pickaxe()
            route1 = Route("Path to ore mine")
            route2 = Route("Return path")

            def on_startup(self):
                self.trips = 0
                self.info("Collector started!")

            def on_loop(self):
                self.move_through(self.route1)
                self.collect()
                self.move_through(self.route2)
                self.deposit()
                self.trips += 1
                self.info(f"Completed trip #{self.trips}")
    """

    # Set by runner at instantiation time
    _worker_id: str = ""
    _api_url: str = ""
    _current_node: str = "hub"
    _inventory: dict = {}
    _client = None  # ApiClient instance

    def __init__(self, worker_id: str, api_url: str, injected_fields: dict):
        self._worker_id = worker_id
        self._api_url = api_url
        self._current_node = "hub"
        self._inventory = {}

        # Import here to avoid circular imports at module load time
        from netcrawl.client import ApiClient
        self._client = ApiClient(api_url=api_url, worker_id=worker_id)

        # Inject field values (replace descriptor instances with actual values)
        for field_name, value in injected_fields.items():
            setattr(self, field_name, value)

    # ── Lifecycle hooks (override these) ────────────────────────────────────

    def on_startup(self):
        """Called once when the worker is first deployed. Override to initialize state."""
        pass

    def on_loop(self):
        """Called repeatedly in a loop. Override with your worker logic."""
        pass

    # ── Movement ────────────────────────────────────────────────────────────

    def move(self, node_id: str) -> None:
        """
        Move to an adjacent node. Blocks until arrival.
        Raises ValueError if node is not adjacent.
        """
        result = self._client.action("move", {"targetNodeId": node_id})
        if result.get("ok"):
            self._current_node = node_id
            time.sleep(result.get("travelTime", 1000) / 1000)
        else:
            raise ValueError(f"Cannot move to {node_id}: {result.get('error')}")

    def move_through(self, route) -> None:
        """
        Move through a list of node IDs in order.
        Accepts: list of node IDs, or a reversed() iterator.
        Skips the first node if it matches current position.

        Example:
            self.move_through(self.route1)
            self.move_through(list(reversed(self.route1)))
        """
        nodes = list(route)
        for node_id in nodes:
            if node_id == self._current_node:
                continue
            self.move(node_id)

    # ── Resource actions ─────────────────────────────────────────────────────

    def collect(self) -> dict:
        """
        Collect resources at current node.
        Returns: { "harvested": { "energy": 5 } }
        Worker has 1 inventory slot — can only hold one resource type at a time.
        """
        result = self._client.action("harvest", {})
        if result.get("ok"):
            self._inventory = result.get("carrying", {})
        return result

    # Alias
    def harvest(self) -> dict:
        return self.collect()

    def deposit(self) -> dict:
        """
        Deposit all carried resources at Hub.
        Must be at Hub node to deposit.
        Returns: { "deposited": { "energy": 5 } }
        """
        result = self._client.action("deposit", {})
        if result.get("ok"):
            self._inventory = {}
        return result

    # ── Scanning ─────────────────────────────────────────────────────────────

    def scan(self) -> list[dict]:
        """
        Scan adjacent nodes.
        Returns list of: { id, type, resources, infected, adjacent: bool }
        """
        result = self._client.action("scan", {})
        return result.get("nodes", [])

    # ── Repair ───────────────────────────────────────────────────────────────

    def repair(self, node_id: str) -> bool:
        """
        Repair an infected node. Costs 30 energy from game resources.
        Must be adjacent to the target node.
        """
        result = self._client.action("repair", {"nodeId": node_id})
        return result.get("ok", False)

    # ── Logging ──────────────────────────────────────────────────────────────

    def info(self, msg: str) -> None:
        """Log an info message. Visible in the UI's worker log panel."""
        self._client.action("log", {"message": f"[INFO] {msg}", "level": "info"})
        print(f"[{self._worker_id}] INFO: {msg}")

    def warn(self, msg: str) -> None:
        self._client.action("log", {"message": f"[WARN] {msg}", "level": "warn"})
        print(f"[{self._worker_id}] WARN: {msg}")

    def error(self, msg: str) -> None:
        self._client.action("log", {"message": f"[ERROR] {msg}", "level": "error"})
        print(f"[{self._worker_id}] ERROR: {msg}")

    # ── Inventory ─────────────────────────────────────────────────────────────

    @property
    def carrying(self) -> dict:
        """Currently carried resources. E.g. { 'energy': 5 }"""
        return self._inventory.copy()

    @property
    def current_node(self) -> str:
        """Current node ID."""
        return self._current_node

    # ── Class metadata ────────────────────────────────────────────────────────

    @classmethod
    def get_schema(cls) -> dict:
        """
        Returns the deploy-time requirements schema.
        Called by daemon scanner to register with server.
        """
        return {
            "class_name": cls.__name__,
            "fields": {
                name: field.schema()
                for name, field in cls._fields.items()
            },
            "docstring": inspect.cleandoc(cls.__doc__ or ""),
        }
