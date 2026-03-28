/**
 * Step-by-step guide content for each quest.
 * Content uses Markdown with fenced code blocks.
 */

import type { GuideStep } from './questDefinitions.js';

export const QUEST_GUIDES: Record<string, GuideStep[]> = {
  q_hello_world: [
    { title: 'Clone the Repository', content: `Open your terminal and navigate to the NetCrawl workspace:

\`\`\`bash
cd workspace/
\`\`\`

This folder contains your worker code. The \`workspace_example/\` folder has starter templates you can reference.` },

    { title: 'Understanding Workers', content: `Workers are Python classes that automate tasks on the network. Each worker has:

- \`on_startup()\` -- Called once when deployed
- \`on_loop()\` -- Called repeatedly to do work

Workers can move between nodes, mine resources, collect drops, and deposit them at the Hub.` },

    { title: 'Write Your First Worker', content: `Open \`workspace/workers/\` and create a new file, or modify an existing one.

A minimal worker looks like:

\`\`\`python
from netcrawl import WorkerClass

class HelloWorker(WorkerClass):
    class_name = "Hello"
    class_id = "hello"

    def on_startup(self):
        self.info("Hello, World!")

    def on_loop(self):
        self.info("I am alive!")
        import time
        time.sleep(5)
\`\`\`` },

    { title: 'Register in main.py', content: `Open \`workspace/main.py\` and register your worker:

\`\`\`python
from workers.hello import HelloWorker

app.register(HelloWorker)
\`\`\`

This tells the code server about your new worker class.` },

    { title: 'Start the Code Server', content: `In the \`workspace/\` directory, run:

\`\`\`bash
uv run main.py
\`\`\`

You should see:

\`\`\`
[NetCrawl] Registered: Hello (id=hello)
[NetCrawl] Code server running...
\`\`\`

The code server connects to the game server and registers your worker classes.` },

    { title: 'Deploy from the UI', content: `In the game UI:

1. Click on the **Hub** node
2. Click **"Deploy Worker"**
3. Select your worker class from the dropdown
4. Click **"Deploy"**

Your worker will appear as a colored dot on the Hub node. Check the **Workers panel** (bottom-left) to see its status and logs.` },
  ],

  q_first_harvest: [
    { title: 'Understanding Resources', content: `The network has 3 resource types:

- **Energy** (yellow) -- Powers everything
- **Ore** (purple) -- Used for crafting
- **Data** (blue) -- Advanced recipes

Resource nodes produce drops when mined. You need a **Pickaxe** to mine.` },

    { title: 'Unlock a Resource Node', content: `Click on the **Ore Mine** node. If it is locked, click **"Unlock"** and spend the required Energy.

Once unlocked, the node shows its production rate (e.g., \`+3/harvest\`).` },

    { title: 'Write a Mining Worker', content: `Modify your worker to mine:

\`\`\`python
from netcrawl import WorkerClass, Route
from netcrawl.items.equipment import Pickaxe

class Miner(WorkerClass):
    class_name = "Miner"
    class_id = "miner"

    pickaxe = Pickaxe()
    route = Route("mining route")

    def on_loop(self):
        self.move(self.mine_node)
        self.pickaxe.mine()
        self.collect()
        self.move("hub")
        self.deposit()
\`\`\`

The \`mine()\` action creates a drop on the node.` },

    { title: 'Deploy with Equipment', content: `When deploying a Miner, you need to:

1. **Select the route** -- click an edge on the map
2. **Equip a Pickaxe** -- drag from inventory to the equipment slot

The worker will use these during operation.` },
  ],

  q_bring_it_home: [
    { title: 'The Deposit Cycle', content: `After mining, your worker holds a drop item. To convert it to resources:

\`\`\`python
self.collect()      # picks up the drop from the node
self.move("hub")    # travel back to Hub
self.deposit()      # converts the drop to resources
\`\`\`

- \`ore_chunk\` becomes **Ore**
- \`energy_crystal\` becomes **Energy**
- \`data_shard\` becomes **Data**` },

    { title: 'Complete Mining Loop', content: `A complete mining loop:

\`\`\`python
def on_loop(self):
    self.move(self.mine_node)    # go to mine
    self.pickaxe.mine()          # create drop
    self.collect()               # pick up drop
    self.move("hub")             # return home
    self.deposit()               # convert to resources
\`\`\`` },

    { title: 'Monitor Progress', content: `Watch the **resource bar** at the top of the screen. When your worker deposits, the resource count increases.

Click on your **worker dot** to see its logs and current status in the right panel.` },
  ],

  q_expand_network: [
    { title: 'Node Types', content: `The network has several node types:

| Type | Description |
|------|-------------|
| **Hub** | Your base, always unlocked |
| **Resource** | Produces energy, ore, or data |
| **Relay** | Network infrastructure |
| **Locked** | Unknown, costs resources to unlock |` },

    { title: 'Unlock a Node', content: `Click on any locked node to see its unlock cost. Spend the required resources to unlock it.

Unlocking nodes expands your network and gives workers more places to operate.

**Reward:** Completing this quest grants a permanent **+5% harvest speed** bonus.` },
  ],

  q_variable_types: [
    { title: 'Three Resource Types', content: `Just like Python has \`int\`, \`str\`, and \`float\`, NetCrawl has three resource types:

| Type | Python Analogy | Color |
|------|---------------|-------|
| Energy | \`int\` | Yellow |
| Ore | \`str\` | Purple |
| Data | \`float\` | Blue |

Deploy miners to each resource type to collect all three.` },
  ],

  q_for_loop: [
    { title: 'Understanding Loops', content: `Your worker's \`on_loop()\` method is called repeatedly -- it's already a loop!

\`\`\`python
# This is what the runner does:
while not shutdown:
    worker.on_loop()   # called again and again
\`\`\`

Each call to \`on_loop()\` is one iteration. Your miner mines, collects, deposits, and then the loop repeats.` },
    { title: 'Watch the Loop', content: `Let your miner run and watch the logs. Each cycle is one loop iteration:

\`\`\`
[INFO] mine -> collect -> deposit  # iteration 1
[INFO] mine -> collect -> deposit  # iteration 2
[INFO] mine -> collect -> deposit  # iteration 3
...
\`\`\`

Mine **5 times** to see the loop in action. Check the worker logs to track progress.` },
  ],

  q_batch_processing: [
    { title: 'Iteration at Scale', content: `A for loop processes items one at a time. Your miners do the same:

\`\`\`python
while True:
    mine()       # create drop
    collect()    # pick up
    deposit()    # deliver
    # repeat...
\`\`\`

Let your miners run until they have mined **10 times** total. Check worker logs to track progress.

**Reward:** Unlocks the **Scanner** recipe for crafting.` },
  ],

  q_accumulator: [
    { title: 'Accumulating State', content: `The accumulator pattern:

\`\`\`python
total = 0
for item in items:
    total += item
\`\`\`

Your ore counter works the same way. Each deposit adds to the total. Reach **100 ore** to complete this quest.

**Tips to speed up:**
- Deploy multiple miners
- Upgrade the Ore Mine node
- Install harvest speed chips` },
  ],

  q_list_comprehension: [
    { title: 'Concise Code', content: `Python list comprehensions:

\`\`\`python
items = [craft(m) for m in materials]
\`\`\`

Craft **3 items** using the Inventory panel (press \`E\`). You can craft pickaxes, shields, and beacons.` },
  ],

  q_error_handling: [
    { title: 'Try / Except', content: `Workers can crash. When they do, the error is logged and you can redeploy.

\`\`\`python
try:
    risky_operation()
except Exception as e:
    log(f"Error: {e}")
    recover()
\`\`\`

Deploy **5 workers** total to learn resilience through practice.` },
  ],

  q_graph_theory: [
    { title: 'Graphs: Nodes and Edges', content: `A graph \`G = (V, E)\` consists of vertices (nodes) and edges (connections).

Your network is a graph. Each node is a vertex, each connection is an edge. Unlock **3 nodes** to expand it.

Different topologies affect worker routing. Hub-and-spoke, mesh, tree -- each has tradeoffs.` },
  ],

  q_routing: [
    { title: 'Shortest Path', content: `Routers use BFS/Dijkstra to find shortest paths:

\`\`\`python
def bfs(start, end):
    queue = [[start]]
    while queue:
        path = queue.pop(0)
        if path[-1] == end:
            return path
\`\`\`

Diversify: deposit both **ore** and **energy** (10+ each).` },
  ],

  q_relay_network: [
    { title: 'Building Redundancy', content: `Relay nodes provide alternative paths. If one path is blocked (infection), workers can route around it.

Unlock **4 nodes** total to build a resilient network.

**Reward:** Unlocks the **Signal Booster** recipe.` },
  ],

  q_dns_lookup: [
    { title: 'Exploring the Network', content: `DNS resolves names to addresses. Workers use \`scan()\` to discover what is around:

\`\`\`python
nodes = self.scan()
for node in nodes:
    print(f"{node['id']}: {node['type']}")
\`\`\`

Deploy **6 workers** total to explore the network from multiple vantage points.` },
  ],

  q_if_statement: [
    { title: 'Conditional Logic', content: `\`\`\`python
if node.infected:
    repair(node)
else:
    continue
\`\`\`

Deploy a **Guardian** worker to repair infected nodes. Guardians need a **Shield** equipped.

1. Craft a Shield in Inventory (\`E\`)
2. Deploy a Guardian to the Hub
3. The Guardian will scan and repair automatically` },
  ],

  q_firewall: [
    { title: 'Defense in Depth', content: `Firewalls use rules to filter traffic. Chips add defensive layers to your nodes.

**Steps:**
1. Open Inventory (\`E\`) and buy a **chip pack**
2. Open the pack to get random chips
3. Click a node with chip slots
4. Scroll to **Chip Slots** and insert chips

Install **2 chips** to complete this quest.` },
  ],

  q_antivirus: [
    { title: 'Pattern Matching', content: `Antivirus software scans for known patterns. Your Guardian does the same:

\`\`\`python
infected = [n for n in self.scan() if n["type"] == "infected"]
if infected:
    self.travel_to(infected[0]["id"])
    self.repair(infected[0]["id"])
\`\`\`

Repair **3 infected nodes** to earn the unique **Antivirus Module**.` },
  ],

  q_redundancy: [
    { title: 'Fault Tolerance', content: `Redundant systems survive failures:

\`\`\`python
workers = [deploy() for _ in range(8)]
# If one crashes, 7 others keep working
\`\`\`

Deploy **8 workers** total to build a fault-tolerant workforce.` },
  ],

  q_profiling: [
    { title: 'Measure First', content: `Never optimize without measuring. Node upgrades show measurable improvement.

**How to upgrade:**
1. Click an unlocked node
2. Scroll to the **Upgrade** section
3. Pay the resource cost

Each level provides different bonuses:
- **Level 1:** Better production rate
- **Level 2:** More chip slots
- **Level 3:** Auto-collect drops

**Reward:** Unlocks the **Overclock Kit** recipe.` },
  ],

  q_caching: [
    { title: 'Memoization', content: `\`\`\`python
cache = {}
def expensive(n):
    if n not in cache:
        cache[n] = compute(n)
    return cache[n]
\`\`\`

Auto-collect (Level 3 upgrade) caches resources without manual worker trips. Max out a node upgrade to **Level 3**.` },
  ],

  q_big_o: [
    { title: 'Algorithm Complexity', content: `\`\`\`
O(1) < O(log n) < O(n) < O(n²)
\`\`\`

Open **5 chip packs** and observe the rarity distribution:
- **Common** chips are O(1) -- easy to get
- **Rare** chips are O(n) -- takes effort
- **Legendary** chips are O(n!) -- extremely rare` },
  ],

  q_memory_mgmt: [
    { title: 'Resource Management', content: `Efficient programs manage memory carefully:

\`\`\`python
# Bad: unbounded growth
data = []
while True:
    data.append(read())

# Good: bounded buffer
data = collections.deque(maxlen=100)
\`\`\`

Accumulate **200+ ore** and **200+ energy** to prove your efficiency.

**Reward:** The unique **Memory Allocator** pickaxe (3.0x efficiency).` },
  ],

  q_design_patterns: [
    { title: 'Software Architecture', content: `Design patterns are reusable solutions:

| Pattern | NetCrawl Example |
|---------|-----------------|
| **Factory** | Crafting system |
| **Observer** | WebSocket updates |
| **Strategy** | Different worker classes |
| **Decorator** | Chip effects on nodes |

Unlock **ALL nodes** and craft **ALL recipes** to demonstrate mastery.

**Reward:** +25% resource rate + legendary Overclock chip.` },
  ],

  q_full_stack: [
    { title: 'Full Stack Mastery', content: `A full stack developer knows it all: frontend, backend, databases, deployment.

In NetCrawl, that means:
- **20+ workers** deployed (massive workforce)
- **500+ ore** deposited (sustained production)

\`\`\`python
# You've mastered:
# - Worker classes (Python OOP)
# - Event loops (on_loop)
# - State management (resources)
# - Networking (graph traversal)
# - Error handling (try/except)
# - Optimization (chips, upgrades)
\`\`\`

**Reward:** The legendary **Full Stack Pickaxe** (5.0x efficiency) + permanent +20 carry capacity.` },
  ],
};
