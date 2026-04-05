"""
Miner — basic mining worker

Mining loop: move along edge to resource node, mine, collect, move back, deposit.

Deploy requirements:
  - pickaxe: 1x Pickaxe (from inventory)
  - edge:    select one edge connecting Hub to a mine
"""
from netcrawl import WorkerClass, Edge
from netcrawl.items.equipment import Pickaxe


class Miner(WorkerClass):
    class_name = "Miner"
    class_id = "miner"

    pickaxe = Pickaxe()
    edge = Edge("hub ↔ mine")

    def on_loop(self):
        self.move(self.edge)            # hub → mine
        self.pickaxe.mine_and_collect() # mine + pick up

        # Filter bad data
        if self.holding and self.holding.type == "bad_data":
            self.discard()
            self.info("Discarded bad data")
            return

        self.move(self.edge)            # mine → hub
        self.deposit()
