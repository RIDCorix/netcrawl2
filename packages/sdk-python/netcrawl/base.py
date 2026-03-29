"""
netcrawl/base.py

WorkerMeta metaclass and WorkerClass base class.
"""

import inspect
import time
from netcrawl.fields import WorkerField, ItemField


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

        # class_name: display name (defaults to Python class name)
        if 'class_name' not in namespace:
            # Inherit from parent or default to Python class name
            for base in bases:
                if hasattr(base, 'class_name') and base.class_name != base.__name__:
                    namespace['class_name'] = base.class_name
                    break
            else:
                namespace['class_name'] = name

        # class_id: unique identifier (defaults to lowercase Python class name)
        if 'class_id' not in namespace:
            for base in bases:
                if hasattr(base, 'class_id') and base.class_id != base.__name__.lower():
                    namespace['class_id'] = base.class_id
                    break
            else:
                namespace['class_id'] = name.lower()

        # class_icon: lucide icon name (defaults to 'Bot')
        if 'class_icon' not in namespace:
            for base in bases:
                if hasattr(base, 'class_icon') and base.class_icon != 'Bot':
                    namespace['class_icon'] = base.class_icon
                    break
            else:
                namespace['class_icon'] = 'Bot'

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
                self.pickaxe.mine_and_collect()
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
    _holding = None   # Drop | None — the 1-slot internal inventory
    _client = None  # ApiClient instance

    def __init__(self, worker_id: str, api_url: str, injected_fields: dict):
        self._worker_id = worker_id
        self._api_url = api_url
        self._current_node = "hub"
        self._inventory = {}
        self._holding = None

        # Import here to avoid circular imports at module load time
        from netcrawl.client import ApiClient
        self._client = ApiClient(api_url=api_url, worker_id=worker_id)

        # Inject field values (replace descriptor instances with actual values)
        for field_name, value in injected_fields.items():
            setattr(self, field_name, value)

        # Give RuntimeItem instances a back-reference to self
        for field_name in self.__class__._fields:
            instance = getattr(self, field_name, None)
            if instance is not None and hasattr(instance, '_worker'):
                instance._worker = self

    # ── Lifecycle hooks (override these) ────────────────────────────────────

    def on_startup(self):
        """Called once when the worker is first deployed. Override to initialize state."""
        pass

    def on_loop(self):
        """Called repeatedly in a loop. Override with your worker logic."""
        pass

    # ── Node access ─────────────────────────────────────────────────────────

    def get_current_node(self):
        """
        Get a typed node object for the worker's current position.

        Returns a subclass of BaseNode based on node type:
        - HubNode, ResourceNode, RelayNode, ComputeNode, LockedNode, InfectedNode

        Example:
            node = self.get_current_node()
            if isinstance(node, ComputeNode):
                task = node.get_task()
                answer = task.parameters['a'] + task.parameters['b']
                node.submit(task.task_id, answer)
        """
        from netcrawl.nodes import create_node
        result = self._client.action("get_node_info", {})
        if not result.get("ok"):
            raise ValueError(f"get_current_node() failed: {result.get('error')}")
        return create_node(result, self._client, self._worker_id)

    # ── Services ────────────────────────────────────────────────────────────

    def get_service(self, node_id: str):
        """
        Get a service proxy for a structure node (e.g., Cache Node).
        Raises ServiceNotReachable if the node is out of range or unavailable.

        Usage:
            cache = self.get_service("cache-node-id")
            val = cache.get("key")
            cache.set("key", val)

        Returns: CacheService (or other service types in the future)
        """
        from netcrawl.services import CacheService, ServiceNotReachable
        result = self._client.action("get_service", {"serviceNodeId": node_id})
        if not result.get("ok"):
            reason = result.get("reason", "")
            if reason in ("not_reachable", "not_found", "not_a_service"):
                raise ServiceNotReachable(result.get("error", f"Service '{node_id}' not reachable"))
            raise ServiceNotReachable(result.get("error", "Unknown error"))

        service_type = result.get("serviceType")
        if service_type == "cache":
            return CacheService(self._client, self._worker_id, node_id, result)

        raise ServiceNotReachable(f"Unknown service type: {service_type}")

    # ── Movement ────────────────────────────────────────────────────────────

    def move(self, target: str) -> None:
        """
        Move along an edge or to a node.
        - If target looks like an edge ID (starts with 'e'): uses move_edge
        - Otherwise: legacy move by node ID

        Raises ValueError if the edge/node is not connected.
        """
        # Try edge-based first (edge IDs like 'e1', 'e2', etc.)
        if target.startswith('e') and target[1:].isdigit():
            return self.move_edge(target)
        # Legacy: move by node ID
        result = self._client.action("move", {"targetNodeId": target})
        if result.get("ok"):
            self._current_node = target
        else:
            raise ValueError(f"Cannot move to {target}: {result.get('error')}")

    def move_edge(self, edge_id: str) -> dict:
        """
        Move along a specific edge. The worker travels to the other end
        of the edge from their current position.

        Raises ValueError if the edge doesn't connect to the current node.

        Returns: { ok, travelTime, edgeId, from, to }
        """
        result = self._client.action("move_edge", {"edgeId": edge_id})
        if result.get("ok"):
            self._current_node = result.get("to", self._current_node)
            return result
        else:
            raise ValueError(f"Cannot move along edge {edge_id}: {result.get('error')}")

    def get_edges(self) -> list:
        """
        Get all edges connected to the current node.

        Returns: list of { id: str, otherNode: str }
        """
        result = self._client.action("get_edges", {})
        return result.get("edges", [])

    def move_through(self, route) -> None:
        """
        Move through a list of edge IDs or node IDs in order.
        Supports both ['e1', 'e2'] (edge-based) and ['hub', 'r1'] (node-based).
        """
        items = list(route)
        for item in items:
            if item == self._current_node:
                continue
            self.move(item)

    # ── Resource actions ─────────────────────────────────────────────────────

    def collect(self) -> dict:
        """
        Pick up a drop from the current node into the 1-slot internal inventory.
        Returns: { ok: True, item: { type, amount } }
        Fails if: slot is full ('slot_full'), or nothing to collect ('nothing_here').
        """
        result = self._client.action("collect", {})
        if result.get("ok"):
            self._holding = result.get("item")
        return result

    def deposit(self) -> dict:
        """
        Deposit the held item (or old-style carrying resources) into player inventory.
        Must be at Hub node.
        Returns: { ok: True, deposited: { type, amount } }
        """
        result = self._client.action("deposit", {})
        if result.get("ok"):
            self._holding = None
            self._inventory = {}
        return result

    def harvest(self) -> dict:
        """
        Legacy: harvest resources at current node (old carry system).
        Returns: { "harvested": { "data": 5 } }
        """
        result = self._client.action("harvest", {})
        if result.get("ok"):
            self._inventory = result.get("carrying", {})
        return result

    # ── Scanning ─────────────────────────────────────────────────────────────

    def scan(self) -> list:
        """
        Scan adjacent nodes.
        Returns list of: { id, type, resources, infected, adjacent: bool }
        """
        result = self._client.action("scan", {})
        return result.get("nodes", [])

    # ── Repair ───────────────────────────────────────────────────────────────

    def repair(self, node_id: str) -> bool:
        """
        Repair an infected node. Costs 30 data from game resources.
        Must be adjacent to the target node.
        """
        result = self._client.action("repair", {"nodeId": node_id})
        return result.get("ok", False)

    # ── Logging ──────────────────────────────────────────────────────────────

    def _log(self, level: str, msg: str) -> None:
        tag = level.upper()
        self._client.action("log", {"message": f"[{tag}] {msg}", "level": level})
        print(f"[{self._worker_id}] {tag}: {msg}")

    def info(self, msg: str) -> None:
        """Log an info message. Visible in the UI's worker log panel."""
        self._log("info", msg)

    def warn(self, msg: str) -> None:
        self._log("warn", msg)

    def error(self, msg: str) -> None:
        self._log("error", msg)

    # ── Inventory ─────────────────────────────────────────────────────────────

    @property
    def holding(self):
        """Currently held item in the 1-slot internal inventory. None if empty."""
        return self._holding

    @property
    def carrying(self) -> dict:
        """Currently carried resources (legacy). E.g. { 'data': 5 }"""
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
            "class_id": cls.class_id,
            "class_name": cls.class_name,
            "class_icon": cls.class_icon,
            "fields": {
                name: field.schema()
                for name, field in cls._fields.items()
            },
            "docstring": inspect.cleandoc(cls.__doc__ or ""),
        }
