"""
netcrawl/network/route.py

Route declarative field. At deploy time the user specifies a list of node IDs.
At runtime the field value becomes that list.
"""

from netcrawl.fields import RouteField


class Route(RouteField):
    """
    Declarative route field. At deploy time, user specifies a list of node IDs.
    At runtime, becomes a list: ['hub', 'r1', 'relay1']

    Usage:
        class Collector(WorkerClass):
            route1 = Route("Path to energy node")

    In on_loop:
        self.move_through(self.route1)           # moves hub -> r1 -> relay1
        self.move_through(list(reversed(self.route1)))  # moves back
    """
    pass
