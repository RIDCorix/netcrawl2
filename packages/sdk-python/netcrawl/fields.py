"""
netcrawl/fields.py

Declarative field descriptors for UnitClass.
These are used at class definition time to describe deploy-time requirements.
At runtime the actual values are injected as instance attributes.
"""


class UnitField:
    """Base class for all declarative unit fields."""
    _field_name: str = ""

    def __set_name__(self, owner, name):
        self._field_name = name

    def schema(self) -> dict:
        """Returns the deploy-time schema for UI display."""
        raise NotImplementedError


class ItemField(UnitField):
    """
    Declares that deploying this unit consumes one of this item from inventory.

    Usage:
        class Collector(UnitClass):
            pickaxe = Pickaxe()   # Consumes 1 pickaxe from inventory at deploy time

    At runtime, self.pickaxe is an ItemInstance with stats (e.g. pickaxe.efficiency)
    """

    def __init__(self, item_class=None):
        self._item_class = item_class  # The Item subclass (e.g. Pickaxe)

    def schema(self) -> dict:
        item_name = self._item_class.__name__ if self._item_class else "any"
        return {
            "type": "item",
            "field": self._field_name,
            "item_type": item_name,
            "description": f"Requires 1x {item_name} from inventory",
        }


class GadgetField(UnitField):
    """
    Declares a gadget that provides runtime methods but requires no deploy-time input.
    Unlike ItemField, no item is consumed from inventory.
    At runtime, the field is replaced with a runtime proxy that has a _unit reference.

    Usage:
        class Scout(UnitClass):
            sensor = SensorGadget()   # No deploy-time cost
            # At runtime: self.sensor.travel_to('r3')
    """

    def __init__(self, description: str = ""):
        self._description = description

    def schema(self) -> dict:
        return {
            "type": "gadget",
            "field": self._field_name,
            "description": self._description or f"Gadget: {self._field_name}",
        }


class EdgeField(UnitField):
    """
    Declares that deploying this unit requires specifying an edge (a single connection
    between two nodes).

    Usage:
        class Collector(UnitClass):
            path = Edge("Mining edge")   # User picks a single edge in the UI at deploy time

    At runtime, self.path is an edge ID string: 'e5'
    The unit can then call self.move(self.path) to traverse that edge.
    """

    def __init__(self, description: str = ""):
        self._description = description

    def schema(self) -> dict:
        return {
            "type": "edge",
            "field": self._field_name,
            "description": self._description or f"Edge for {self._field_name}",
        }


class RouteField(UnitField):
    """
    Declares that deploying this unit requires specifying a route (a sequence of
    connected edges forming a path). This is an advanced feature — the unit class
    must be equipped with a route chip.

    Usage:
        class Collector(UnitClass):
            to_mine = Route("Path from Hub to resource node")

    At runtime, self.to_mine is a list of edge IDs: ['e1', 'e3', 'e5']
    The unit can then call self.move(self.to_mine) to traverse the entire route.
    """

    def __init__(self, description: str = ""):
        self._description = description

    def schema(self) -> dict:
        return {
            "type": "route",
            "field": self._field_name,
            "description": self._description or f"Route for {self._field_name}",
        }
