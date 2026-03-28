"""
Scout: explores the map, logs discovered nodes.
"""
import time
from netcrawl import WorkerClass, Route
from netcrawl.mixins.graph import AdvancedGraphGadget


class Scout(WorkerClass, AdvancedGraphGadget):
    """
    Exploration worker. Finds unknown nodes and logs them.
    No items required.
    """
    patrol_route = Route("Patrol circuit (loop path)")

    def on_startup(self):
        self.discovered = set()
        self.info("Scout online.")

    def on_loop(self):
        nodes = self.explore()
        new = [n for n in nodes if n["id"] not in self.discovered]

        for node in new:
            self.discovered.add(node["id"])
            self.info(f"Discovered: {node['id']} (type={node['type']})")

        self.move_through(self.patrol_route)
        time.sleep(1)
