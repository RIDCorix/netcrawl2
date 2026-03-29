import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { simpleGit } from 'simple-git';
import {
  getGameState, getVisibleState, saveGameState, resetGameState,
  getWorkers, getWorker, upsertWorker, deleteWorker,
  addWorkerLog, getWorkerLogs,
  INITIAL_NODES, INITIAL_EDGES, INITIAL_RESOURCES, INITIAL_PLAYER_INVENTORY,
  RECIPES, Recipe, Chip,
  getPlayerInventory, addToPlayerInventory, removeFromPlayerInventory, getItemEfficiency,
  getPlayerChips, addPlayerChip, removePlayerChip,
} from './db.js';
import { handleWorkerAction } from './workerActions.js';
import { spawnWorker, killWorker, suspendWorker, getActiveProcesses } from './workerSpawner.js';
import { checkCost, deductCost } from './stateHelpers.js';
import {
  WorkerClassEntry, registerWorkerClass, getWorkerClass, getAllWorkerClasses,
  DeployRequest, enqueueDeploy, drainDeployQueue, removeFromDeployQueue,
} from './workerRegistry.js';
import { broadcastFullState } from './broadcastHelper.js';
import {
  NODE_UPGRADE_DEFS, getUpgradeKey, CHIP_PACK_DEFS, rollChip, getNodeXpThreshold,
} from './upgradeDefinitions.js';
import { checkAchievements, getAchievementList, RARITY_ORDINAL } from './achievements.js';
import { checkQuests, claimQuestReward, getQuestList, getQuestEdges } from './quests.js';
import { getActivePassives, getUnlockedRecipes } from './db.js';
import { incrementStat, addToStatArray, setStatMax, awardXp, getPlayerLevelSummary, grantNodeXp } from './db.js';
import { XP_REWARDS } from './levelSystem.js';

export const router: Router = Router();

// Resolve workspace path
function getWorkspacePath(): string {
  const configPath = path.join(process.cwd(), 'netcrawl.config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.workspacePath) {
      return path.resolve(config.workspacePath);
    }
  }
  return path.join(process.cwd(), 'workspace');
}

// GET /api/state
router.get('/state', (req: Request, res: Response) => {
  const state = getGameState();
  const { nodes, edges } = getVisibleState(2);
  const workers = getWorkers();
  res.json({ ...state, nodes, edges, workers });
});

// POST /api/gather
router.post('/gather', (req: Request, res: Response) => {
  const { nodeId } = req.body;
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  if (!node.data.unlocked) return res.status(400).json({ error: 'Node not unlocked' });

  const resourceType = node.data.resource as string;
  if (!resourceType) return res.status(400).json({ error: 'Not a resource node' });

  const newResources = { ...state.resources };
  (newResources as any)[resourceType] = ((newResources as any)[resourceType] || 0) + 10;
  saveGameState({ ...state, resources: newResources });
  grantNodeXp(nodeId, 'harvest');
  broadcastFullState();
  res.json({ ok: true, resources: newResources });
});

// POST /api/unlock
router.post('/unlock', (req: Request, res: Response) => {
  const { nodeId } = req.body;
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  if (node.data.unlocked) return res.status(400).json({ error: 'Already unlocked' });

  const cost = (node.data.unlockCost as Record<string, number>) || {};
  const resources = state.resources as unknown as Record<string, number>;

  const costError = checkCost(resources, cost);
  if (costError) return res.status(400).json({ error: costError });
  const newResources = deductCost(resources, cost);

  // Unlock node — initialize nodeXp threshold for upgrade system
  const newNodes = state.nodes.map((n: any) => {
    if (n.id === nodeId) {
      const key = getUpgradeKey(n.type, n.data.resource);
      const threshold = getNodeXpThreshold(key, 1);
      return { ...n, data: { ...n.data, unlocked: true, nodeXp: 0, nodeXpToNext: threshold } };
    }
    return n;
  });

  saveGameState({ ...state, nodes: newNodes, resources: newResources as any });
  broadcastFullState();
  incrementStat('total_nodes_unlocked', 1);
  awardXp(XP_REWARDS.unlock_node);
  checkAchievements();
  checkQuests();
  res.json({ ok: true, resources: newResources });
});

