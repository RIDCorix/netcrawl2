"""
netcrawl/items/equipment.py

Concrete item classes. Each is both an ItemField descriptor (used at class level
to declare a deploy-time requirement) and carries default stat attributes that
the server populates at deploy time.

At runtime, these descriptors are replaced by RuntimeItem instances (see runtime.py).
The mine()/mine_and_collect() methods are available on RuntimeItem directly.
"""

from netcrawl.fields import ItemField, GadgetField


class Pickaxe(ItemField):
    """
    Mining tool. Deploy-time: consumes 1 pickaxe from inventory.
    Runtime: provides self.pickaxe.mine() to create drops at current node.

    Usage in unit:
        class Miner(UnitClass):
            pickaxe = Pickaxe()

            def on_loop(self):
                self.move_through(self.to_mine)
                result = self.pickaxe.mine_and_collect()
                self.move_through(self.to_hub)
                self.deposit()
    """

    # Stats (injected from server at deploy time)
    efficiency: float = 1.0   # harvest multiplier

    def __init__(self):
        # Pass the class itself so schema() can reference the type name.
        super().__init__(item_class=None)

    def schema(self) -> dict:
        return {
            "type": "item",
            "field": self._field_name,
            "item_type": "Pickaxe",
            "description": "Requires 1x Pickaxe from inventory",
        }

    def mine(self) -> dict:
        """
        Mine the current node using this pickaxe.
        Creates a drop on the node floor. Use unit.collect() to pick it up.

        This method is available at class-definition time for type hints,
        but the actual implementation at runtime is on RuntimeItem._worker.
        At runtime this descriptor is replaced by a RuntimeItem, so this
        method body is never called.

        Returns: { ok: True, drop: { type: 'ore_chunk', amount: 1 } }
        """
        raise RuntimeError(
            "pickaxe.mine() called on the descriptor — "
            "this means the unit was not initialized correctly. "
            "The runner should have replaced this with a RuntimeItem."
        )

    def mine_and_collect(self) -> dict:
        """
        Convenience: mine() then collect() in one call.
        Returns the collected item, or error dict.
        """
        raise RuntimeError("pickaxe.mine_and_collect() called on descriptor")


class Shield(ItemField):
    """
    Defensive item. Reduces infection chance when passing through infected nodes.
    Craft cost: 30 energy + 20 ore
    """

    defense: float = 0.5  # damage reduction

    def __init__(self):
        super().__init__(item_class=None)

    def schema(self) -> dict:
        return {
            "type": "item",
            "field": self._field_name,
            "item_type": "Shield",
            "description": "Requires 1x Shield from inventory",
        }


class Beacon(ItemField):
    """
    Scanner booster. Increases scan radius.
    Craft cost: 50 data
    """

    radius: int = 2  # extra scan hops

    def __init__(self):
        super().__init__(item_class=None)

    def schema(self) -> dict:
        return {
            "type": "item",
            "field": self._field_name,
            "item_type": "Beacon",
            "description": "Requires 1x Beacon from inventory",
        }


class SensorGadget(GadgetField):
    """
    Advanced graph navigation gadget. Provides pathfinding and exploration
    methods at runtime. No deploy-time cost — just declare on your unit.

    Usage:
        class Scout(UnitClass):
            sensor = SensorGadget()

            def on_loop(self):
                self.sensor.travel_to('r3')        # auto-pathfind
                nearest = self.sensor.find_nearest('resource')
                nodes = self.sensor.explore()
    """

    def __init__(self):
        super().__init__(description="Sensor Gadget — pathfinding & exploration")

    def travel_to(self, node_id: str) -> None:
        raise RuntimeError("sensor.travel_to() called on descriptor — unit not initialized")

    def find_nearest(self, node_type: str) -> str | None:
        raise RuntimeError("sensor.find_nearest() called on descriptor — unit not initialized")

    def explore(self) -> list[dict]:
        raise RuntimeError("sensor.explore() called on descriptor — unit not initialized")
