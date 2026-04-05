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

    { title: 'Set Up Your Workspace', content: `Install **uv** (Python package manager), then clone the workspace:

**Install uv — Windows (PowerShell):**
\`\`\`powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
\`\`\`

**Install uv — macOS / Linux:**
\`\`\`bash
curl -LsSf https://astral.sh/uv/install.sh | sh
\`\`\`

**Clone and install:**
\`\`\`bash
git clone https://github.com/Starscribers/netcrawl-workspace.git workspace
cd workspace
uv sync
\`\`\`

This creates a \`workspace/\` folder with:
- \`main.py\` — entry point (registers your workers)
- \`workers/\` — your worker classes go here` },

    { title: 'Configure main.py', content: `Open \`workspace/main.py\` in your editor. Find the \`NetCrawl(...)\` section and update the **server URL**.

Click the **Connect** button (terminal icon, top-right) to get your server URL, then edit:

\`\`\`diff
  app = NetCrawl(
-     api_key="sk-local",
-     server="http://localhost:4800",
+     api_key="sk-local",                        # keep for local
+     server="http://localhost:4800",             # ← paste URL from Connect dialog
  )
\`\`\`

> **How to find your URL:** Click the pulsing **Connect** button in the toolbar → copy the **Server URL**.

If you're on the **cloud version**, also replace the \`api_key\` with the API Key shown in the Connect dialog:

\`\`\`diff
  app = NetCrawl(
-     api_key="sk-local",
-     server="http://localhost:4800",
+     api_key="eyJhbG...",                       # ← from Connect dialog
+     server="https://netcrawl-server-....app",   # ← from Connect dialog
  )
\`\`\`` },

    { title: 'Run Your Code Server', content: `Now start your Python code server. In the \`workspace/\` folder:

\`\`\`bash
uv run main.py
\`\`\`

You should see:
\`\`\`
[NetCrawl] Registered: Miner (id=miner)
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
\`\`\`javascript
this.mine();       // call the mine method
this.collect();    // call the collect method
this.deposit();    // call the deposit method
\`\`\`

Each method call tells your worker to **do something**. Methods are how you interact with the game world.` },

    { title: 'Write Your First Worker', content: `Open \`workspace/workers/miner.py\` (or \`miner.js\`) and write:

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
\`\`\`javascript
import { WorkerClass, Edge, Pickaxe } from '@netcrawl/sdk';

class Miner extends WorkerClass {
    static classId = 'miner';
    static className = 'Miner';
    static fields = {
        pickaxe: new Pickaxe(),
        route: new Edge('mining route'),
    };

    onLoop() {
        this.moveEdge(this.route);   // hub → mine
        this.pickaxe.mine();         // create a drop
        this.collect();              // pick it up
        this.moveEdge(this.route);   // mine → hub
        this.deposit();              // convert to resources
    }
}
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
print(item.type)         # "data_fragment" or "bad_data"
\`\`\`
\`\`\`javascript
const node = this.getCurrentNode();
console.log(node.nodeType);    // "resource", "hub", "compute"...
console.log(node.label);       // "Data Mine Alpha"

const item = this.collect();
console.log(item.type);        // "data_fragment" or "bad_data"
\`\`\`

Dot notation lets you **inspect** the world before acting on it.` },

    { title: 'Explore the Map', content: `Look at the map — some nodes are **locked** (greyed out). Click on a locked node to see:
- Its **type** (resource, compute, relay...)
- Its **unlock cost** (how much data you need)

To unlock a node, you need enough resources. Click **"Unlock"** in the node detail panel.

**Goal:** Unlock 1 node to complete this quest. Choose a resource node near the hub for easy mining access.` },
  ],

  q_conditions: [
    { title: 'The Bad Data Problem', content: `Every data mine has a chance of producing **bad data** — corrupted fragments mixed in with good data.

If you deposit bad data at the Hub, it **subtracts** from your data resources!

Data Mine Nano has a **40% bad data rate** (60% cleanliness). Other mines are cleaner, but all have some risk.

You need to learn \`if\` statements to **filter out bad data** before depositing.` },

    { title: 'The if Statement', content: `An \`if\` statement lets your code make decisions:

\`\`\`python
if condition:
    do_this()
else:
    do_that()
\`\`\`

After you \`collect()\` a drop, check \`self.holding\` to see what you picked up:
- \`self.holding.type\` — either \`"data_fragment"\` (good) or \`"bad_data"\` (bad)
- \`self.discard()\` — throw away the held item without depositing` },

    { title: 'Smart Miner with Filtering', content: `Here's a miner that filters bad data:

\`\`\`python
def on_loop(self):
    self.move(self.to_mine)
    self.pickaxe.mine_and_collect()

    # Check what we picked up
    if self.holding and self.holding.type == "bad_data":
        self.discard()          # throw away bad data
        self.info("Discarded bad data!")
    else:
        self.move(self.to_hub)
        self.deposit()
        self.info("Deposited good data!")
\`\`\`
\`\`\`javascript
onLoop() {
    this.move(this.toMine);
    this.pickaxe.mineAndCollect();

    // Check what we picked up
    if (this.holding && this.holding.type === 'bad_data') {
        this.discard();          // throw away bad data
        this.info('Discarded bad data!');
    } else {
        this.move(this.toHub);
        this.deposit();
        this.info('Deposited good data!');
    }
}
\`\`\`

**Goals:**
- Discard **5 bad data** fragments
- Deposit **300 data** total

Without filtering, bad data will eat into your resources!` },
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
if node.is_infected:
    self.repair(node.id)
\`\`\`
\`\`\`javascript
const node = this.getCurrentNode();
if (node.isInfected) {
    this.repair(node.id);
}
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
        if result.item.type == "bad_data":
            self.discard()       # throw away bad data
        else:
            break                # got good data!

    self.move_edge(self.route)
    self.deposit()
\`\`\`
\`\`\`javascript
onLoop() {
    this.moveEdge(this.route);
    this.pickaxe.mine();

    // Keep collecting until we get good data
    while (this.hasDroppedItems()) {
        const result = this.collect();
        if (result.item.type === 'bad_data') {
            this.discard();       // throw away bad data
        } else {
            break;                // got good data!
        }
    }

    this.moveEdge(this.route);
    this.deposit();
}
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
\`\`\`javascript
import { WorkerClass, AdvancedSensor, ResourceNode, Pickaxe } from '@netcrawl/sdk';

class ClusterMiner extends WorkerClass {
    static classId = 'cluster_miner';
    static className = 'Cluster Miner';
    static fields = {
        pickaxe: new Pickaxe(),
        sensor: new AdvancedSensor(),
    };

    onLoop() {
        const edges = this.sensor.scan();

        for (const edge of edges) {
            if (edge.targetNode instanceof ResourceNode) {
                this.moveEdge(edge.edgeId);
                this.pickaxe.mine();
                this.collect();
                this.moveEdge(edge.edgeId);  // back to relay
                this.deposit();
            }
        }
    }
}
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
\`\`\`javascript
try {
    const result = this.collect();
} catch (e) {
    this.warn(\`Collect failed: \${e}\`);
    // recover gracefully
}
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
\`\`\`javascript
onLoop() {
    try {
        this.moveEdge(this.route);
        this.pickaxe.mine();
        this.collect();
        this.moveEdge(this.route);
        this.deposit();
    } catch (e) {
        this.error(\`Loop failed: \${e}\`);
        // Try to get back to hub
        try {
            this.move('hub');
        } catch (_) {
            // ignore
        }
    }
}
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
    print(f"{node.id}: {node.type}")
\`\`\`
\`\`\`javascript
const nodes = this.scan();
for (const node of nodes) {
    console.log(\`\${node.id}: \${node.type}\`);
}
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
infected = [n for n in self.scan() if n.type == "infected"]
if infected:
    self.travel_to(infected[0].id)
    self.repair(infected[0].id)
\`\`\`
\`\`\`javascript
const infected = this.scan().filter(n => n.type === 'infected');
if (infected.length > 0) {
    this.travelTo(infected[0].id);
    this.repair(infected[0].id);
}
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