// GET /api/inventory
router.get('/inventory', (req: Request, res: Response) => {
  const inventory = getPlayerInventory();
  res.json({ inventory, recipes: RECIPES });
});

// GET /api/recipes
router.get('/recipes', (req: Request, res: Response) => {
  const state = getGameState();
  const resources = state.resources as unknown as Record<string, number>;
  const recipesWithAffordable = RECIPES.map(recipe => {
    const affordable = Object.entries(recipe.cost).every(([resource, amount]) => {
      return (resources[resource] || 0) >= (amount as number);
    });
    return { ...recipe, affordable };
  });
  res.json({ recipes: recipesWithAffordable });
});

// POST /api/craft
router.post('/craft', (req: Request, res: Response) => {
  const { recipeId } = req.body;
  const recipe = RECIPES.find(r => r.id === recipeId);
  if (!recipe) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  const state = getGameState();
  const resources = state.resources as unknown as Record<string, number>;

  const costError = checkCost(resources, recipe.cost as Record<string, number>);
  if (costError) return res.status(400).json({ error: costError });
  const newResources = deductCost(resources, recipe.cost as Record<string, number>);

  // Add item to player inventory
  addToPlayerInventory(recipe.output.itemType, recipe.output.count, recipe.output.metadata);

  saveGameState({ ...state, resources: newResources as any });
  broadcastFullState();

  incrementStat('total_crafts', 1);
  addToStatArray('crafted_recipes', recipe.id);
  awardXp(XP_REWARDS.craft_item);
  checkAchievements();
  checkQuests();

  const inventory = getPlayerInventory();
  const newItem = inventory.find(i => i.itemType === recipe.output.itemType);
  res.json({ ok: true, item: newItem, resources: newResources });
});

// POST /api/deploy — queues a deploy request for the code server to pick up
router.post('/deploy', async (req: Request, res: Response) => {
  const { nodeId, classId, equippedItems, routes } = req.body;
  if (!nodeId || !classId) {
    return res.status(400).json({ error: 'nodeId and classId are required' });
  }

  // Verify class is registered
  const workerClass = getWorkerClass(classId);
  if (!workerClass) {
    return res.status(400).json({ error: `Unknown worker class: ${classId}` });
  }

  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  // Handle equipped pickaxe — deduct from inventory
  let equippedPickaxe: { itemType: string; efficiency: number } | null = null;
  const pickaxeItemType = equippedItems?.pickaxe;
  if (pickaxeItemType) {
    const removed = removeFromPlayerInventory(pickaxeItemType, 1);
    if (!removed) {
      return res.status(400).json({ error: `Not enough ${pickaxeItemType} in inventory` });
    }
    equippedPickaxe = {
      itemType: pickaxeItemType,
      efficiency: getItemEfficiency(pickaxeItemType),
    };
  }

  const workerId = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Build injected fields
  const injectedFields: Record<string, any> = {};
  if (equippedPickaxe) {
    injectedFields['pickaxe'] = { itemType: equippedPickaxe.itemType, efficiency: equippedPickaxe.efficiency };
  }
  // Inject route fields (routes: { fieldName: 'e1' } — edge ID)
  if (routes && typeof routes === 'object') {
    for (const [fieldName, edgeId] of Object.entries(routes)) {
      if (typeof edgeId === 'string') {
        // Pass edge ID directly — workers use move_edge(edgeId)
        injectedFields[fieldName] = edgeId;
      } else if (Array.isArray(edgeId)) {
        // Backward compat: old format [source, target]
        injectedFields[fieldName] = edgeId;
      }
    }
  }

  // Register the worker in DB as deploying
  upsertWorker({
    id: workerId,
    node_id: nodeId,
    class_name: workerClass.class_name,
    class_icon: workerClass.class_icon || 'Bot',
    commit_hash: 'HEAD',
    status: 'deploying',
    current_node: nodeId,
    carrying: {},
    pid: null,
    deployed_at: new Date().toISOString(),
    holding: null,
    equippedPickaxe,
  });

  // Queue for code server
  enqueueDeploy({
    id: workerId,
    workerId,
    nodeId,
    classId,
    equippedItems: equippedItems || {},
    injectedFields,
    createdAt: new Date().toISOString(),
  });

  broadcastFullState();
  incrementStat('total_workers_deployed', 1);
  awardXp(XP_REWARDS.deploy_worker);
  checkAchievements();
  checkQuests();
  res.json({ ok: true, workerId, status: 'queued' });
});

