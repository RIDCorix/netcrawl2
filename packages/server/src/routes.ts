import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { simpleGit } from 'simple-git';
import {
  getGameState, getVisibleState, saveGameState, resetGameState,
  getWorkers, getWorker, upsertWorker, deleteWorker, resetAllWorkers,
  addWorkerLog, getWorkerLogs,
  INITIAL_NODES, INITIAL_EDGES, INITIAL_RESOURCES, INITIAL_PLAYER_INVENTORY,
  RECIPES, Recipe, Chip,
  getPlayerInventory, addToPlayerInventory, removeFromPlayerInventory, getItemEfficiency, getCpuComputePoints, getRamCapacityBonus, getItemComputeCost,
  getPlayerChips, addPlayerChip, removePlayerChip,
  getLayerManager, isLayerUnlocked, switchActiveLayer, getStat,
  setCurrentUser,
  allocateFlop, releaseFlop, FLOP_COSTS,
  getAutosave, restoreAutosave,
} from './db.js';
import { LAYER_DEFS } from './layerDefinitions.js';
import { handleWorkerAction } from './workerActions.js';
import { spawnWorker, killWorker, suspendWorker, getActiveProcesses } from './workerSpawner.js';
import { checkCost, deductCost } from './stateHelpers.js';
import { markCodeServerSeen, isCodeServerConnected } from './codeServerTracker.js';
import {
  type WorkerClassEntry, registerWorkerClass, getWorkerClass, getAllWorkerClasses,
  type DeployRequest, enqueueDeploy, drainDeployQueue, removeFromDeployQueue,
} from './workerRegistry.js';
import { broadcastFullState } from './broadcastHelper.js';
import {
  NODE_UPGRADE_DEFS, getUpgradeKey, CHIP_PACK_DEFS, rollChip, getNodeXpThreshold, NODE_STAT_DEFS,
} from './upgradeDefinitions.js';
import { checkAchievements, getAchievementList, RARITY_ORDINAL } from './achievements.js';
import { checkQuests, claimQuestReward, getQuestList, getQuestEdges } from './quests.js';
import { getQuestStatus, setQuestStatus } from './db.js';
import { getActivePassives, getUnlockedRecipes } from './db.js';
import { incrementStat, addToStatArray, getStatArray, setStatMax, awardXp, getPlayerLevelSummary, grantNodeXp } from './db.js';
import { XP_REWARDS } from './levelSystem.js';
import { authMiddleware, AuthenticatedRequest } from './auth.js';
import { authRouter } from './authRoutes.js';

export const router: Router = Router();

// ── Auth routes (always public) ─────────────────────────────────────────────
router.use('/auth', authRouter);

// ── Multi-user auth middleware ──────────────────────────────────────────────
// In cloud mode (NETCRAWL_MULTI_USER=true), require auth and scope state per user.
// In local mode, skip auth entirely — single-user, no login needed.
if (process.env.NETCRAWL_MULTI_USER === 'true') {
  router.use((req: Request, res: Response, next: NextFunction) => {
    authMiddleware(req as AuthenticatedRequest, res, () => {
      const authReq = req as AuthenticatedRequest;
      if (authReq.user) {
        // Set global userId for backward compat AND store it on request
        setCurrentUser(authReq.user.userId);
        (req as any)._userId = authReq.user.userId;
      }
      next();
    });
  });
}

/** Extract userId from request (set by auth middleware in multi-user mode). */
function getUserId(req: Request): string | undefined {
  return (req as any)._userId || undefined;
}

/** Return all equipment + held items from a worker to player inventory */
function returnWorkerItems(worker: any, uid?: string) {
  if (worker.equippedPickaxe) {
    addToPlayerInventory(worker.equippedPickaxe.itemType, 1, undefined, uid);
  }
  if (worker.equippedCpu) {
    addToPlayerInventory(worker.equippedCpu.itemType, worker.equippedCpu.count || 1, undefined, uid);
  }
  if (worker.equippedRam) {
    addToPlayerInventory(worker.equippedRam.itemType, worker.equippedRam.count || 1, undefined, uid);
  }
  for (const item of (worker.holding || [])) {
    if (item.type !== 'bad_data') {
      addToPlayerInventory(item.type, item.count, undefined, uid);
    }
  }
}

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
  const uid = getUserId(req);
  const state = getGameState(uid);
  const { nodes, edges } = getVisibleState(2, uid);
  const workers = getWorkers(uid);
  const workerClasses = getAllWorkerClasses(uid);
  const codeServerConnected = isCodeServerConnected(uid);
  res.json({ ...state, nodes, edges, workers, workerClasses, codeServerConnected });
});

