/**
 * Step-by-step guide content for each quest.
 * Each quest has an array of steps with title + content.
 */

import type { GuideStep } from './questDefinitions.js';

export const QUEST_GUIDES: Record<string, GuideStep[]> = {
  q_hello_world: [
    { title: 'Clone the Repository', content: 'Open your terminal and clone the NetCrawl workspace:\n\ncd workspace/\n\nThis folder contains your worker code. The workspace_example/ folder has starter templates you can reference.' },
    { title: 'Understanding Workers', content: 'Workers are Python classes that automate tasks on the network. Each worker has:\n\n- on_startup(): Called once when deployed\n- on_loop(): Called repeatedly to do work\n\nWorkers can move between nodes, mine resources, collect drops, and deposit them at the Hub.' },
    { title: 'Write Your First Worker', content: 'Open workspace/workers/ and create a new file, or modify an existing one.\n\nA minimal worker looks like:\n\nfrom netcrawl import WorkerClass\n\nclass HelloWorker(WorkerClass):\n    class_name = "Hello"\n    class_id = "hello"\n\n    def on_startup(self):\n        self.info("Hello, World!")\n\n    def on_loop(self):\n        self.info("I am alive!")\n        import time; time.sleep(5)' },
    { title: 'Register in main.py', content: 'Open workspace/main.py and register your worker:\n\nfrom workers.hello import HelloWorker\n\napp.register(HelloWorker)\n\nThis tells the code server about your new worker class.' },
    { title: 'Start the Code Server', content: 'In the workspace/ directory, run:\n\nuv run main.py\n\nYou should see:\n[NetCrawl] Registered: Hello (id=hello)\n[NetCrawl] Code server running...\n\nThe code server connects to the game server and registers your worker classes.' },
    { title: 'Deploy from the UI', content: 'In the game UI:\n\n1. Click on the Hub node\n2. Click "Deploy Worker"\n3. Select your worker class from the dropdown\n4. Click "Deploy"\n\nYour worker will appear as a colored dot on the Hub node. Check the Workers panel (bottom-left) to see its status and logs.' },
  ],

  q_first_harvest: [
    { title: 'Understanding Resources', content: 'The network has 3 resource types:\n\n- Energy (yellow): Powers everything\n- Ore (purple): Used for crafting\n- Data (blue): Advanced recipes\n\nResource nodes produce drops when mined. You need a Pickaxe to mine.' },
    { title: 'Unlock a Resource Node', content: 'Click on the Ore Mine node. If it is locked, click "Unlock" and spend the required Energy.\n\nOnce unlocked, the node shows its production rate (e.g., +3/harvest).' },
    { title: 'Write a Mining Worker', content: 'Modify your worker to mine:\n\nclass Miner(WorkerClass):\n    class_name = "Miner"\n    class_id = "miner"\n    pickaxe = Pickaxe()\n    route = Route("mining route")\n\n    def on_loop(self):\n        self.move(self.mine_node)\n        self.pickaxe.mine()\n        ...\n\nThe mine() action creates a drop on the node.' },
    { title: 'Deploy with Equipment', content: 'When deploying a Miner, you need to:\n\n1. Select the route (click an edge on the map)\n2. Equip a Pickaxe (drag from inventory)\n\nThe worker will use these during operation.' },
  ],

  q_bring_it_home: [
    { title: 'The Deposit Cycle', content: 'After mining, your worker holds a drop item. To convert it to resources:\n\n1. self.collect() -- picks up the drop from the node\n2. self.move("hub") -- travel back to Hub\n3. self.deposit() -- converts the drop to resources\n\nore_chunk becomes Ore, energy_crystal becomes Energy, data_shard becomes Data.' },
    { title: 'Check Your Worker Code', content: 'A complete mining loop:\n\ndef on_loop(self):\n    self.move(self.mine_node)  # go to mine\n    self.pickaxe.mine()         # create drop\n    self.collect()              # pick up drop\n    self.move("hub")            # return home\n    self.deposit()              # convert to resources' },
    { title: 'Monitor Progress', content: 'Watch the resource bar at the top of the screen. When your worker deposits, the resource count increases.\n\nClick on your worker dot to see its logs and current status.' },
  ],

  q_expand_network: [
    { title: 'Node Types', content: 'The network has several node types:\n\n- Hub: Your base, always unlocked\n- Resource: Produces energy, ore, or data\n- Relay: Network infrastructure\n- Locked: Unknown, costs resources to unlock' },
    { title: 'Unlock a Node', content: 'Click on any locked node to see its unlock cost. Spend the required resources to unlock it.\n\nUnlocking nodes expands your network and gives workers more places to operate.' },
    { title: 'Reward: Passive Bonus', content: 'Completing this quest grants a permanent +5% harvest speed bonus.\n\nPassive bonuses apply automatically to all workers and stack with chip effects.' },
  ],

  q_variable_types: [
    { title: 'Three Resource Types', content: 'Just like Python has int, str, and float, NetCrawl has three resource types:\n\n- Energy (like int): Simple, fundamental\n- Ore (like str): Versatile, used in crafting\n- Data (like float): Advanced, precise\n\nCollect all three to complete this quest.' },
    { title: 'Deploy to Different Nodes', content: 'To deposit different resource types, you need workers mining different resource nodes.\n\nDeploy miners to Energy Node, Ore Mine, and Data Cache.' },
  ],

  q_for_loop: [
    { title: 'Scaling with Loops', content: 'In Python:\n\nfor i in range(3):\n    deploy_worker()\n\nIn NetCrawl, deploy 3 workers to automate your resource collection. More workers = more throughput.' },
    { title: 'Deploy Multiple Workers', content: 'You can deploy multiple workers to the same or different nodes. Each worker runs independently.\n\nTry deploying 3 miners to different resource nodes for diversified income.' },
  ],

  q_batch_processing: [
    { title: 'Iteration at Scale', content: 'A for loop processes items one at a time. Your miners do the same: mine, collect, deposit, repeat.\n\nLet your miners run until they have mined 10 times total.' },
    { title: 'Tip: Check Worker Logs', content: 'Click on a worker dot or use the Workers panel to see logs. Each successful mine operation is logged.\n\nReward: Unlocks the Scanner recipe for crafting.' },
  ],

  q_accumulator: [
    { title: 'Accumulating State', content: 'The accumulator pattern:\n\ntotal = 0\nfor item in items:\n    total += item\n\nYour ore counter works the same way. Each deposit adds to the total. Reach 100 ore to complete this quest.' },
    { title: 'Optimization', content: 'To reach 100 ore faster:\n- Deploy multiple miners\n- Upgrade the Ore Mine node\n- Install harvest speed chips' },
  ],

  q_list_comprehension: [
    { title: 'Concise Code', content: 'Python list comprehensions:\n\nitems = [craft(m) for m in materials]\n\nCraft 3 items using the Inventory panel (press E). You can craft pickaxes, shields, and beacons.' },
  ],

  q_error_handling: [
    { title: 'Try / Except', content: 'Workers can crash. When they do, the error is logged and you can redeploy.\n\ntry:\n    risky_operation()\nexcept Exception as e:\n    log(f"Error: {e}")\n    recover()\n\nDeploy 5 workers total to learn resilience.' },
  ],

  q_graph_theory: [
    { title: 'Graphs: Nodes and Edges', content: 'A graph G = (V, E) consists of vertices (nodes) and edges (connections).\n\nYour network is a graph. Unlock 3 nodes to expand it.' },
    { title: 'Network Topology', content: 'Different topologies affect worker routing. Hub-and-spoke, mesh, tree -- each has tradeoffs.\n\nUnlock relay nodes to create alternative paths.' },
  ],

  q_routing: [
    { title: 'Shortest Path', content: 'Routers use BFS/Dijkstra to find shortest paths. Your workers do too.\n\nDiversify: deposit both ore and energy (10+ each) to show you can manage multiple resource streams.' },
  ],

  q_relay_network: [
    { title: 'Building Redundancy', content: 'Relay nodes provide alternative paths. If one path is blocked (infection), workers can route around it.\n\nUnlock 4 nodes total to build a resilient network.' },
  ],

  q_dns_lookup: [
    { title: 'Exploring the Network', content: 'DNS resolves names to addresses. In NetCrawl, scanning reveals what is around each node.\n\nDeploy workers to explore the network.' },
  ],

  q_if_statement: [
    { title: 'Conditional Logic', content: 'if node.infected:\n    repair(node)\nelse:\n    continue\n\nInfected nodes threaten your network. Deploy a Guardian worker to repair them.' },
    { title: 'The Guardian Class', content: 'Guardians are workers that scan for infections and repair them. They need a Shield equipped.\n\nCraft a Shield, then deploy a Guardian.' },
  ],

  q_firewall: [
    { title: 'Defense in Depth', content: 'Firewalls use rules to filter traffic. Chips add defensive layers to your nodes.\n\nInstall 2 chips into node slots to strengthen your defenses.' },
    { title: 'Getting Chips', content: 'Open the Inventory (E) and buy chip packs. Open them to get random chips.\n\nThen click a node, scroll to Chip Slots, and insert chips.' },
  ],

  q_antivirus: [
    { title: 'Pattern Matching', content: 'Antivirus software scans for known patterns. Your Guardian does the same.\n\nRepair 3 infected nodes to master the defense cycle.' },
  ],

  q_redundancy: [
    { title: 'Fault Tolerance', content: 'Redundant systems survive failures. Having multiple workers ensures continuous operation.\n\nDeploy 8 workers total to build a fault-tolerant workforce.' },
  ],

  q_profiling: [
    { title: 'Measure First', content: 'Never optimize without measuring. Node upgrades show measurable improvement.\n\nUpgrade any node to see the before/after difference.' },
    { title: 'How to Upgrade', content: 'Click an unlocked node, scroll to the Upgrade section.\n\nPay the resource cost to upgrade. Each level provides different bonuses:\n- Level 1: Better production\n- Level 2: More chip slots\n- Level 3: Auto-collect' },
  ],

  q_caching: [
    { title: 'Memoization', content: 'Caching stores computed results. Auto-collect (Level 3 upgrade) caches resources without manual worker trips.\n\nMax out a node upgrade to Level 3.' },
  ],

  q_big_o: [
    { title: 'Algorithm Complexity', content: 'O(1) < O(log n) < O(n) < O(n^2)\n\nOpen 5 chip packs and observe the rarity distribution. Common chips are O(1) -- easy to get. Legendary chips are O(n!) -- extremely rare.' },
  ],

  q_memory_mgmt: [
    { title: 'Resource Management', content: 'Efficient programs manage memory carefully. Your network must manage resources wisely.\n\nAccumulate 200+ ore and 200+ energy to prove your efficiency.' },
  ],

  q_design_patterns: [
    { title: 'Software Architecture', content: 'Design patterns are reusable solutions. In NetCrawl, the patterns are:\n\n- Factory: Crafting system\n- Observer: WebSocket updates\n- Strategy: Different worker classes\n\nUnlock ALL nodes and craft ALL recipes to demonstrate mastery.' },
  ],

  q_full_stack: [
    { title: 'Full Stack Mastery', content: 'A full stack developer knows it all: frontend, backend, databases, deployment.\n\nIn NetCrawl, that means:\n- 20+ workers deployed\n- 500+ ore deposited\n\nComplete this final quest to earn the legendary Full Stack Pickaxe.' },
  ],
};