// GET /api/deploy-queue — code server polls this to pick up deploy requests
router.get('/deploy-queue', (req: Request, res: Response) => {
  const pending = drainDeployQueue();
  res.json({ requests: pending });
});

// POST /api/deploy-ack — code server reports that a worker was spawned
router.post('/deploy-ack', (req: Request, res: Response) => {
  const { workerId, pid, error: spawnError } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  if (spawnError) {
    // Spawn failed — return equipped items
    if (worker.equippedPickaxe) {
      addToPlayerInventory(worker.equippedPickaxe.itemType, 1);
    }
    upsertWorker({ ...worker, status: 'crashed' });
    addWorkerLog(workerId, `[ERROR] Spawn failed: ${spawnError}`);
  } else {
    upsertWorker({ ...worker, status: 'running', pid: pid || null });
    addWorkerLog(workerId, `[INFO] Worker spawned (PID ${pid})`);
  }

  broadcastFullState();
  res.json({ ok: true });
});

// POST /api/recall
router.post('/recall', (req: Request, res: Response) => {
  const { workerId } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  // Return equipped items
  if (worker.equippedPickaxe) {
    addToPlayerInventory(worker.equippedPickaxe.itemType, 1);
  }
  if (worker.holding) {
    addToPlayerInventory(worker.holding.type, worker.holding.amount);
  }

  // For deploying/suspended/crashed/error workers — just delete, no process to kill
  if (['deploying', 'suspended', 'crashed', 'error'].includes(worker.status)) {
    // Remove from deploy queue if still pending
    removeFromDeployQueue(workerId);

    deleteWorker(workerId);
    broadcastFullState();
    return res.json({ ok: true });
  }

  // For running workers — kill the process
  const result = killWorker(workerId);
  if (!result.ok) {
    // Process not found but worker exists — just clean up
    deleteWorker(workerId);
    broadcastFullState();
    return res.json({ ok: true });
  }

  broadcastFullState();
  res.json({ ok: true });
});

// POST /api/worker/suspend
router.post('/worker/suspend', (req: Request, res: Response) => {
  const { workerId } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  if (worker.status !== 'running') {
    return res.status(400).json({ error: `Worker is not running (status: ${worker.status})` });
  }

  // Mark as suspending
  upsertWorker({ ...worker, status: 'suspending' });

  // Send SIGTERM to the child process
  const result = suspendWorker(workerId);
  if (!result.ok) {
    // If no process found, mark as suspended anyway and return items
    if (worker.equippedPickaxe) {
      addToPlayerInventory(worker.equippedPickaxe.itemType, 1);
    }
    if (worker.holding) {
      addToPlayerInventory(worker.holding.type, worker.holding.amount);
    }
    upsertWorker({ ...worker, status: 'suspended', pid: null, equippedPickaxe: null, holding: null });
  }

  broadcastFullState();
  res.json({ ok: true });
});