// POST /api/gather
router.post('/gather', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId } = req.body;
  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  if (!node.data.unlocked) return res.status(400).json({ error: 'Node not unlocked' });

  const resourceType = node.data.resource as string;
  if (!resourceType) return res.status(400).json({ error: 'Not a resource node' });

  const newResources = { ...state.resources };
  (newResources as any)[resourceType] = ((newResources as any)[resourceType] || 0) + 10;
  saveGameState({ ...state, resources: newResources }, uid);
  grantNodeXp(nodeId, 'harvest', uid);
  broadcastFullState(uid);
  res.json({ ok: true, resources: newResources });
});

// POST /api/unlock
router.post('/unlock', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId } = req.body;
  const state = getGameState(uid);
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

  saveGameState({ ...state, nodes: newNodes, resources: newResources as any }, uid);
  broadcastFullState(uid);
  incrementStat('total_nodes_unlocked', 1, uid);
  awardXp(XP_REWARDS.unlock_node, uid);
  checkAchievements(uid);
  checkQuests(uid);
  res.json({ ok: true, resources: newResources });
});

// GET /api/inventory
router.get('/inventory', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const inventory = getPlayerInventory(uid);
  res.json({ inventory, recipes: RECIPES });
});

// GET /api/recipes
router.get('/recipes', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const state = getGameState(uid);
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
  const uid = getUserId(req);
  const { recipeId } = req.body;
  const recipe = RECIPES.find(r => r.id === recipeId);
  if (!recipe) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  const state = getGameState(uid);
  const resources = state.resources as unknown as Record<string, number>;

  const costError = checkCost(resources, recipe.cost as Record<string, number>);
  if (costError) return res.status(400).json({ error: costError });
  const newResources = deductCost(resources, recipe.cost as Record<string, number>);

  // Add item to player inventory
  addToPlayerInventory(recipe.output.itemType, recipe.output.count, recipe.output.metadata, uid);

  saveGameState({ ...state, resources: newResources as any }, uid);
  broadcastFullState(uid);

  incrementStat('total_crafts', 1, uid);
  addToStatArray('crafted_recipes', recipe.id, uid);
  awardXp(XP_REWARDS.craft_item, uid);
  checkAchievements(uid);
  checkQuests(uid);

  const inventory = getPlayerInventory(uid);
  const newItem = inventory.find(i => i.itemType === recipe.output.itemType);
  res.json({ ok: true, item: newItem, resources: newResources });
});

