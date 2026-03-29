"""
netcrawl/network/route.py

Route declarative field. At deploy time the user specifies a sequence of
connected edges forming a path. This is an advanced feature — the worker class
must be equipped with a route chip.

At runtime the field value becomes a list of edge IDs.
"""

from netcrawl.fields import RouteField


class Route(RouteField):
    """
    Declarative route field. At deploy time, user specifies a sequence of
    connected edges (a path). Requires an advanced route chip equipped.
    At runtime, becomes a list of edge IDs: ['e1', 'e3', 'e5']

    Usage:
        class Collector(WorkerClass):
            to_mine = Route("Path from Hub to resource node")

    In on_loop:
        self.move(self.to_mine)                          # moves through entire route
        self.move(list(reversed(self.to_mine)))           # moves back
    """
    pass