// POST /api/worker/suspend-all
router.post('/worker/suspend-all', (req: Request, res: Response) => {
  const workers = getWorkers();
  const running = workers.filter(w => w.status === 'running');

  for (const worker of running) {
    upsertWorker({ ...worker, status: 'suspending' });
    const result = suspendWorker(worker.id);
    if (!result.ok) {
      if (worker.equippedPickaxe) {
        addToPlayerInventory(worker.equippedPickaxe.itemType, 1);
      }
      if (worker.holding) {
        addToPlayerInventory(worker.holding.type, worker.holding.amount);
      }
      upsertWorker({ ...worker, status: 'suspended', pid: null, equippedPickaxe: null, holding: null });
    }
  }

  broadcastFullState();
  res.json({ ok: true, count: running.length });
});

// GET /api/revisions
router.get('/revisions', async (req: Request, res: Response) => {
  const workspacePath = getWorkspacePath();
  if (!fs.existsSync(workspacePath)) {
    return res.json({ revisions: [] });
  }
  try {
    const git = simpleGit(workspacePath);
    const log = await git.log(['--oneline', '-20']);
    const revisions = log.all.map((entry: any) => ({
      hash: entry.hash,
      shortHash: entry.hash.slice(0, 7),
      message: entry.message,
      date: entry.date,
    }));
    res.json({ revisions });
  } catch (err) {
    res.json({ revisions: [] });
  }
});

// GET /api/workers
router.get('/workers', (req: Request, res: Response) => {
  const workers = getWorkers();
  res.json({ workers });
});

// GET /api/worker/:id/logs
router.get('/worker/:id/logs', (req: Request, res: Response) => {
  const logs = getWorkerLogs(req.params.id as string);
  res.json({ logs });
});

// GET /api/classes - discover classes from workspace
router.get('/classes', (req: Request, res: Response) => {
  const workspacePath = getWorkspacePath();
  const workersDir = path.join(workspacePath, 'workers');

  if (!fs.existsSync(workersDir)) {
    return res.json({ classes: [] });
  }

  const classes: string[] = [];
  const files = fs.readdirSync(workersDir).filter((f: string) => f.endsWith('.js') || f.endsWith('.mjs'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(workersDir, file), 'utf-8');
    const matches = content.matchAll(/export\s+class\s+(\w+)/g);
    for (const match of matches) {
      classes.push(match[1]);
    }
  }

  res.json({ classes });
});

// POST /api/reset
router.post('/reset', (req: Request, res: Response) => {
  // Kill all active processes first
  const activeProcesses = getActiveProcesses();
  for (const [id, child] of activeProcesses) {
    child.kill('SIGTERM');
  }
  activeProcesses.clear();

  resetGameState();
  broadcastFullState();
  res.json({ ok: true });
});

// POST /api/worker-classes/register
// Body: { classes: [{ class_id, class_name, fields, docstring, file }] }
// Called by the Python code server on startup to register available worker classes
router.post('/worker-classes/register', (req: Request, res: Response) => {
  const { classes } = req.body as { classes: Omit<WorkerClassEntry, 'language'>[] };
  if (!Array.isArray(classes)) {
    return res.status(400).json({ error: 'classes must be an array' });
  }

  for (const entry of classes) {
    if (!entry.class_id) continue;
    registerWorkerClass({ ...entry, language: 'python' });
  }

  // Mark code server as connected (triggers q_setup quest)
  incrementStat('code_server_connected', 1);
  checkQuests();

  res.json({ ok: true, registered: classes.length });
});

// GET /api/worker-classes
// Returns all registered worker classes (for UI deploy dropdown)
router.get('/worker-classes', (req: Request, res: Response) => {
  const classes = getAllWorkerClasses();
  res.json({ classes });
});

// ── Build System (empty → structure) ──────────────────────────────────────

const BUILD_COSTS: Record<string, Record<string, number>> = {
  cache: { data: 1500, rp: 5 },
  api: { data: 2000, rp: 8 },
};