// POST /api/deploy — queues a deploy request for the code server to pick up
router.post('/deploy', async (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId, classId, equippedItems, routes } = req.body;
  if (!nodeId || !classId) {
    return res.status(400).json({ error: 'nodeId and classId are required' });
  }

  // Verify class is registered
  const workerClass = getWorkerClass(classId, uid);
  if (!workerClass) {
    return res.status(400).json({ error: `Unknown worker class: ${classId}` });
  }

  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  // Check FLOP capacity
  const flopCost = FLOP_COSTS.worker;
  if (!allocateFlop(flopCost, uid)) {
    const { used, total } = state.flop;
    return res.status(400).json({ ok: false, error: `Not enough FLOP capacity. Current: ${used}/${total}` });
  }

  // Handle CPU modules — deduct N from inventory, sum compute points
  const cpuCount: number = Number(equippedItems?.cpuCount) || 0;
  const cpuItemType: string = equippedItems?.cpuType || 'cpu_basic';
  let equippedCpu: { itemType: string; computePoints: number; count: number } | null = null;
  if (cpuCount > 0) {
    const removed = removeFromPlayerInventory(cpuItemType, cpuCount, uid);
    if (!removed) {
      releaseFlop(flopCost, uid);
      return res.status(400).json({ error: `Not enough ${cpuItemType} (need ${cpuCount})` });
    }
    equippedCpu = { itemType: cpuItemType, computePoints: getCpuComputePoints(cpuItemType) * cpuCount, count: cpuCount };
  }

  // Handle RAM modules — deduct N from inventory, sum capacity
  const ramCount: number = Number(equippedItems?.ramCount) || 0;
  const ramItemType: string = equippedItems?.ramType || 'ram_basic';
  let equippedRam: { itemType: string; capacityBonus: number; count: number } | null = null;
  if (ramCount > 0) {
    const removed = removeFromPlayerInventory(ramItemType, ramCount, uid);
    if (!removed) {
      releaseFlop(flopCost, uid);
      if (equippedCpu) addToPlayerInventory(equippedCpu.itemType, equippedCpu.count, undefined, uid);
      return res.status(400).json({ error: `Not enough ${ramItemType} (need ${ramCount})` });
    }
    equippedRam = { itemType: ramItemType, capacityBonus: getRamCapacityBonus(ramItemType) * ramCount, count: ramCount };
  }

  // Handle equipped pickaxe — deduct from inventory, check compute budget
  let equippedPickaxe: { itemType: string; efficiency: number } | null = null;
  const pickaxeItemType = equippedItems?.pickaxe;
  if (pickaxeItemType) {
    const baseCompute = 1;
    const totalCompute = baseCompute + (equippedCpu?.computePoints || 0);
    // Sum compute costs of all equipped items
    let totalCost = getItemComputeCost(pickaxeItemType);
    if (totalCost > totalCompute) {
      releaseFlop(flopCost, uid);
      if (equippedCpu) addToPlayerInventory(equippedCpu.itemType, equippedCpu.count, undefined, uid);
      if (equippedRam) addToPlayerInventory(equippedRam.itemType, equippedRam.count, undefined, uid);
      return res.status(400).json({ error: `Not enough compute (need ${totalCost}, have ${totalCompute}). Add more CPU.` });
    }
    const removed = removeFromPlayerInventory(pickaxeItemType, 1, uid);
    if (!removed) {
      releaseFlop(flopCost, uid);
      if (equippedCpu) addToPlayerInventory(equippedCpu.itemType, equippedCpu.count, undefined, uid);
      if (equippedRam) addToPlayerInventory(equippedRam.itemType, equippedRam.count, undefined, uid);
      return res.status(400).json({ error: `Not enough ${pickaxeItemType} in inventory` });
    }
    equippedPickaxe = { itemType: pickaxeItemType, efficiency: getItemEfficiency(pickaxeItemType) };
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
    holding: [],
    equippedPickaxe,
    equippedCpu,
    equippedRam,
    deployConfig: { classId, equippedItems: equippedItems || {}, injectedFields },
  }, uid);

  // Queue for code server
  enqueueDeploy({
    id: workerId,
    workerId,
    nodeId,
    classId,
    equippedItems: equippedItems || {},
    injectedFields,
    createdAt: new Date().toISOString(),
  }, uid);

  broadcastFullState(uid);
  incrementStat('total_workers_deployed', 1, uid);
  addToStatArray('deployed_class_ids', classId, uid);
  setStatMax('total_worker_classes_deployed', getStatArray('deployed_class_ids', uid).length, uid);
  awardXp(XP_REWARDS.deploy_worker, uid);
  checkAchievements(uid);
  checkQuests(uid);
  res.json({ ok: true, workerId, status: 'queued' });
});

// GET /api/deploy-queue — code server polls this to pick up deploy requests
router.get('/deploy-queue', (req: Request, res: Response) => {
  const uid = getUserId(req);
  markCodeServerSeen(uid);
  const pending = drainDeployQueue(uid);
  res.json({ requests: pending });
});

// POST /api/deploy-ack — code server reports that a worker was spawned
router.post('/deploy-ack', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId, pid, error: spawnError } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId, uid);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  if (spawnError) {
    // Spawn failed — return all equipment and release FLOP
    returnWorkerItems(worker, uid);
    releaseFlop(FLOP_COSTS.worker, uid);
    upsertWorker({ ...worker, status: 'crashed' }, uid);
    addWorkerLog(workerId, `[ERROR] Spawn failed: ${spawnError}`, uid);
  } else {
    upsertWorker({ ...worker, status: 'running', pid: pid || null }, uid);
    addWorkerLog(workerId, `[INFO] Worker spawned (PID ${pid})`, uid);
  }

  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/recall
