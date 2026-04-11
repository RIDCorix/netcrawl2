"""
netcrawl/runtime.py

Runtime proxy objects for equipped items and gadgets.
These are created by the runner when injecting fields into a worker instance.
"""


class RuntimeGadget:
    """
    Base runtime proxy for gadgets. Has a _worker back-reference
    that gets set during worker initialization.
    """

    def __init__(self):
        self._worker = None

    def __repr__(self):
        return f"<{self.__class__.__name__}>"


class RuntimeSensorGadget(RuntimeGadget):
    """
    Runtime proxy for SensorGadget. Provides pathfinding and exploration.
    """

    def travel_to(self, node_id: str) -> None:
        """
        Travel to any node using server-side pathfinding.
        Automatically moves through intermediate nodes.
        """
        result = self._worker._client.action("findPath", {
            "from": self._worker._current_node,
            "to": node_id,
        })
        path = result.get("path", [])
        if not path:
            raise ValueError(f"No path from {self._worker._current_node} to {node_id}")
        self._worker.move_through(path)

    def find_nearest(self, node_type: str) -> str | None:
        """
        Find nearest node of given type using BFS.
        Returns node_id or None.
        """
        result = self._worker._client.action("findNearest", {
            "from": self._worker._current_node,
            "nodeType": node_type,
        })
        return result.get("nodeId")

    def explore(self) -> list[dict]:
        """
        Scan a wider radius. Returns all visible nodes within scan radius.
        """
        result = self._worker._client.action("scan", {"radius": 3})
        return result.get("nodes", [])


class RuntimeBasicSensor(RuntimeGadget):
    """
    Runtime proxy for BasicSensor. Calls server scan_edges action.
    Returns list[EdgeInfo] — edges with basic info only.
    """

    def scan(self) -> list:
        """
        Scan adjacent edges from current node.
        Returns: list[EdgeInfo] with edge_id, source_node_id, target_node_id.
        """
        from netcrawl.sensors import EdgeInfo
        result = self._worker._client.action("scan_edges", {})
        edges_data = result.get("edges", [])
        return [EdgeInfo(e) for e in edges_data]


class RuntimeAdvancedSensor(RuntimeGadget):
    """
    Runtime proxy for AdvancedSensor. Calls server scan_edges_advanced action.
    Returns list[AdvancedEdgeInfo] — edges with full target node type info.
    """

    def scan(self) -> list:
        """
        Scan adjacent edges with node info from current node.
        Returns: list[AdvancedEdgeInfo] with edge_id + target_node (typed).
        """
        from netcrawl.sensors import AdvancedEdgeInfo
        result = self._worker._client.action("scan_edges_advanced", {})
        edges_data = result.get("edges", [])
        return [
            AdvancedEdgeInfo(e, self._worker._client, self._worker._worker_id)
            for e in edges_data
        ]


class RuntimeEdge:
    """
    Runtime proxy for an Edge field. Injected at deploy time with edge metadata.

    Attributes:
        edge_id: The edge identifier (e.g. 'e1')
        source: Source node ID
        target: Target node ID

    Can be passed directly to worker.move():
        self.move(self.edge)  # works!
    """

    def __init__(self, edge_id: str, source: str = '', target: str = ''):
        self.edge_id = edge_id
        self.source = source
        self.target = target

    def __str__(self) -> str:
        return self.edge_id

    def __repr__(self) -> str:
        return f"<Edge {self.edge_id}: {self.source} ↔ {self.target}>"


class RuntimeRoute:
    """
    Runtime proxy for a Route field. Injected at deploy time with edge list.

    Attributes:
        edges: List[RuntimeEdge] — the edges in order
        nodes: List[str] — the node IDs in path order

    Iterable — yields RuntimeEdge objects:
        for edge in self.route:
            self.move(edge)

    Reversible:
        for edge in reversed(self.route):
            self.move(edge)
    """

    def __init__(self, edge_ids: list[str], edge_metadata: list[dict] | None = None):
        self._edge_ids = edge_ids
        if edge_metadata:
            self._edges = [
                RuntimeEdge(m.get('id', eid), m.get('source', ''), m.get('target', ''))
                for eid, m in zip(edge_ids, edge_metadata)
            ]
        else:
            self._edges = [RuntimeEdge(eid) for eid in edge_ids]

    @property
    def edges(self) -> list[RuntimeEdge]:
        """List of edges in the route, in order."""
        return list(self._edges)

    @property
    def nodes(self) -> list[str]:
        """List of node IDs in the path, in order (derived from edges)."""
        if not self._edges:
            return []
        result = []
        for e in self._edges:
            if e.source and (not result or result[-1] != e.source):
                result.append(e.source)
            if e.target:
                result.append(e.target)
        return result

    def __iter__(self):
        return iter(self._edges)

    def __reversed__(self):
        return reversed(self._edges)

    def __len__(self) -> int:
        return len(self._edges)

    def __repr__(self) -> str:
        nodes = self.nodes
        return f"<Route {' → '.join(nodes) if nodes else self._edge_ids}>"


class RuntimeItem:
    """
    Runtime proxy for equipped items. Wraps the injected item metadata.
    Created by runner.py when a worker class has an ItemField that gets injected
    with a dict from NETCRAWL_INJECTED.
    """

    def __init__(self, metadata: dict):
        self.item_type = metadata.get('itemType', '')
        self.efficiency = metadata.get('efficiency', 1.0)
        self._worker = None  # set after WorkerClass.__init__ by runner

    def mine(self):
        """
        Mine the current node using this pickaxe.
        Creates items on the node floor. Use worker.collect() to pick them up.

        Returns MineResult with .ok, .item, .error.
        Raises RuntimeError if the current node cannot be mined (e.g. you called
        mine() while standing at the hub or a non-resource node).
        """
        if self._worker is None:
            raise RuntimeError("Item not properly initialized — _worker is None")
        from netcrawl.models import MineResult
        self._worker.debug("mine()")
        data = self._worker._client.action("mine", {})
        result = MineResult(**data)
        if not result.ok:
            # Surface mining failures as exceptions so silent hub-mining bugs
            # are impossible to miss. The server returns messages like
            # "Node is not mineable" or "Node is depleted".
            where = self._worker._current_node or "unknown"
            raise RuntimeError(f"mine() failed at {where}: {result.error}")
        return result

    def mine_and_collect(self):
        """
        Convenience: mine() then collect() in one call.
        Returns CollectResult.
        Raises RuntimeError if mine() fails (e.g. called at a non-mineable node).
        """
        self.mine()  # raises on failure
        return self._worker.collect()

    def __repr__(self):
        return f"<{self.item_type} efficiency={self.efficiency}>"
