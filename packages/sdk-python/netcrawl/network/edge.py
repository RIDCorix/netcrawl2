"""
netcrawl/network/edge.py

Edge declarative field. At deploy time the user specifies a single edge (connection
between two nodes). At runtime the field value becomes that edge ID string.
"""

from netcrawl.fields import EdgeField


class Edge(EdgeField):
    """
    Declarative edge field. At deploy time, user selects a single edge.
    At runtime, becomes an edge ID string: 'e5'

    Usage:
        class Collector(WorkerClass):
            mining_edge = Edge("Edge to resource node")

    In on_loop:
        self.move(self.mining_edge)       # moves through that edge
    """
    pass
