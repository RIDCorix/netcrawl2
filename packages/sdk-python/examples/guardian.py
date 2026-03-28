"""
Guardian worker: patrols the network and repairs infected nodes.
Uses AdvancedGraphGadget for automatic pathfinding.
"""
import time
from netcrawl import WorkerClass
from netcrawl.items.equipment import Shield
from netcrawl.mixins.graph import AdvancedGraphGadget


class Guardian(WorkerClass, AdvancedGraphGadget):
    """
    Patrol and repair worker. Requires the AdvancedGraphGadget upgrade.

    Deploy requirements:
    - shield: 1x Shield item (reduces infection damage)
    """
    shield = Shield()

    def on_startup(self):
        self.repairs = 0
        self.info("Guardian online. Starting patrol...")

    def on_loop(self):
        # Scan for infected nodes
        nodes = self.scan()
        infected_nodes = [n for n in nodes if n.get("type") == "infected"]

        if infected_nodes:
            target = infected_nodes[0]
            self.warn(f"Infected node detected: {target['id']}")

            # Travel there and repair
            self.travel_to(target["id"])
            success = self.repair(target["id"])

            if success:
                self.repairs += 1
                self.info(f"Repaired {target['id']} (total repairs: {self.repairs})")
            else:
                self.warn(f"Failed to repair {target['id']}")

            # Return to hub
            self.travel_to("hub")
        else:
            # No infections — idle patrol, scan again in 3s
            self.info("Network clear. Standing by...")
            time.sleep(3)
