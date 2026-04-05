/**
 * Step-by-step guide content for each quest.
 * Content uses Markdown with fenced code blocks.
 */

import type { GuideStep } from './questDefinitions.js';

export const QUEST_GUIDES: Record<string, GuideStep[]> = {
  q_setup: [
    { title: 'Install VSCode', content: `NetCrawl workers are Python scripts. You need a code editor.

Download **Visual Studio Code** from [code.visualstudio.com](https://code.visualstudio.com) and install it.

Also install the **Python extension** in VSCode:
1. Open VSCode
2. Press \`Ctrl+Shift+X\` (Extensions)
3. Search "Python" → Install the Microsoft Python extension` },

    { title: 'Clone the Workspace', content: `Clone the starter workspace repository to get your worker code set up:

\`\`\`bash
git clone https://github.com/Starscribers/netcrawl-workspace.git workspace
cd workspace
\`\`\`

This creates a \`workspace/\` folder with everything you need:
- \`main.py\` — entry point (registers your workers)
- \`workers/\` — your worker classes go here
- \`pyproject.toml\` — Python dependencies

You'll be editing files inside this folder to write your own workers.` },

    { title: 'Install uv (Python Package Manager)', content: `NetCrawl uses **uv** for fast Python dependency management.

**Windows (PowerShell):**
\`\`\`powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
\`\`\`

**macOS / Linux:**
\`\`\`bash
curl -LsSf https://astral.sh/uv/install.sh | sh
\`\`\`

Then in your workspace folder:
\`\`\`bash
uv sync
\`\`\`` },

    { title: 'Start the Game Server', content: `The game server must be running before your code server.

In the \`netcrawl2/\` folder, run:

\`\`\`bash
pnpm dev
\`\`\`

You should see the UI open at **http://localhost:5173** and the API server at **http://localhost:3001**.

Keep this terminal open.` },

    { title: 'Run Your Code Server', content: `Now start your Python code server. In the \`workspace/\` folder:

\`\`\`bash
uv run main.py
\`\`\`

You should see:
\`\`\`
[NetCrawl] Registered: Miner (id=miner)
[NetCrawl] Registered: Scout (id=scout)
[NetCrawl] Code server connected ✓
\`\`\`

**This quest completes automatically** when the code server connects to the game server!

🎉 Once connected, the Deploy Worker button becomes active. Head to the next quest.` },
  ],

  // ── Chapter 1: New quest guides ─────────────────────────────────────────────

  q_method_call: [
    { title: 'What is a Method?', content: `In Python, a **method** is a function that belongs to an object. You call it with dot notation:

\`\`\`python
self.mine()       # call the mine method
self.collect()    # call the collect method
self.deposit()    # call the deposit method
\`\`\`

Each method call tells your worker to **do something**. Methods are how you interact with the game world.` },

    { title: 'Write Your First Worker', content: `Open \`workspace/workers/miner.py\` and write:

\`\`\`python
from netcrawl import WorkerClass, Edge
from netcrawl.items.equipment import Pickaxe

class Miner(WorkerClass):
    class_name = "Miner"
    class_id = "miner"

    pickaxe = Pickaxe()
    route = Edge("mining route")

    def on_loop(self):
        self.move_edge(self.route)   # hub → mine
        self.pickaxe.mine()          # create a drop
        self.collect()               # pick it up
        self.move_edge(self.route)   # mine → hub
        self.deposit()               # convert to resources
\`\`\`

Each line is a **method call**. The worker executes them one by one, in order.` },

    { title: 'Deploy and Watch', content: `1. Click the **Hub** node → **Deploy Worker**
2. Select **Miner** from the dropdown
3. Pick an **edge** that leads to a resource node
4. Equip a **Pickaxe** from inventory
5. Click **Deploy**

Watch the worker logs — you'll see each method call happening in sequence.

**Goal:** Mine 1 time + Deposit 1 time to complete this quest.` },
  ],

  q_dot_notation: [
    { title: 'Reading Properties', content: `Objects have **attributes** you can read with dot notation:

\`\`\`python
node = self.get_current_node()
print(node.node_type)    # "resource", "hub", "compute"...
print(node.label)        # "Data Mine Alpha"

item = self.collect()
print(item["type"])      # "data_fragment" or "bad_data"
\`\`\`

Dot notation lets you **inspect** the world before acting on it.` },

    { title: 'Explore the Map', content: `Look at the map — some nodes are **locked** (greyed out). Click on a locked node to see:
- Its **type** (resource, compute, relay...)
- Its **unlock cost** (how much data you need)

To unlock a node, you need enough resources. Click **"Unlock"** in the node detail panel.

**Goal:** Unlock 1 node to complete this quest. Choose a resource node near the hub for easy mining access.` },
  ],

  q_conditions: [
    { title: 'Making Decisions', content: `An \`if\` statement lets your code make decisions:

\`\`\`python
if something_is_true:
    do_this()
else:
    do_that()
\`\`\`

In NetCrawl, your worker needs to decide **when** to deposit. Without conditions, it deposits every single loop — even when carrying nothing!` },

    { title: 'Smart Mining Loop', content: `Here's a smarter miner that checks before depositing:

\`\`\`python
def on_loop(self):
    self.move_edge(self.route)
    self.pickaxe.mine()
    result = self.collect()

    if result.get("ok"):
        self.move_edge(self.route)  # return to hub
        self.deposit()
    else:
        self.info("Nothing to collect, trying again...")
\`\`\`

The \`if\` checks whether \`collect()\` succeeded before wasting a trip back to hub.

**Goal:** Deposit **500 data total**. A smarter loop means faster accumulation.` },
  ],

  q_operators: [
    { title: 'Comparison Operators', content: `Python has operators for comparing values:

| Operator | Meaning | Example |
|----------|---------|---------|
| \`>\` | greater than | \`a > 10\` |
| \`<\` | less than | \`health < 50\` |
| \`==\` | equals | \`status == "infected"\` |
| \`!=\` | not equals | \`type != "hub"\` |
| \`>=\` | greater or equal | \`count >= 3\` |

These are used inside \`if\` statements to make numeric decisions.` },

    { title: 'Infection Defense', content: `Some nodes get **infected** — they turn red and spread infection to neighbors.

You can write a worker that checks infection level using operators:

\`\`\`python
node = self.get_current_node()
if node.data.get("infected"):
    self.repair(node.id)
\`\`\`

**Goal:** Repair 1 infected node. You may need to wait for an infection event, or explore the map to find one.
Repairing costs **500 data** — make sure you have enough!` },
  ],

  q_while_loop: [
    { title: 'Repeating Until Done', content: `A \`while\` loop repeats **as long as a condition is true**:

\`\`\`python
while there_is_work:
    do_work()
\`\`\`

Unlike \`for\` loops (which iterate a known collection), \`while\` loops handle **unknown** amounts of work. You don't know in advance how many times you'll loop.` },

    { title: 'Filtering Bad Data', content: `Some resource nodes produce **bad_data** drops. You need to filter them out:

\`\`\`python
def on_loop(self):
    self.move_edge(self.route)
    self.pickaxe.mine()

    # Keep collecting until we get good data
    while self.has_dropped_items():
        result = self.collect()
        item = result.get("item", {})
        if item.get("type") == "bad_data":
            self.discard()       # throw away bad data
        else:
            break                # got good data!

    self.move_edge(self.route)
    self.deposit()
\`\`\`

\`has_dropped_items()\` checks if the node still has drops. \`discard()\` throws away the held item.

**Goal:** Deposit **1,000 data total**. The while loop helps you filter efficiently.` },
  ],

  q_for_loop: [
    { title: 'Iterating Collections', content: `A \`for\` loop visits every item in a collection:

\`\`\`python
for item in collection:
    process(item)
\`\`\`

Unlike \`while\` (repeat until condition), \`for\` iterates a **known set** of things — a list, a sequence, scan results.` },

    { title: 'The Data Mine Cluster', content: `Far south on the map, there's a **Data Mine Cluster**: a relay hub surrounded by 6 tiny resource nodes (capacity 1 each, refills every 5 seconds).

Sitting on one node is pointless — it depletes instantly. You need to **visit them all** in a loop:

\`\`\`python
from netcrawl import WorkerClass, AdvancedSensor, ResourceNode
from netcrawl.items.equipment import Pickaxe

class ClusterMiner(WorkerClass):
    class_name = "Cluster Miner"
    class_id = "cluster_miner"

    pickaxe = Pickaxe()
    sensor = AdvancedSensor()

    def on_loop(self):
        edges = self.sensor.scan()

        for edge in edges:
            if isinstance(edge.target_node, ResourceNode):
                self.move_edge(edge.edge_id)
                self.pickaxe.mine()
                self.collect()
                self.move_edge(edge.edge_id)  # back to relay
                self.deposit()
\`\`\`

**Note:** The cluster relay is NOT a hub — you'll need to carry data back to the main hub first. Adapt your code accordingly!

**Goal:** Mine **20 times total**. The cluster is the fastest way to hit this target.` },
  ],

  q_try_except: [
    { title: 'Handling Errors', content: `Things go wrong. Nodes deplete, inventory fills up, moves fail. \`try/except\` catches errors so your worker doesn't crash:

\`\`\`python
try:
    result = self.collect()
except Exception as e:
    self.warn(f"Collect failed: {e}")
    # recover gracefully
\`\`\`

Without error handling, one unexpected failure kills your entire worker process.` },

    { title: 'Resilient Workers', content: `A resilient worker wraps risky operations:

\`\`\`python
def on_loop(self):
    try:
        self.move_edge(self.route)
        self.pickaxe.mine()
        self.collect()
        self.move_edge(self.route)
        self.deposit()
    except Exception as e:
        self.error(f"Loop failed: {e}")
        # Try to get back to hub
        try:
            self.move("hub")
        except:
            pass
\`\`\`

**Goal:** Deploy **3 workers total**. More workers = more chances to see (and survive) errors.` },
  ],

  q_event_loop: [
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

Mine **30 times** to see the loop in action. Let multiple miners run simultaneously for faster progress.` },
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

Your data counter works the same way. Each deposit adds to the total. Reach **100 data** to complete this quest.

**Tips to speed up:**
- Deploy multiple miners
- Upgrade the Data Mine node
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

Diversify: deposit **data** from multiple nodes (10+ each).` },
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

Accumulate **200+ data** and **10+ RP** to prove your efficiency.

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
- **500+ data** deposited (sustained production)

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