router.post('/node/build', (req: Request, res: Response) => {
  const { nodeId, structureType } = req.body;
  if (!nodeId || !structureType) return res.status(400).json({ error: 'nodeId and structureType required' });

  const cost = BUILD_COSTS[structureType];
  if (!cost) return res.status(400).json({ error: `Unknown structure type: ${structureType}` });

  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  if (node.type !== 'empty') return res.status(400).json({ error: 'Can only build on empty nodes' });
  if (!node.data.unlocked) return res.status(400).json({ error: 'Node is locked' });

  const resources = state.resources as unknown as Record<string, number>;
  const costError = checkCost(resources, cost);
  if (costError) return res.status(400).json({ error: costError });
  const newResources = deductCost(resources, cost);

  const newNodes = state.nodes.map((n: any) => {
    if (n.id !== nodeId) return n;
    if (structureType === 'cache') {
      return {
        ...n,
        type: 'cache',
        data: { ...n.data, label: 'Cache Node', upgradeLevel: 1, cacheRange: 1, cacheCapacity: 10 },
      };
    }
    if (structureType === 'api') {
      return {
        ...n,
        type: 'api',
        data: { ...n.data, label: 'API Node', upgradeLevel: 1, pendingRequests: 0 },
      };
    }
    return n;
  });

  saveGameState({ ...state, nodes: newNodes, resources: newResources as any });
  broadcastFullState();
  incrementStat('total_structures_built', 1);
  awardXp(XP_REWARDS.build_structure);
  checkAchievements();
  checkQuests();
  res.json({ ok: true, nodeId, structureType });
});

// GET /api/node/build-options — what can be built on an empty node
router.get('/node/build-options', (req: Request, res: Response) => {
  const state = getGameState();
  const resources = state.resources as unknown as Record<string, number>;
  const options = Object.entries(BUILD_COSTS).map(([type, cost]) => ({
    type,
    cost,
    affordable: !checkCost(resources, cost),
  }));
  res.json({ options });
});

// ── Node Upgrade & Chip System ────────────────────────────────────────────

// GET /api/node/upgrades?nodeId=X — returns upgrade tree + current state
router.get('/node/upgrades', (req: Request, res: Response) => {
  const nodeId = req.query.nodeId as string;
  if (!nodeId) return res.status(400).json({ error: 'nodeId required' });

  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const key = getUpgradeKey(node.type, node.data.resource);
  const upgrades = NODE_UPGRADE_DEFS[key] || [];
  const currentLevel = node.data.upgradeLevel || 0;
  const resources = state.resources as unknown as Record<string, number>;

  // Node XP info
  const nodeXp = node.data.nodeXp || 0;
  const nextLevel = currentLevel + 1;
  const nodeXpToNext = getNodeXpThreshold(key, nextLevel);
  const xpReady = nodeXpToNext > 0 ? nodeXp >= nodeXpToNext : true; // no threshold = always ready

  const levels = upgrades.map(u => ({
    ...u,
    unlocked: u.level <= currentLevel,
    affordable: Object.entries(u.cost).every(([k, v]) => (resources[k] || 0) >= (v as number)),
    xpReady: u.level <= currentLevel || (u.level === nextLevel && xpReady),
  }));

  res.json({
    nodeId,
    nodeType: node.type,
    resource: node.data.resource,
    currentLevel,
    maxLevel: upgrades.length,
    levels,
    chipSlots: node.data.chipSlots || 0,
    installedChips: node.data.installedChips || [],
    nodeXp,
    nodeXpToNext: nodeXpToNext || 0,
    xpReady,
  });
});

