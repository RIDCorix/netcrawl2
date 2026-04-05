"""
Scout — exploration worker

Travels along a route, scanning and logging discovered nodes.

Deploy requirements:
  - route:  patrol route (click nodes to build path)
  - sensor: SensorGadget (auto-provided)
"""
import time
from netcrawl import WorkerClass, Route, SensorGadget


class Scout(WorkerClass):
    class_name = "Scout"
    class_id = "scout"

    route = Route("patrol route")
    sensor = SensorGadget()

    def on_startup(self):
        self.discovered = set()
        self.info("Scout online!")

    def on_loop(self):
        nodes = self.sensor.explore()
        for node in nodes:
            if node.id not in self.discovered:
                self.discovered.add(node.id)
                self.info(f"Discovered: {node.id} ({node.type})")

        # Walk the patrol route
        for edge in self.route:
            self.move(edge)

        time.sleep(1)
