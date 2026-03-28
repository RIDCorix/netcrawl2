"""
netcrawl/nodes.py

Typed node objects returned by WorkerClass.get_current_node().
Each node type exposes type-specific methods.
"""

from __future__ import annotations
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from netcrawl.client import ApiClient


class Edge:
    """Represents a connection from the current node to another."""
    def __init__(self, id: str, other_node: str):
        self.id = id
        self.other_node = other_node

    def __repr__(self):
        return f"Edge(id={self.id!r}, other_node={self.other_node!r})"


class BaseNode:
    """Base class for all node types. Provides common properties."""

    def __init__(self, info: dict, client: 'ApiClient', worker_id: str):
        self._info = info
        self._client = client
        self._worker_id = worker_id
        self.id: str = info['id']
        self.type: str = info['type']
        self.label: str = info.get('label', '')
        self.data: dict = info.get('data', {})
        self.edges: list[Edge] = [Edge(e['id'], e['otherNode']) for e in info.get('edges', [])]

    @property
    def is_unlocked(self) -> bool:
        return bool(self.data.get('unlocked'))

    @property
    def is_infected(self) -> bool:
        return bool(self.data.get('infected'))

    @property
    def upgrade_level(self) -> int:
        return self.data.get('upgradeLevel', 0)

    def __repr__(self):
        return f"{self.__class__.__name__}(id={self.id!r}, label={self.label!r})"


class HubNode(BaseNode):
    """The central hub node."""
    pass


class ResourceNode(BaseNode):
    """A resource-producing node (energy, ore, data)."""

    @property
    def resource_type(self) -> str:
        return self.data.get('resource', '')

    @property
    def rate(self) -> int:
        return self.data.get('rate', 0)

    @property
    def is_mineable(self) -> bool:
        return bool(self.data.get('mineable'))

    def mine(self) -> dict:
        """Mine this resource node. Requires a pickaxe equipped on the worker.
        Creates a drop on the ground that can be collected.

        Returns: { ok, drop: { type, amount } }
        """
        result = self._client.action("compute_mine", {})
        # Use the existing mine action via pickaxe
        # Note: mining is done through the pickaxe equipment, not the node directly
        raise NotImplementedError(
            "Mining is done through equipment: self.pickaxe.mine(). "
            "The ResourceNode provides info about the node."
        )


class RelayNode(BaseNode):
    """A network relay node."""
    pass


class ComputeNode(BaseNode):
    """A compute puzzle node. Workers can request puzzles and submit answers."""

    @property
    def difficulty(self) -> str:
        return self.data.get('difficulty', 'easy')

    @property
    def reward_resource(self) -> str:
        return self.data.get('rewardResource', 'data')

    @property
    def solve_count(self) -> int:
        return self.data.get('solveCount', 0)

    def get_task(self) -> 'ComputeTask':
        """Request a puzzle from this compute node.

        Returns a ComputeTask with task_id, parameters, hint, and difficulty.
        Raises ValueError if on cooldown or not at a compute node.

        Example:
            node = self.get_current_node()
            task = node.get_task()
            answer = task.parameters['a'] + task.parameters['b']
            result = node.submit(task.task_id, answer)
        """
        result = self._client.action("compute", {})
        if not result.get("ok"):
            raise ValueError(f"get_task() failed: {result.get('error')}")
        return ComputeTask(
            task_id=result['taskId'],
            parameters=result['params'],
            hint=result.get('hint', ''),
            difficulty=result.get('difficulty', 'easy'),
        )

    def submit(self, task_id: str, answer: Any) -> dict:
        """Submit an answer to a compute puzzle.

        Returns: { ok, correct: bool, reward?: { type, amount } }
        If incorrect: { ok, correct: False, expected: ..., got: ... }
        """
        return self._client.action("submit", {"taskId": task_id, "answer": answer})


class ComputeTask:
    """A puzzle task from a ComputeNode."""

    def __init__(self, task_id: str, parameters: dict, hint: str, difficulty: str):
        self.task_id = task_id
        self.parameters = parameters
        self.hint = hint
        self.difficulty = difficulty

    def __repr__(self):
        return f"ComputeTask(id={self.task_id!r}, hint={self.hint!r})"


class LockedNode(BaseNode):
    """An unknown locked node."""
    pass


class InfectedNode(BaseNode):
    """An infected node."""
    pass


# ── Factory ──────────────────────────────────────────────────────────────────

NODE_TYPE_MAP = {
    'hub': HubNode,
    'resource': ResourceNode,
    'relay': RelayNode,
    'compute': ComputeNode,
    'locked': LockedNode,
    'infected': InfectedNode,
}


def create_node(info: dict, client: 'ApiClient', worker_id: str) -> BaseNode:
    """Factory: create the appropriate typed node from server info."""
    node_type = info.get('type', '')
    cls = NODE_TYPE_MAP.get(node_type, BaseNode)
    return cls(info, client, worker_id)