// POST /api/node/upgrade — upgrade a node to next level
router.post('/node/upgrade', (req: Request, res: Response) => {
  const { nodeId } = req.body;
  if (!nodeId) return res.status(400).json({ error: 'nodeId required' });

  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  if (!node.data.unlocked && node.type !== 'hub') return res.status(400).json({ error: 'Node is locked' });

  const key = getUpgradeKey(node.type, node.data.resource);
  const upgrades = NODE_UPGRADE_DEFS[key];
  if (!upgrades) return res.status(400).json({ error: 'No upgrades for this node type' });

  const currentLevel = node.data.upgradeLevel || 0;
  const nextUpgrade = upgrades.find(u => u.level === currentLevel + 1);
  if (!nextUpgrade) return res.status(400).json({ error: 'Already at max level' });

  // Check node XP requirement
  const xpThreshold = getNodeXpThreshold(key, currentLevel + 1);
  const nodeXp = node.data.nodeXp || 0;
  if (xpThreshold > 0 && nodeXp < xpThreshold) {
    return res.status(400).json({ error: `Node needs more experience (${nodeXp}/${xpThreshold} XP)` });
  }

  const resources = state.resources as unknown as Record<string, number>;
  const costError = checkCost(resources, nextUpgrade.cost as Record<string, number>);
  if (costError) return res.status(400).json({ error: costError });
  const newResources = deductCost(resources, nextUpgrade.cost as Record<string, number>);

  // Apply effects
  const newNodes = state.nodes.map((n: any) => {
    if (n.id !== nodeId) return n;
    const data = { ...n.data, upgradeLevel: nextUpgrade.level, nodeXp: 0, nodeXpToNext: 0 };
    if (nextUpgrade.effects.rateBonus) data.rate = (data.rate || 0) + nextUpgrade.effects.rateBonus;
    if (nextUpgrade.effects.chipSlots !== undefined) data.chipSlots = nextUpgrade.effects.chipSlots;
    if (nextUpgrade.effects.autoCollect) data.autoCollect = true;
    if (nextUpgrade.effects.defenseBonus) data.defense = (data.defense || 0) + nextUpgrade.effects.defenseBonus;
    return { ...n, data };
  });

  saveGameState({ ...state, nodes: newNodes, resources: newResources as any });
  broadcastFullState();
  incrementStat('total_upgrades', 1);
  setStatMax('max_node_level', nextUpgrade.level);
  awardXp(XP_REWARDS.upgrade_node);
  checkAchievements();
  checkQuests();
  res.json({ ok: true, level: nextUpgrade.level, name: nextUpgrade.name });
});

// POST /api/node/chip/insert — install a chip into a node slot
router.post('/node/chip/insert', (req: Request, res: Response) => {
  const { nodeId, chipId } = req.body;
  if (!nodeId || !chipId) return res.status(400).json({ error: 'nodeId and chipId required' });

  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const installed = node.data.installedChips || [];
  const slots = node.data.chipSlots || 0;
  if (installed.length >= slots) return res.status(400).json({ error: 'No free chip slots' });

  // Remove chip from player inventory
  const chip = removePlayerChip(chipId);
  if (!chip) return res.status(400).json({ error: 'Chip not found in inventory' });

  // Install on node (store full chip object)
  const newNodes = state.nodes.map((n: any) => {
    if (n.id !== nodeId) return n;
    return { ...n, data: { ...n.data, installedChips: [...installed, chip] } };
  });

  saveGameState({ ...state, nodes: newNodes });
  broadcastFullState();
  incrementStat('total_chips_installed', 1);
  awardXp(XP_REWARDS.install_chip);
  checkAchievements();
  checkQuests();
  res.json({ ok: true });
});

// POST /api/node/chip/remove — remove a chip from a node
router.post('/node/chip/remove', (req: Request, res: Response) => {
  const { nodeId, chipId } = req.body;
  if (!nodeId || !chipId) return res.status(400).json({ error: 'nodeId and chipId required' });

  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const installed: Chip[] = node.data.installedChips || [];
  const chipIdx = installed.findIndex((c: Chip) => c.id === chipId);
  if (chipIdx === -1) return res.status(400).json({ error: 'Chip not installed on this node' });

  const [removed] = installed.splice(chipIdx, 1);

  // Return to player inventory
  addPlayerChip(removed);

  const newNodes = state.nodes.map((n: any) => {
    if (n.id !== nodeId) return n;
    return { ...n, data: { ...n.data, installedChips: [...installed] } };
  });

  saveGameState({ ...state, nodes: newNodes });
  broadcastFullState();
  res.json({ ok: true });
});

