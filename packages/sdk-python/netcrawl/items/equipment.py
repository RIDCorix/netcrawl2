"""
netcrawl/items/equipment.py

Concrete item classes. Each is both an ItemField descriptor (used at class level
to declare a deploy-time requirement) and carries default stat attributes that
the server populates at deploy time.
"""

from netcrawl.fields import ItemField


class Pickaxe(ItemField):
    """
    Mining tool. Increases harvest yield.
    Craft cost: 50 ore
    """

    # Stats (injected from server at deploy time)
    efficiency: float = 1.0   # harvest multiplier

    def __init__(self):
        # Pass the class itself so schema() can reference the type name.
        # We use a forward reference resolved after the class is fully defined.
        super().__init__(item_class=None)

    def schema(self) -> dict:
        return {
            "type": "item",
            "field": self._field_name,
            "item_type": "Pickaxe",
            "description": "Requires 1x Pickaxe from inventory",
        }


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