router.post('/recall', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId, uid);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  // Return all equipment + held items to player inventory
  returnWorkerItems(worker, uid);

  // For deploying/suspended/crashed/error workers — just delete, no process to kill
  if (['deploying', 'suspended', 'crashed', 'error'].includes(worker.status)) {
    // Remove from deploy queue if still pending
    removeFromDeployQueue(workerId, uid);

    releaseFlop(FLOP_COSTS.worker, uid);
    deleteWorker(workerId, uid);
    broadcastFullState(uid);
    return res.json({ ok: true });
  }

  // For running workers — kill the process
  const result = killWorker(workerId);
  if (!result.ok) {
    // Process not found but worker exists — just clean up
    releaseFlop(FLOP_COSTS.worker, uid);
    deleteWorker(workerId, uid);
    broadcastFullState(uid);
    return res.json({ ok: true });
  }

  // Process killed — exit handler will set status to suspended/crashed.
  // FLOP released when worker is eventually recalled (deleteWorker path above).
  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/worker/reset — reset worker to deploy position, return items, allow restart
router.post('/worker/reset', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId, uid);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  // Kill process if running
  if (['running', 'moving', 'harvesting', 'idle'].includes(worker.status)) {
    killWorker(workerId);
  }

  // Return all equipment + held items
  returnWorkerItems(worker, uid);

  // Reset worker state and re-deploy
  upsertWorker({
    ...worker,
    current_node: worker.node_id,
    status: 'deploying',
    pid: null,
    holding: [],
    carrying: {},
    equippedPickaxe: null,
    equippedCpu: null,
    equippedRam: null,
  }, uid);

  // Rebuild deployConfig if missing (for workers deployed before this feature)
  const config = worker.deployConfig || {
    classId: (() => {
      const allClasses = getAllWorkerClasses(uid);
      const match = allClasses.find(c => c.class_name === worker.class_name);
      return match?.class_id || worker.class_name.toLowerCase();
    })(),
    equippedItems: {},
    injectedFields: {},
  };

  // Allocate FLOP for the redeploying worker
  if (!allocateFlop(FLOP_COSTS.worker, uid)) {
    upsertWorker({ ...worker, current_node: worker.node_id, status: 'suspended', pid: null, holding: [], carrying: {} }, uid);
    broadcastFullState(uid);
    return res.status(400).json({ ok: false, error: 'Not enough FLOP' });
  }

  // Enqueue for code server pickup
  enqueueDeploy({
    id: worker.id,
    workerId: worker.id,
    nodeId: worker.node_id,
    classId: config.classId,
    equippedItems: config.equippedItems,
    injectedFields: config.injectedFields,
    createdAt: new Date().toISOString(),
  }, uid);
  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/worker/suspend
router.post('/worker/suspend', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId, uid);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  if (worker.status !== 'running') {
    return res.status(400).json({ error: `Worker is not running (status: ${worker.status})` });
  }

  // Mark as suspending
  upsertWorker({ ...worker, status: 'suspending' }, uid);

  // Send SIGTERM to the child process
  const result = suspendWorker(workerId);
  if (!result.ok) {
    // If no process found, mark as suspended anyway and return items
    returnWorkerItems(worker, uid);
    upsertWorker({ ...worker, status: 'suspended', pid: null, equippedPickaxe: null, equippedCpu: null, equippedRam: null, holding: [] }, uid);
  }

  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/worker/suspend-all
router.post('/worker/suspend-all', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const workers = getWorkers(uid);
  const running = workers.filter(w => w.status === 'running');

  for (const worker of running) {
    upsertWorker({ ...worker, status: 'suspending' }, uid);
    const result = suspendWorker(worker.id);
    if (!result.ok) {
      returnWorkerItems(worker, uid);
      upsertWorker({ ...worker, status: 'suspended', pid: null, equippedPickaxe: null, equippedCpu: null, equippedRam: null, holding: [] }, uid);
    }
  }

  broadcastFullState(uid);
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
  const uid = getUserId(req);
  const workers = getWorkers(uid);
  res.json({ workers });
});

