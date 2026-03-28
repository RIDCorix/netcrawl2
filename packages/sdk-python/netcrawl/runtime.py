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

    def mine(self) -> dict:
        """
        Mine the current node using this pickaxe.
        Creates a drop on the node floor. Use worker.collect() to pick it up.

        Returns: { ok: True, drop: { type: 'ore_chunk', amount: 1 } }
        Fails if: not mineable, node depleted, no pickaxe equipped.
        """
        if self._worker is None:
            raise RuntimeError("Item not properly initialized — _worker is None")
        return self._worker._client.action("mine", {})

    def mine_and_collect(self) -> dict:
        """
        Convenience: mine() then collect() in one call.
        Returns the collected item, or error dict.
        """
        result = self.mine()
        if not result.get("ok"):
            return result
        return self._worker.collect()

    def __repr__(self):
        return f"<{self.item_type} efficiency={self.efficiency}>"
