import express, { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { simpleGit } from 'simple-git';
import {
  getGameState, saveGameState, resetGameState,
  getWorkers, getWorker, upsertWorker, deleteWorker,
  addWorkerLog, getWorkerLogs,
  INITIAL_NODES, INITIAL_EDGES, INITIAL_RESOURCES, INITIAL_PLAYER_INVENTORY,
  RECIPES, Recipe,
  getPlayerInventory, addToPlayerInventory, removeFromPlayerInventory, getItemEfficiency,
} from './db.js';
import { handleWorkerAction } from './workerActions.js';
import { spawnWorker, killWorker, suspendWorker, getActiveProcesses } from './workerSpawner.js';
import { broadcast } from './websocket.js';

export const router: Router = Router();

// ── In-memory store for registered Python worker classes ──────────────────
interface WorkerClassEntry {
  class_id: string;
  class_name: string;
  fields: Record<string, { type: string; field: string; description: string }>;
  docstring: string;
  file: string;
  language: 'python' | 'javascript';
}

const workerClassRegistry = new Map<string, WorkerClassEntry>();

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

function broadcastFullState() {
  const state = getGameState();
  broadcast({ type: 'STATE_UPDATE', payload: { ...state, workers: getWorkers() } });
}

// GET /api/state
router.get('/state', (req: Request, res: Response) => {
  const state = getGameState();
  const workers = getWorkers();
  res.json({ ...state, workers });
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
  broadcast({ type: 'STATE_UPDATE', payload: { ...state, resources: newResources, workers: getWorkers() } });
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

  for (const [resource, amount] of Object.entries(cost)) {
    if ((resources[resource] || 0) < amount) {
      return res.status(400).json({ error: `Not enough ${resource} (need ${amount}, have ${resources[resource] || 0})` });
    }
  }

  // Deduct cost
  const newResources = { ...resources };
  for (const [resource, amount] of Object.entries(cost)) {
    newResources[resource] -= amount;
  }

  // Unlock node
  const newNodes = state.nodes.map((n: any) => {
    if (n.id === nodeId) {
      return { ...n, data: { ...n.data, unlocked: true } };
    }
    return n;
  });

  saveGameState({ ...state, nodes: newNodes, resources: newResources as any });
  broadcast({ type: 'STATE_UPDATE', payload: { ...state, nodes: newNodes, resources: newResources, workers: getWorkers() } });
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

  // Check resources
  for (const [resource, amount] of Object.entries(recipe.cost)) {
    if ((resources[resource] || 0) < (amount as number)) {
      return res.status(400).json({
        error: `Not enough ${resource} (need ${amount}, have ${resources[resource] || 0})`,
      });
    }
  }

  // Deduct resources
  const newResources = { ...resources };
  for (const [resource, amount] of Object.entries(recipe.cost)) {
    newResources[resource] -= (amount as number);
  }

  // Add item to player inventory
  addToPlayerInventory(recipe.output.itemType, recipe.output.count, recipe.output.metadata);

  saveGameState({ ...state, resources: newResources as any });
  broadcastFullState();

  const inventory = getPlayerInventory();
  const newItem = inventory.find(i => i.itemType === recipe.output.itemType);
  res.json({ ok: true, item: newItem, resources: newResources });
});

// ── Deploy Queue (code server polls this) ────────────────────────────────────

interface DeployRequest {
  id: string;
  workerId: string;
  nodeId: string;
  classId: string;
  equippedItems: Record<string, string>;
  injectedFields: Record<string, any>;
  createdAt: string;
}

const deployQueue: DeployRequest[] = [];

// POST /api/deploy — queues a deploy request for the code server to pick up
router.post('/deploy', async (req: Request, res: Response) => {
  const { nodeId, classId, equippedItems, routes } = req.body;
  if (!nodeId || !classId) {
    return res.status(400).json({ error: 'nodeId and classId are required' });
  }

  // Verify class is registered
  const workerClass = workerClassRegistry.get(classId);
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
  // Inject route fields (routes: { fieldName: ['hub', 'r1', 'r2'] })
  if (routes && typeof routes === 'object') {
    for (const [fieldName, path] of Object.entries(routes)) {
      if (Array.isArray(path)) {
        injectedFields[fieldName] = path;
      }
    }
  }

  // Register the worker in DB as deploying
  upsertWorker({
    id: workerId,
    node_id: nodeId,
    class_name: workerClass.class_name,
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
  deployQueue.push({
    id: workerId,
    workerId,
    nodeId,
    classId,
    equippedItems: equippedItems || {},
    injectedFields,
    createdAt: new Date().toISOString(),
  });

  broadcastFullState();
  res.json({ ok: true, workerId, status: 'queued' });
});

// GET /api/deploy-queue — code server polls this to pick up deploy requests
router.get('/deploy-queue', (req: Request, res: Response) => {
  const pending = deployQueue.splice(0, deployQueue.length);
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

  // For deploying/suspended/crashed workers — just delete, no process to kill
  if (['deploying', 'suspended', 'crashed'].includes(worker.status)) {
    // Remove from deploy queue if still pending
    const queueIdx = deployQueue.findIndex(r => r.workerId === workerId);
    if (queueIdx !== -1) deployQueue.splice(queueIdx, 1);

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

  const state = getGameState();
  broadcast({ type: 'STATE_UPDATE', payload: { ...state, workers: getWorkers() } });
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

  const state = getGameState();
  broadcast({ type: 'STATE_UPDATE', payload: { ...state, workers: getWorkers() } });
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
  const state = getGameState();
  broadcast({ type: 'STATE_UPDATE', payload: { ...state, workers: [] } });
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
    workerClassRegistry.set(entry.class_id, { ...entry, language: 'python' });
  }

  res.json({ ok: true, registered: classes.length });
});

// GET /api/worker-classes
// Returns all registered worker classes (for UI deploy dropdown)
router.get('/worker-classes', (req: Request, res: Response) => {
  const classes = Array.from(workerClassRegistry.values());
  res.json({ classes });
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