// POST /api/chip-pack/buy — buy a chip pack with resources
router.post('/chip-pack/buy', (req: Request, res: Response) => {
  const { packType } = req.body;
  const packDef = CHIP_PACK_DEFS.find(p => p.packType === packType);
  if (!packDef) return res.status(400).json({ error: 'Unknown pack type' });

  const state = getGameState();
  const resources = state.resources as unknown as Record<string, number>;

  const costError = checkCost(resources, packDef.cost as Record<string, number>);
  if (costError) return res.status(400).json({ error: costError });
  const newResources = deductCost(resources, packDef.cost as Record<string, number>);

  addToPlayerInventory(packType, 1);
  saveGameState({ ...state, resources: newResources as any });
  broadcastFullState();
  res.json({ ok: true });
});

// POST /api/chip-pack/open — open a chip pack, get random chips
router.post('/chip-pack/open', (req: Request, res: Response) => {
  const { packType } = req.body;
  const packDef = CHIP_PACK_DEFS.find(p => p.packType === packType);
  if (!packDef) return res.status(400).json({ error: 'Unknown pack type' });

  if (!removeFromPlayerInventory(packType, 1)) {
    return res.status(400).json({ error: 'No pack in inventory' });
  }

  const newChips: Chip[] = [];
  for (let i = 0; i < packDef.chipCount; i++) {
    const def = rollChip(packDef.rarityWeights);
    const chip: Chip = {
      id: `chip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${i}`,
      chipType: def.chipType,
      name: def.name,
      rarity: def.rarity,
      effect: { ...def.effect },
    };
    addPlayerChip(chip);
    newChips.push(chip);
  }

  broadcastFullState();
  incrementStat('total_packs_opened', 1);
  awardXp(XP_REWARDS.open_chip_pack);
  for (const c of newChips) {
    setStatMax('highest_rarity', RARITY_ORDINAL[c.rarity] ?? 0);
  }
  checkAchievements();
  checkQuests();
  res.json({ ok: true, chips: newChips });
});

// GET /api/chip-packs — list available packs with affordability
router.get('/chip-packs', (req: Request, res: Response) => {
  const state = getGameState();
  const resources = state.resources as unknown as Record<string, number>;

  const packs = CHIP_PACK_DEFS.map(p => ({
    ...p,
    affordable: Object.entries(p.cost).every(([k, v]) => (resources[k] || 0) >= (v as number)),
    owned: (getPlayerInventory().find(i => i.itemType === p.packType)?.count) || 0,
  }));

  res.json({ packs, playerChips: getPlayerChips() });
});

// GET /api/achievements
router.get('/achievements', (req: Request, res: Response) => {
  res.json({ achievements: getAchievementList() });
});

// ── Quest System ─────────────────────────────────────────────────────────────

// GET /api/quests — full quest tree with status and progress
router.get('/quests', (req: Request, res: Response) => {
  res.json({ quests: getQuestList(), edges: getQuestEdges() });
});

// POST /api/quests/:questId/claim — claim quest reward
router.post('/quests/:questId/claim', (req: Request, res: Response) => {
  const questId = req.params.questId as string;
  const result = claimQuestReward(questId);
  if (!result.ok) return res.status(400).json({ error: result.error });
  broadcastFullState();
  res.json({ ok: true });
});

// GET /api/passives — active passive effects
router.get('/passives', (req: Request, res: Response) => {
  res.json({ passives: getActivePassives() });
});

// ── Level System ─────────────────────────────────────────────────────────────

// GET /api/level — player level summary
router.get('/level', (req: Request, res: Response) => {
  res.json(getPlayerLevelSummary());
});

// POST /api/worker/action (called by worker subprocesses)
router.post('/worker/action', async (req: Request, res: Response) => {
  const { workerId, action, payload } = req.body;
  if (!workerId || !action) {
    return res.status(400).json({ error: 'workerId and action required' });
  }
  const result = await handleWorkerAction(workerId, action, payload || {});
  res.json(result);
});