// GET /api/worker/:id/logs
router.get('/worker/:id/logs', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const logs = getWorkerLogs(req.params.id as string, uid);
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

// GET /api/autosave — metadata about the latest healthy snapshot
router.get('/autosave', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const snap = getAutosave(uid);
  if (!snap) return res.json({ exists: false });
  res.json({ exists: true, ts: snap.ts, tick: snap.tick });
});

// POST /api/autosave/restore — roll the world back to the latest autosave
router.post('/autosave/restore', (req: Request, res: Response) => {
  const uid = getUserId(req);
  // Kill any running worker processes — they'd be orphaned by the rollback
  const activeProcesses = getActiveProcesses();
  for (const [id, child] of activeProcesses) {
    child.kill('SIGTERM');
  }
  activeProcesses.clear();

  const ok = restoreAutosave(uid);
  if (!ok) return res.status(404).json({ ok: false, error: 'no_autosave' });
  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/reset
router.post('/reset', (req: Request, res: Response) => {
  const uid = getUserId(req);
  // Kill all active processes first
  const activeProcesses = getActiveProcesses();
  for (const [id, child] of activeProcesses) {
    child.kill('SIGTERM');
  }
  activeProcesses.clear();

  resetGameState(uid);
  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/worker-classes/register
// Body: { classes: [{ class_id, class_name, fields, docstring, file }] }
// Called by the Python code server on startup to register available worker classes
router.post('/worker-classes/register', (req: Request, res: Response) => {
  const uid = getUserId(req);
  markCodeServerSeen(uid);
  const { classes } = req.body as { classes: Omit<WorkerClassEntry, 'language'>[] };
  if (!Array.isArray(classes)) {
    return res.status(400).json({ error: 'classes must be an array' });
  }

  for (const entry of classes) {
    if (!entry.class_id) continue;
    registerWorkerClass({ ...entry, language: 'python' }, uid);
  }

  // Mark code server as connected (triggers q_setup quest)
  incrementStat('code_server_connected', 1, uid);
  checkQuests(uid);

  // Auto-resume suspended workers: re-enqueue them with deploy config
  const allWorkers = getWorkers(uid);
  const allClasses = getAllWorkerClasses(uid);
  let resumed = 0;
  for (const w of allWorkers) {
    if (w.status !== 'suspended') continue;

    // Rebuild config if missing (for workers deployed before deployConfig feature)
    const config = w.deployConfig || {
      classId: allClasses.find(c => c.class_name === w.class_name)?.class_id || w.class_name.toLowerCase(),
      equippedItems: {},
      injectedFields: {},
    };

    // Verify class is registered
    const wc = getWorkerClass(config.classId, uid);
    if (!wc) continue;

    // Re-allocate FLOP
    if (!allocateFlop(FLOP_COSTS.worker, uid)) {
      console.log(`[NetCrawl] Cannot resume worker ${w.id}: not enough FLOP`);
      continue;
    }

    // Mark as deploying
    upsertWorker({ ...w, status: 'deploying', deployConfig: config }, uid);

    // Re-enqueue
    enqueueDeploy({
      id: w.id,
      workerId: w.id,
      nodeId: w.node_id,
      classId: config.classId,
      equippedItems: config.equippedItems,
      injectedFields: config.injectedFields,
      createdAt: new Date().toISOString(),
    }, uid);
    resumed++;
  }
  if (resumed > 0) {
    console.log(`[NetCrawl] Auto-resumed ${resumed} suspended workers`);
  }

  broadcastFullState(uid);
  res.json({ ok: true, registered: classes.length, resumed });
});

// POST /api/code-server/disconnect
// Called by the Python code server on shutdown to reset all workers
router.post('/code-server/disconnect', (req: Request, res: Response) => {
  const uid = getUserId(req);
  resetAllWorkers(uid);
  broadcastFullState(uid);
  console.log('[NetCrawl] Code server disconnected — all workers reset to suspended');
  res.json({ ok: true });
});

// GET /api/worker-classes
// Returns all registered worker classes (for UI deploy dropdown)
router.get('/worker-classes', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const classes = getAllWorkerClasses(uid);
  res.json({ classes });
});

// ── Build System (empty → structure) ──────────────────────────────────────

const BUILD_COSTS: Record<string, Record<string, number>> = {
  cache: { data: 150000, rp: 5 },
  api: { data: 200000, rp: 8 },
};

router.post('/node/build', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId, structureType } = req.body;
  if (!nodeId || !structureType) return res.status(400).json({ error: 'nodeId and structureType required' });

  const cost = BUILD_COSTS[structureType];
  if (!cost) return res.status(400).json({ error: `Unknown structure type: ${structureType}` });

  const state = getGameState(uid);
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

  saveGameState({ ...state, nodes: newNodes, resources: newResources as any }, uid);
  broadcastFullState(uid);
  incrementStat('total_structures_built', 1, uid);
  awardXp(XP_REWARDS.build_structure, uid);
  checkAchievements(uid);
  checkQuests(uid);
  res.json({ ok: true, nodeId, structureType });
});

// GET /api/node/build-options — what can be built on an empty node
router.get('/node/build-options', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const state = getGameState(uid);
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
  const uid = getUserId(req);
  const nodeId = req.query.nodeId as string;
  if (!nodeId) return res.status(400).json({ error: 'nodeId required' });

  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const key = getUpgradeKey(node.type, node.data.resource);
  const upgrades = NODE_UPGRADE_DEFS[key] || [];
  const currentLevel = node.data.upgradeLevel || 0;

  // Node XP info
  const nodeXp = node.data.nodeXp || 0;
  const nextLevel = currentLevel + 1;
  const nodeXpToNext = getNodeXpThreshold(key, nextLevel);
  const maxLevel = upgrades.length;

  // Stat allocation info
  const statDefs = NODE_STAT_DEFS[key] || NODE_STAT_DEFS[node.type] || [];
  const statAlloc: Record<string, number> = node.data.statAlloc || {};
  const enhancementPoints: number = node.data.enhancementPoints || 0;
  const spentPoints = Object.values(statAlloc).reduce((s: number, v: number) => s + v, 0);
  const availablePoints = enhancementPoints - spentPoints;

  res.json({
    nodeId,
    nodeType: node.type,
    resource: node.data.resource,
    currentLevel,
    maxLevel,
    chipSlots: node.data.chipSlots || 0,
    installedChips: node.data.installedChips || [],
    nodeXp,
    nodeXpToNext: nodeXpToNext || 0,
    // Stat allocation
    enhancementPoints,
    availablePoints,
    statAlloc,
    statDefs,
  });
});

