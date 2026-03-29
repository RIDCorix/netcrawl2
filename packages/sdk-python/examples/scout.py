"""
Scout: explores the map, logs discovered nodes.
"""
import time
from netcrawl import UnitClass, Route, SensorGadget


class Scout(UnitClass):
    """
    Exploration unit. Finds unknown nodes and logs them.
    No items required — sensor gadget is auto-provided.
    """
    patrol_route = Route("Patrol circuit (loop path)")
    sensor = SensorGadget()

    def on_startup(self):
        self.discovered = set()
        self.info("Scout online.")

    def on_loop(self):
        nodes = self.sensor.explore()
        new = [n for n in nodes if n["id"] not in self.discovered]

        for node in new:
            self.discovered.add(node["id"])
            self.info(f"Discovered: {node['id']} (type={node['type']})")

        self.move(self.patrol_route)
        time.sleep(1)
