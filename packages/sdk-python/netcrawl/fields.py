"""
netcrawl/fields.py

Declarative field descriptors for WorkerClass.
These are used at class definition time to describe deploy-time requirements.
At runtime the actual values are injected as instance attributes.
"""


class WorkerField:
    """Base class for all declarative worker fields."""
    _field_name: str = ""

    def __set_name__(self, owner, name):
        self._field_name = name

    def schema(self) -> dict:
        """Returns the deploy-time schema for UI display."""
        raise NotImplementedError


class ItemField(WorkerField):
    """
    Declares that deploying this worker consumes one of this item from inventory.

    Usage:
        class Collector(WorkerClass):
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


class RouteField(WorkerField):
    """
    Declares that deploying this worker requires specifying a route (list of node IDs).

    Usage:
        class Collector(WorkerClass):
            route1 = Route()   # User picks a path in the UI at deploy time

    At runtime, self.route1 is a list of node IDs: ['hub', 'r1', 'relay1']
    """

    def __init__(self, description: str = ""):
        self._description = description

    def schema(self) -> dict:
        return {
            "type": "route",
            "field": self._field_name,
            "description": self._description or f"Route for {self._field_name}",
        }
