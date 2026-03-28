"""
Collector worker: harvests ore from the Ore Mine and deposits at Hub.
Requires: 1x Pickaxe, 2x Route (to mine, return path)
"""
from netcrawl import WorkerClass, Route
from netcrawl.items.equipment import Pickaxe


class Collector(WorkerClass):
    """
    Basic mining worker. Travels to a resource node, harvests, returns to hub.

    Deploy requirements:
    - pickaxe: 1x Pickaxe item from inventory
    - to_mine: Route from Hub to the resource node
    - to_hub: Route from resource node back to Hub
    """
    pickaxe = Pickaxe()
    to_mine = Route("Path from Hub to resource node")
    to_hub = Route("Return path from resource node to Hub")

    def on_startup(self):
        self.trips = 0
        self.total_collected = 0
        self.info(f"Collector online. Route: {self.to_mine} -> {self.to_hub}")

    def on_loop(self):
        # Go to resource node
        self.move_through(self.to_mine)

        # Harvest
        result = self.collect()
        harvested = result.get("harvested", {})
        amount = sum(harvested.values())

        if amount > 0:
            self.info(f"Harvested: {harvested}")
            self.total_collected += amount

        # Return to hub
        self.move_through(self.to_hub)

        # Deposit
        self.deposit()

        self.trips += 1
        if self.trips % 10 == 0:
            self.info(f"Milestone: {self.trips} trips, {self.total_collected} total resources")
