"""
Guardian — patrol and repair worker

Scans nearby nodes. If infected, travels there and repairs.

Deploy requirements:
  - shield: 1x Shield (from inventory)
  - sensor: SensorGadget (auto-provided, gives travel_to pathfinding)
"""
import time
from netcrawl import WorkerClass, SensorGadget
from netcrawl.items.equipment import Shield


class Guardian(WorkerClass):
    class_name = "Guardian"
    class_id = "guardian"

    shield = Shield()
    sensor = SensorGadget()

    def on_startup(self):
        self.repairs = 0
        self.info("Guardian online, patrolling...")

    def on_loop(self):
        nodes = self.scan()
        infected = [n for n in nodes if n.type == "infected"]

        if infected:
            target = infected[0]
            self.warn(f"Infected node detected: {target.id}")
            self.sensor.travel_to(target.id)
            self.repair(target.id)
            self.repairs += 1
            self.info(f"Repaired {target.id} (total: {self.repairs})")
            self.sensor.travel_to("hub")
        else:
            self.info("Network clean, standing by...")
            time.sleep(5)