// POST /api/node/stat/allocate — spend enhancement points on a node stat
router.post('/node/stat/allocate', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId, statKey, delta } = req.body; // delta: +1 or -1
  if (!nodeId || !statKey || delta === undefined) return res.status(400).json({ error: 'nodeId, statKey, delta required' });

  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  if (!node.data.unlocked && node.type !== 'hub') return res.status(400).json({ error: 'Node is locked' });

  const key = getUpgradeKey(node.type, node.data.resource);
  const statDefs = NODE_STAT_DEFS[key] || NODE_STAT_DEFS[node.type] || [];
  const statDef = statDefs.find(s => s.key === statKey);
  if (!statDef) return res.status(400).json({ error: 'Invalid stat for this node' });

  const statAlloc: Record<string, number> = { ...(node.data.statAlloc || {}) };
  const currentAlloc = statAlloc[statKey] || 0;
  const enhancementPoints: number = node.data.enhancementPoints || 0;
  const spentPoints = Object.values(statAlloc).reduce((s: number, v: number) => s + v, 0);
  const available = enhancementPoints - spentPoints;

  const d = Number(delta);
  if (d === 1) {
    if (available <= 0) return res.status(400).json({ error: 'No enhancement points available' });
    if (currentAlloc >= statDef.maxPoints) return res.status(400).json({ error: 'Stat is at max' });
  } else if (d === -1) {
    if (currentAlloc <= 0) return res.status(400).json({ error: 'Stat is already at 0' });
  } else {
    return res.status(400).json({ error: 'delta must be +1 or -1' });
  }

  statAlloc[statKey] = currentAlloc + d;

  // Recalculate effective node stats from base + allocation
  const data = { ...node.data, statAlloc };
  // Apply stat effect
  if (statKey === 'rate') data.rate = (data.baseRate || data.rate || 0) + (statAlloc.rate || 0) * statDef.perPoint;
  if (statKey === 'defense') data.defense = (data.baseDefense || 0) + (statAlloc.defense || 0) * statDef.perPoint;
  if (statKey === 'chipSlots') data.chipSlots = (data.baseChipSlots || 1) + (statAlloc.chipSlots || 0) * statDef.perPoint;

  const newNodes = state.nodes.map((n: any) => n.id === nodeId ? { ...n, data } : n);
  saveGameState({ ...state, nodes: newNodes }, uid);
  broadcastFullState(uid);
  checkQuests(uid);

  res.json({
    ok: true,
    statAlloc,
    availablePoints: enhancementPoints - Object.values(statAlloc).reduce((s: number, v: number) => s + v, 0),
  });
});

