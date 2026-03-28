"""
netcrawl/items/base.py

Base class for all equippable items.
"""


class Item:
    """Base class for all equippable items."""
    name: str = "Item"
    description: str = ""

    def schema(self) -> dict:
        return {"name": self.name, "description": self.description}
