"""
netcrawl/sensors.py

Data types returned by sensor equipment (BasicSensor, AdvancedSensor).
These are lightweight wrappers around server response data.
"""

from __future__ import annotations
from netcrawl.nodes import BaseNode, create_node


class EdgeInfo:
    """
    Basic edge information returned by BasicSensor.scan().
    Contains only the edge ID — you can move along it, but you don't know
    what's on the other side.

    Attributes:
        edge_id: The edge identifier (e.g. 'e5')
        source_node_id: The node you're currently at
        target_node_id: The node on the other end (ID only, no type info)
    """

    def __init__(self, data: dict):
        self.edge_id: str = data["edge_id"]
        self.source_node_id: str = data["source_node_id"]
        self.target_node_id: str = data["target_node_id"]

    def __repr__(self) -> str:
        return f"<EdgeInfo {self.edge_id}: {self.source_node_id} → {self.target_node_id}>"


class AdvancedEdgeInfo(EdgeInfo):
    """
    Advanced edge information returned by AdvancedSensor.scan().
    Extends EdgeInfo with full target node type info, enabling
    isinstance() checks and attribute access.

    Attributes:
        edge_id: The edge identifier
        source_node_id: The node you're currently at
        target_node_id: The node on the other end
        target_node: Typed node object (ResourceNode, HubNode, etc.)

    Usage:
        edges = self.advanced_sensor.scan()
        for edge in edges:
            if isinstance(edge.target_node, ResourceNode):
                self.move_edge(edge.edge_id)
                self.mine()
    """

    def __init__(self, data: dict, client, worker_id: str):
        super().__init__(data)
        node_data = data.get("target_node_data", {})
        self.target_node: BaseNode = create_node(node_data, client, worker_id)

    def __repr__(self) -> str:
        node_type = type(self.target_node).__name__
        return f"<AdvancedEdgeInfo {self.edge_id}: → {self.target_node_id} ({node_type})>"
