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

    { title: 'Copy the Workspace Template', content: `NetCrawl ships with a starter template. Copy it to get started:

\`\`\`bash
# From the netcrawl2 folder:
cp -r workspace_example workspace
cd workspace
\`\`\`

The \`workspace/\` folder is yours to edit. It contains:
- \`main.py\` — entry point (registers your workers)
- \`workers/\` — your worker classes go here
- \`pyproject.toml\` — Python dependencies` },

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

  q_hello_world: [
    { title: 'Open the Deploy Dialog', content: `Your code server is connected. Now deploy your first worker!

In the game UI:
1. Click the **Hub** node (center of the graph)
2. Click **"Deploy Worker"** in the panel that opens
3. Select a worker class from the dropdown (e.g. "Miner")
4. Click **"Deploy"**

Your worker will appear as a colored dot on the Hub node.` },

    { title: 'Watch the Worker Panel', content: `After deploying, check the **Workers** panel (bottom-left corner of the screen).

You'll see your worker with:
- Its **name** and **status** (deploying → running)
- **Logs** showing what it's doing each loop
- A **Suspend** button to gracefully stop it

Click the worker row to select it and see detailed logs in the right panel.` },

    { title: 'Your Worker is a Loop', content: `Every worker runs an infinite loop. Here's what the Miner looks like:

\`\`\`python
class Miner(WorkerClass):
    class_name = "Miner"
    class_id = "miner"

    pickaxe = Pickaxe()
    route = Route("mining route")

    def on_startup(self):
        self.edge_id = self.route
        self.info(f"Miner online! Edge: {self.edge_id}")

    def on_loop(self):
        self.move_edge(self.edge_id)   # hub → mine
        self.pickaxe.mine()
        self.collect()
        self.move_edge(self.edge_id)   # mine → hub
        self.deposit()
\`\`\`

- **Route** is a deploy-time field — you pick which edge to mine when deploying
- \`on_startup()\` runs once when deployed
- \`on_loop()\` runs forever until suspended
- \`move_edge()\` travels along an edge to the other end

Watch the logs to confirm your worker is alive. Then move on to the next quest!` },
  ],

  q_first_harvest: [
    { title: 'Understanding Resources', content: `The network has 3 resource types:

- **Data** (blue) -- Primary currency, mined from resource nodes
- **RP** (purple) -- Research points, earned from compute nodes
- **Credits** (amber) -- Premium currency, from API nodes and quests

Resource nodes produce drops when mined. You need a **Pickaxe** to mine.` },

    { title: 'Unlock a Resource Node', content: `Click on a **Data Mine** node. If it is locked, click **"Unlock"** and spend the required Data.

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

- \`data_fragment\` becomes **Data**
- \`rp_shard\` becomes **RP**` },

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
| **Resource** | Produces data when mined |
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
| Data | \`int\` | Blue |
| RP | \`str\` | Purple |
| Credits | \`float\` | Amber |

Deploy miners to resource nodes and complete API requests to earn all three.` },
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
