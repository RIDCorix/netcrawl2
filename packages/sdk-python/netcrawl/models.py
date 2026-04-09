"""
netcrawl/models.py

Pydantic models for all SDK response types.
Provides type hints, dot notation, and IDE autocompletion.
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, Any


# ── Item (stacked, Minecraft-style) ─────────────────────────────────────────

class Item(BaseModel):
    """An item stack. Use isinstance() to check type."""
    type: str
    count: int = 1

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)

    @classmethod
    def from_dict(cls, data: dict) -> 'Item':
        """Create the correct subclass based on type."""
        t = data.get('type', '')
        sub = _ITEM_TYPE_MAP.get(t, cls)
        return sub(**data)


class DataFragment(Item):
    """Good data — deposit at Hub for data resources."""
    type: str = 'data_fragment'


class RpShard(Item):
    """Research points shard — deposit at Hub for RP."""
    type: str = 'rp_shard'


class BadData(Item):
    """Corrupted data — depositing this SUBTRACTS resources! Discard it."""
    type: str = 'bad_data'


_ITEM_TYPE_MAP: dict[str, type[Item]] = {
    'data_fragment': DataFragment,
    'rp_shard': RpShard,
    'bad_data': BadData,
}


# ── Action results ──────────────────────────────────────────────────────────

class CollectResult(BaseModel):
    """Result of collect() action."""
    ok: bool = False
    items: list[Item] = Field(default_factory=list)
    holding_count: int = Field(0, alias='holdingCount')
    capacity: int = 1
    error: Optional[str] = None
    reason: Optional[str] = None

    model_config = {'populate_by_name': True}


class DepositResult(BaseModel):
    """Result of deposit() action."""
    ok: bool = False
    deposited: list[Item] = Field(default_factory=list)
    total_data: int = Field(0, alias='totalData')
    penalty: int = 0
    error: Optional[str] = None

    model_config = {'populate_by_name': True}


class DiscardResult(BaseModel):
    """Result of discard() action."""
    ok: bool = False
    discarded: Any = None  # Item or list[Item]
    error: Optional[str] = None


class DropResult(BaseModel):
    """Result of drop() action."""
    ok: bool = False
    dropped: list[Item] = Field(default_factory=list)
    node_id: Optional[str] = Field(None, alias='nodeId')
    error: Optional[str] = None

    model_config = {'populate_by_name': True}


class MineResult(BaseModel):
    """Result of mine() action."""
    ok: bool = False
    item: Optional[Item] = None  # the item created on the node floor
    error: Optional[str] = None


class RepairResult(BaseModel):
    """Result of repair() action."""
    ok: bool = False
    error: Optional[str] = None


class MoveResult(BaseModel):
    """Result of move_edge() action."""
    ok: bool = False
    edge_id: Optional[str] = Field(None, alias='edgeId')
    travel_time: Optional[int] = Field(None, alias='travelTime')
    from_node: Optional[str] = Field(None, alias='from')
    to_node: Optional[str] = Field(None, alias='to')
    error: Optional[str] = None

    model_config = {'populate_by_name': True}


# ── Scan / Node info ────────────────────────────────────────────────────────

class ScannedNode(BaseModel):
    """A node discovered via scan()."""
    id: str
    type: str
    label: str = ''
    infected: bool = False
    adjacent: bool = True


class EdgeInfo(BaseModel):
    """An edge connected to the current node."""
    id: str
    other_node: str = Field('', alias='otherNode')

    model_config = {'populate_by_name': True}


class NodeInfo(BaseModel):
    """Current node info from get_current_node()."""
    id: str
    type: str
    label: str = ''
    is_infected: bool = False
    is_unlocked: bool = True
    upgrade_level: int = 0
    resource_type: Optional[str] = None
    rate: Optional[int] = None
    is_mineable: Optional[bool] = None
    data: dict = Field(default_factory=dict)

    model_config = {'populate_by_name': True}


# ── API Node ────────────────────────────────────────────────────────────────

class APIRequestModel(BaseModel):
    """A pending API request."""
    id: str
    type: str
    body: dict = Field(default_factory=dict)
    has_token: bool = Field(False, alias='hasToken')
    token: Optional[str] = None
    deadline_tick: int = Field(0, alias='deadlineTick')
    reward: dict = Field(default_factory=dict)

    model_config = {'populate_by_name': True}


class TokenValidation(BaseModel):
    """Result of validate_token()."""
    valid: bool = False
    ttl: int = 0


# ── Compute Node ────────────────────────────────────────────────────────────

class ComputeTask(BaseModel):
    """A compute puzzle task."""
    task_id: str = Field('', alias='taskId')
    parameters: dict = Field(default_factory=dict)
    hint: str = ''
    difficulty: str = 'easy'

    model_config = {'populate_by_name': True}