// POST /api/node/chip/insert — install a chip into a node slot
router.post('/node/chip/insert', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId, chipId } = req.body;
  if (!nodeId || !chipId) return res.status(400).json({ error: 'nodeId and chipId required' });

  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const installed = node.data.installedChips || [];
  const slots = node.data.chipSlots || 0;
  if (installed.length >= slots) return res.status(400).json({ error: 'No free chip slots' });

  // Remove chip from player inventory
  const chip = removePlayerChip(chipId, uid);
  if (!chip) return res.status(400).json({ error: 'Chip not found in inventory' });

  // Install on node (store full chip object)
  const newNodes = state.nodes.map((n: any) => {
    if (n.id !== nodeId) return n;
    return { ...n, data: { ...n.data, installedChips: [...installed, chip] } };
  });

  saveGameState({ ...state, nodes: newNodes }, uid);
  broadcastFullState(uid);
  incrementStat('total_chips_installed', 1, uid);
  awardXp(XP_REWARDS.install_chip, uid);
  checkAchievements(uid);
  checkQuests(uid);
  res.json({ ok: true });
});

// POST /api/node/chip/remove — remove a chip from a node
router.post('/node/chip/remove', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId, chipId } = req.body;
  if (!nodeId || !chipId) return res.status(400).json({ error: 'nodeId and chipId required' });

  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const installed: Chip[] = node.data.installedChips || [];
  const chipIdx = installed.findIndex((c: Chip) => c.id === chipId);
  if (chipIdx === -1) return res.status(400).json({ error: 'Chip not installed on this node' });

  const [removed] = installed.splice(chipIdx, 1);

  // Return to player inventory
  addPlayerChip(removed, uid);

  const newNodes = state.nodes.map((n: any) => {
    if (n.id !== nodeId) return n;
    return { ...n, data: { ...n.data, installedChips: [...installed] } };
  });

  saveGameState({ ...state, nodes: newNodes }, uid);
  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/chip-pack/buy — buy a chip pack with resources
router.post('/chip-pack/buy', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { packType } = req.body;
  const packDef = CHIP_PACK_DEFS.find(p => p.packType === packType);
  if (!packDef) return res.status(400).json({ error: 'Unknown pack type' });

  const state = getGameState(uid);
  const resources = state.resources as unknown as Record<string, number>;

  const costError = checkCost(resources, packDef.cost as Record<string, number>);
  if (costError) return res.status(400).json({ error: costError });
  const newResources = deductCost(resources, packDef.cost as Record<string, number>);

  addToPlayerInventory(packType, 1, undefined, uid);
  saveGameState({ ...state, resources: newResources as any }, uid);
  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/chip-pack/open — open a chip pack, get random chips
router.post('/chip-pack/open', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { packType } = req.body;
  const packDef = CHIP_PACK_DEFS.find(p => p.packType === packType);
  if (!packDef) return res.status(400).json({ error: 'Unknown pack type' });

  if (!removeFromPlayerInventory(packType, 1, uid)) {
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
    addPlayerChip(chip, uid);
    newChips.push(chip);
  }

  broadcastFullState(uid);
  incrementStat('total_packs_opened', 1, uid);
  awardXp(XP_REWARDS.open_chip_pack, uid);
  for (const c of newChips) {
    setStatMax('highest_rarity', RARITY_ORDINAL[c.rarity] ?? 0, uid);
  }
  checkAchievements(uid);
  checkQuests(uid);
  res.json({ ok: true, chips: newChips });
});

// GET /api/chip-packs — list available packs with affordability
router.get('/chip-packs', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const state = getGameState(uid);
  const resources = state.resources as unknown as Record<string, number>;

  const packs = CHIP_PACK_DEFS.map(p => ({
    ...p,
    affordable: Object.entries(p.cost).every(([k, v]) => (resources[k] || 0) >= (v as number)),
    owned: (getPlayerInventory(uid).find(i => i.itemType === p.packType)?.count) || 0,
  }));

  res.json({ packs, playerChips: getPlayerChips(uid) });
});

