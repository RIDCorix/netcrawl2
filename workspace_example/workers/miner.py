"""
Miner -- basic mining worker

Mining loop: move along edge to resource node, mine, collect, move back, deposit.

Deploy requirements:
  - pickaxe: 1x Pickaxe (from inventory)
  - route:   mining route (select an edge)
"""
from netcrawl import WorkerClass, Route
from netcrawl.items.equipment import Pickaxe


class Miner(WorkerClass):
    class_name = "Miner"
    class_id = "miner"

    pickaxe = Pickaxe()
    route = Route("mining route")

    def on_startup(self):
        self.trips = 0
        self.edge_id = self.route if isinstance(self.route, str) else None
        self.info(f"Miner online! Edge: {self.edge_id}")

    def on_loop(self):
        if not self.edge_id:
            self.error("No edge configured")
            import time; time.sleep(3)
            return

        # Move to the other end of the edge (mine side)
        if self._current_node == "hub":
            self.move_edge(self.edge_id)

        # Mine
        self.pickaxe.mine()

        # Collect
        result = self.collect()
        if result.get("ok"):
            drop = result.get("item", {})
            self.info(f"Collected {drop.get('amount')}x {drop.get('type')}")

        # Move back along the same edge
        self.move_edge(self.edge_id)

        # Deposit
        dep = self.deposit()
        if dep.get("ok"):
            self.trips += 1
            self.info(f"Deposited (trip #{self.trips})")
