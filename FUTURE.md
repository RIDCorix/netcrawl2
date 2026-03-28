# Future Ideas

## Launcher Chip (Advanced Worker Spawning)

A high-tier chip that allows workers to spawn child workers from within their `on_loop()`.

### Concept

```python
class Spawner(WorkerClass):
    launcher = Launcher()  # special chip/equipment

    def on_loop(self):
        child = self.launcher.deploy("miner", node="r2", equipment={"pickaxe": "basic"})
        self.info(f"Spawned child: {child.id}")
        time.sleep(30)
```

Workers equipped with a Launcher chip can programmatically deploy other workers at runtime, enabling:
- Auto-scaling based on resource availability
- Fan-out patterns for parallel mining
- Self-replicating network defense

### New Achievements (Category: Algorithms)

| ID | Name | Description | Condition |
|----|------|-------------|-----------|
| `im_a_dad` | I'm a Dad! | Successfully spawn a child worker from a running worker | First successful `launcher.deploy()` call |
| `guilty` | Guilty | Kill a child worker you spawned | First `launcher.kill(child_id)` call |
| `fanout` | FANOUT | Spawn 10+ workers from a single parent worker in one session | `launcher.deploy()` called 10 times by same worker without restart |

### Implementation Notes

- Launcher is a late-game chip, requires quest completion (Chapter 5+)
- Child workers inherit the parent's routes but get their own equipment
- Parent tracks child PIDs, can suspend/kill children
- Resource cost per spawn (energy drain)
- Max children per parent (prevents infinite recursion)
- Children report status back to parent via API

### Quest: "Recursive Thinking" (Chapter 6 side quest)

- Prerequisite: Complete "Design Patterns"
- Objective: Deploy a worker that spawns 3 child workers
- Reward: Launcher Chip (legendary), "I'm a Dad!" achievement auto-unlocks

## Other Future Ideas

### Infection Events
- Periodic infection waves that spread from edge nodes
- Players must have Guardians deployed to defend
- Failed defense = node downgrade

### Multiplayer / Competitive
- Multiple players on the same network
- Race to control resource nodes
- PvP: infection attacks on opponent's nodes

### Worker Marketplace
- Share worker classes with other players
- Rate and review workers
- Import community workers

### Visual Worker Editor
- Drag-and-drop node editor for worker logic
- No coding required for basic workers
- Exports to Python for advanced users