// GET /api/achievements
router.get('/achievements', (req: Request, res: Response) => {
  const uid = getUserId(req);
  res.json({ achievements: getAchievementList(uid) });
});

// ── Quest System ─────────────────────────────────────────────────────────────

// GET /api/quests — full quest tree with status and progress
router.get('/quests', (req: Request, res: Response) => {
  const uid = getUserId(req);
  res.json({ quests: getQuestList(uid), edges: getQuestEdges() });
});

// POST /api/quests/:questId/claim — claim quest reward
router.post('/quests/:questId/claim', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const questId = req.params.questId as string;
  const result = claimQuestReward(questId, uid);
  if (!result.ok) return res.status(400).json({ error: result.error });
  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/quests/claim-all — claim all completed quests at once
router.post('/quests/claim-all', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const questList = getQuestList(uid);
  let claimed = 0;
  for (const q of questList) {
    if (q.status === 'completed') {
      const result = claimQuestReward(q.id, uid);
      if (result.ok) claimed++;
    }
  }
  broadcastFullState(uid);
  res.json({ ok: true, claimed });
});

// POST /api/quests/:questId/skip — skip quest (mark completed + claim rewards)
router.post('/quests/:questId/skip', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const questId = req.params.questId as string;
  const status = getQuestStatus(questId, uid);
  if (status === 'claimed') return res.status(400).json({ error: 'Already claimed' });

  // Force-complete: set status to completed, then claim
  setQuestStatus(questId, 'completed', uid);
  const result = claimQuestReward(questId, uid);
  if (!result.ok) return res.status(400).json({ error: result.error });
  broadcastFullState(uid);
  res.json({ ok: true, skipped: true });
});

// GET /api/passives — active passive effects
router.get('/passives', (req: Request, res: Response) => {
  const uid = getUserId(req);
  res.json({ passives: getActivePassives(uid) });
});

// ── Level System ─────────────────────────────────────────────────────────────

// GET /api/level — player level summary
router.get('/level', (req: Request, res: Response) => {
  const uid = getUserId(req);
  res.json(getPlayerLevelSummary(uid));
});

// POST /api/worker/action (called by worker subprocesses)
router.post('/worker/action', async (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId, action, payload } = req.body;
  if (!workerId || !action) {
    return res.status(400).json({ error: 'workerId and action required' });
  }
  const result = await handleWorkerAction(workerId, action, payload || {}, uid);
  res.json(result);
});

// GET /api/layers
router.get('/layers', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const state = getGameState(uid);
  const layerManager = getLayerManager(uid);

  const layers = LAYER_DEFS.map(def => {
    const unlocked = isLayerUnlocked(def.id, uid);
    const isActive = (layerManager?.currentLayer ?? 0) === def.id;
    const progress: Record<string, number> = {};
    const thresh = def.unlockThresholds;
    if (thresh) {
      if (thresh.total_data_deposited !== undefined) progress.total_data_deposited = getStat('total_data_deposited', uid);
      if (thresh.rp !== undefined) progress.rp = state.resources.rp;
      if (thresh.credits !== undefined) progress.credits = state.resources.credits;
    }
    return { ...def, unlocked, isActive, progress };
  });

  res.json({ layers, activeLayer: layerManager?.currentLayer ?? 0 });
});

// POST /api/layer/switch
router.post('/layer/switch', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { layerId } = req.body;
  if (layerId === undefined || typeof layerId !== 'number') {
    return res.status(400).json({ error: 'layerId (number) required' });
  }

  const activeWorkers = getWorkers(uid).filter((w: any) =>
    ['running', 'moving', 'harvesting'].includes(w.status)
  );
  if (activeWorkers.length > 0) {
    return res.status(400).json({
      error: 'Recall all active workers before switching layers',
      reason: 'workers_running',
      count: activeWorkers.length,
    });
  }

  const result = switchActiveLayer(layerId, uid);
  if (!result.ok) return res.status(400).json({ error: result.error });

  broadcastFullState(uid);
  res.json({ ok: true, layerId });
});
