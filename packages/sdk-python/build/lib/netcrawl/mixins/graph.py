"""
netcrawl/mixins/graph.py

AdvancedGraphGadget mixin — adds A* pathfinding and BFS nearest-node lookup.
Unlocked in-game after purchasing the "Graph Algorithm" upgrade.
"""


class AdvancedGraphGadget:
    """
    Mixin that adds advanced pathfinding abilities.
    Unlocked in the game after purchasing the "Graph Algorithm" upgrade.

    Usage:
        class Explorer(WorkerClass, AdvancedGraphGadget):
            def on_loop(self):
                self.travel_to('r3')   # auto-pathfinds
    """

    def travel_to(self, node_id: str) -> None:
        """
        Travel to any node using A* pathfinding via server.
        Automatically moves through intermediate nodes.
        """
        result = self._client.action("findPath", {
            "from": self._current_node,
            "to": node_id,
        })
        path = result.get("path", [])
        if not path:
            raise ValueError(f"No path found from {self._current_node} to {node_id}")
        self.move_through(path)

    def find_nearest(self, node_type: str) -> str | None:
        """
        Find nearest node of given type using BFS.
        Returns node_id or None.
        """
        result = self._client.action("findNearest", {
            "from": self._current_node,
            "nodeType": node_type,
        })
        return result.get("nodeId")

    def explore(self) -> list[dict]:
        """
        Scan a wider radius (requires Beacon item for max range).
        Returns all visible nodes within scan radius.
        """
        result = self._client.action("scan", {"radius": 3})
        return result.get("nodes", [])
