---
name: Ch1 Quest Redesign Plan
description: Chapter 1 quest line redesign — sensor equipment tree, learning progression (method call → dot notation → conditions → operators → while loop → for loop), data mine cluster map design
type: project
---

## Ch1 Quest Redesign (agreed 2026-04-03)

Mainline: setup → method_call → dot_notation → conditions → operators → while_loop → for_loop
Side quests: first_craft, operators (moved to mainline), try_except

### Sensor Equipment Tree (core design decision)
- **BasicSensor** → `list[EdgeInfo]` — see edges only, no node info
- **AdvancedSensor** → `list[AdvancedEdgeInfo]` — edges + target node type (enables `isinstance()`)
- **PathfindingSensor** → `Route` (contains `list[Edge]`) — auto-calculates best path (BFS/Dijkstra wrapped as equipment)
- Ch1 uses BasicSensor + AdvancedSensor only. PathfindingSensor is Ch3 (Networking) reward.

### Key Design Decisions
1. Sensors are **equipment** (class-level fields like Pickaxe), not built-in worker methods
2. **While loop quest**: resource nodes can drop `bad_data`, player uses `while` + `discard()` to filter
3. **For loop quest**: "data mine cluster" — star topology with hub + many resource nodes (capacity=1, 5s refill), placed far from hub on map. Forces `for edge in edges:` pattern.
4. Rewards unlock the NEXT quest's capability (BasicSensor after dot_notation, AdvancedSensor after while_loop)

### New SDK APIs Needed
- `BasicSensor.scan()` → `list[EdgeInfo]`
- `AdvancedSensor.scan()` → `list[AdvancedEdgeInfo]` (with `.target_node`)
- `PathfindingSensor.find_route(target)` → `Route` (with `.edges: list[Edge]`)
- `self.discard(item)` — discard bad drops
- `self.has_dropped_items()` — check for remaining drops on node
- `bad_data` drop type on resource nodes
- `ResourceNode` etc. importable types for `isinstance()` checks

**Why:** Fuse Python syntax learning with game progression — equipment gates knowledge, map layout gates difficulty.
**How to apply:** When implementing Ch1 quests or the sensor SDK, follow this progression strictly.
