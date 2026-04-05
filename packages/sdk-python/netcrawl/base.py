"""
netcrawl/base.py

WorkerMeta metaclass and WorkerClass base class.
"""

import inspect
import time
from typing import Optional, List
from netcrawl.fields import WorkerField, ItemField
from netcrawl.models import (
    Drop, CollectResult, DepositResult, DiscardResult, MoveResult,
    ScannedNode, EdgeInfo, NodeInfo, APIRequestModel, TokenValidation,
)


class APIRequest:
    """Represents a pending request from an API node's queue."""

    def __init__(self, data: dict):
        self.id: str = data["id"]
        self.type: str = data["type"]
        self.body: dict = data.get("body", {})
        self.has_token: bool = data.get("has_token", False)
        self.token: str | None = data.get("token")
        self.deadline_tick: int = data.get("deadline_tick", 0)
        self.reward: dict = data.get("reward", {})

    def __repr__(self) -> str:
        auth = "auth" if self.has_token else "NO_TOKEN"
        return f"<APIRequest id={self.id[:8]} type={self.type} {auth}>"


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
    2. User deploys from UI, specifying items and edges/routes
    3. Daemon forks subprocess with env vars
    4. Runner instantiates class, injects field values, calls on_startup()
    5. Runner calls on_loop() in a loop until process is killed

    Internal state:
    - Use regular Python instance variables in on_startup() and on_loop()
    - State persists between on_loop() calls (instance stays alive)

    Example:
        class Collector(WorkerClass):
            pickaxe = Pickaxe()
            to_mine = Edge("Edge to ore mine")
            to_hub = Edge("Return edge")

            def on_startup(self):
                self.trips = 0
                self.info("Collector started!")

            def on_loop(self):
                self.move(self.to_mine)
                self.pickaxe.mine_and_collect()
                self.move(self.to_hub)
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

    def __init__(self, worker_id: str, api_url: str, injected_fields: dict, api_key: str = ""):
        self._worker_id = worker_id
        self._api_url = api_url
        self._current_node = "hub"
        self._inventory = {}
        self._holding = None

        # Import here to avoid circular imports at module load time
        from netcrawl.client import ApiClient
        self._client = ApiClient(api_url=api_url, worker_id=worker_id, api_key=api_key)

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

    def move(self, target) -> MoveResult:
        """
        Universal move method. Accepts any of:

        - Edge object:   self.move(self.edge)
        - Route object:  self.move(self.route)     — walks entire path
        - Edge ID str:   self.move('e1')
        - Node ID str:   self.move('hub')
        - List:          self.move(['e1', 'e3'])

        Returns MoveResult with .ok, .from_node, .to_node
        Raises ValueError if the move fails.
        """
        from netcrawl.runtime import RuntimeEdge, RuntimeRoute

        # RuntimeRoute or list → walk each step
        if isinstance(target, (RuntimeRoute, list)):
            last = None
            for item in target:
                last = self.move(item)
            return last

        # RuntimeEdge → extract edge_id
        if isinstance(target, RuntimeEdge):
            return self._move_edge(target.edge_id)

        # String
        if isinstance(target, str):
            # Edge ID (e1, e2, ...)
            if target.startswith('e') and target[1:].isdigit():
                return self._move_edge(target)
            # Node ID
            result = self._client.action("move", {"targetNodeId": target})
            if result.get("ok"):
                self._current_node = target
                return MoveResult(**result)
            raise ValueError(f"Cannot move to {target}: {result.get('error')}")

        raise TypeError(f"move() expects Edge, Route, str, or list — got {type(target).__name__}")

    def _move_edge(self, edge_id: str) -> MoveResult:
        """Internal: move along a specific edge by ID."""
        data = self._client.action("move_edge", {"edgeId": edge_id})
        result = MoveResult(**data)
        if result.ok:
            self._current_node = result.to_node or self._current_node
            return result
        raise ValueError(f"Cannot move along edge {edge_id}: {result.error}")

    def get_edges(self) -> List[EdgeInfo]:
        """
        Get all edges connected to the current node.

        Returns list of EdgeInfo with .id, .other_node
        """
        result = self._client.action("get_edges", {})
        return [EdgeInfo(**e) for e in result.get("edges", [])]

    # ── Resource actions ─────────────────────────────────────────────────────

    def collect(self) -> CollectResult:
        """
        Pick up a drop from the current node into the 1-slot internal inventory.

        Returns CollectResult with .ok, .item (Drop with .type, .amount)
        Fails if: slot is full or nothing to collect.

        Example:
            result = self.collect()
            if result.ok:
                print(result.item.type)  # "data_fragment" or "bad_data"
        """
        data = self._client.action("collect", {})
        result = CollectResult(**data)
        if result.ok and result.item:
            self._holding = result.item
        return result

    def deposit(self) -> DepositResult:
        """
        Deposit the held item at Hub. Bad data subtracts resources!

        Returns DepositResult with .ok, .deposited (Drop), .penalty, .warning
        """
        data = self._client.action("deposit", {})
        result = DepositResult(**data)
        if result.ok:
            self._holding = None
            self._inventory = {}
        return result

    def discard(self) -> DiscardResult:
        """
        Discard the currently held item without depositing.
        Use this to throw away bad_data drops.

        Returns DiscardResult with .ok, .discarded (Drop)

        Example:
            if self.holding and self.holding.type == "bad_data":
                self.discard()
        """
        data = self._client.action("discard", {})
        result = DiscardResult(**data)
        if result.ok:
            self._holding = None
        return result

    def has_dropped_items(self) -> bool:
        """
        Check if the current node has any dropped items waiting to be collected.

        Returns: True if there are drops on the node floor, False otherwise.

        Example:
            self.mine()
            while self.has_dropped_items():
                item = self.collect()
                if item.get('item', {}).get('type') == 'bad_data':
                    self.discard()
                else:
                    break
        """
        result = self._client.action("has_dropped_items", {})
        return result.get("has_items", False)

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

    def scan(self) -> List[ScannedNode]:
        """
        Scan adjacent nodes.

        Returns list of ScannedNode with .id, .type, .label, .infected
        """
        result = self._client.action("scan", {})
        return [ScannedNode(**n) for n in result.get("nodes", [])]

    # ── Repair ───────────────────────────────────────────────────────────────

    def repair(self, node_id: str) -> bool:
        """
        Repair an infected node. Costs 30 data from game resources.
        Must be adjacent to the target node.
        """
        result = self._client.action("repair", {"nodeId": node_id})
        return result.get("ok", False)

    # ── API Node methods ────────────────────────────────────────────────────────

    def poll_request(self):
        """
        Poll the current API node for the next pending request.
        Must be standing on an api-type node.
        Returns a Request object or None if no requests are pending.

        Example:
            req = self.poll_request()
            if req is None:
                time.sleep(0.5)
                return
        """
        result = self._client.action("api_poll", {})
        if not result.get("ok"):
            raise RuntimeError(result.get("error", "api_poll failed"))
        req_data = result.get("request")
        if req_data is None:
            return None
        return APIRequest(req_data)

    def respond(self, request_id: str, response_data: dict):
        """
        Respond to a request with a 2xx success response.
        Only call this for AUTHENTICATED requests (req.has_token == True).

        Calling this on an unauthenticated request adds +25 infection!

        Example:
            self.respond(req.id, {"result": 42})
        """
        result = self._client.action("api_respond", {
            "requestId": request_id,
            "responseData": response_data,
        })
        if not result.get("ok"):
            raise RuntimeError(result.get("error", "api_respond failed"))
        return result

    def reject(self, request_id: str, status_code: int = 401):
        """
        Reject a request with an error status code (4xx or 5xx).
        Use this for:
          - Unauthenticated requests: reject(req.id, 401)
          - Unknown request type: reject(req.id, 400)
          - Rate limiting: reject(req.id, 429)
          - Server error: reject(req.id, 500)

        Example:
            if not req.has_token:
                self.reject(req.id, 401)
        """
        result = self._client.action("api_reject", {
            "requestId": request_id,
            "statusCode": status_code,
        })
        if not result.get("ok"):
            # Non-fatal: rejection may fail if request is already done
            self.warn(f"reject({status_code}) failed: {result.get('error')}")
        return result

    def validate_token(self, token: str) -> dict:
        """
        Validate a token by querying the auth node you're currently standing on.
        Must be at an auth-type node to call this.
        Returns dict with keys: valid (bool), ttl (int ticks).

        Example:
            self.move("auth_iam1")
            result = self.validate_token(req.token)
            if result["valid"]:
                self.move(api_node_id)
                self.respond(req.id, {...})
        """
        result = self._client.action("validate_token", {"token": token})
        if not result.get("ok"):
            raise RuntimeError(result.get("error", "validate_token failed"))
        return TokenValidation(valid=result.get("valid", False), ttl=result.get("ttl", 0))

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
    def holding(self) -> Optional[Drop]:
        """Currently held item in the 1-slot internal inventory. None if empty.

        Example:
            if self.holding and self.holding.type == "bad_data":
                self.discard()
        """
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
