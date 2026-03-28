import express, { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { simpleGit } from 'simple-git';
import {
  getGameState, saveGameState, resetGameState,
  getWorkers, getWorker, upsertWorker, deleteWorker,
  addWorkerLog, getWorkerLogs,
  INITIAL_NODES, INITIAL_EDGES, INITIAL_RESOURCES,
} from './db.js';
import { handleWorkerAction } from './workerActions.js';
import { spawnWorker, killWorker, getActiveProcesses } from './workerSpawner.js';
import { broadcast } from './websocket.js';

export const router: Router = Router();

// ── In-memory store for registered Python worker classes ──────────────────
interface WorkerClassEntry {
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

// POST /api/craft
router.post('/craft', (req: Request, res: Response) => {
  const { itemId } = req.body;
  // Placeholder for crafting system
  res.json({ ok: true, item: itemId, message: 'Crafting system coming soon' });
});

// POST /api/deploy
router.post('/deploy', async (req: Request, res: Response) => {
  const { nodeId, className, commitHash } = req.body;
  if (!nodeId || !className) {
    return res.status(400).json({ error: 'nodeId and className are required' });
  }

  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const workerId = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const workspacePath = getWorkspacePath();

  const result = await spawnWorker({
    workerId,
    nodeId,
    className,
    commitHash: commitHash || 'HEAD',
    workspacePath,
  });

  if (!result.ok) {
    return res.status(500).json({ error: result.error });
  }

  broadcast({ type: 'STATE_UPDATE', payload: { ...state, workers: getWorkers() } });
  res.json({ ok: true, workerId, pid: result.pid });
});

// POST /api/recall
router.post('/recall', (req: Request, res: Response) => {
  const { workerId } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const result = killWorker(workerId);
  if (!result.ok) return res.status(404).json({ error: result.error });

  const state = getGameState();
  broadcast({ type: 'STATE_UPDATE', payload: { ...state, workers: getWorkers() } });
  res.json({ ok: true });
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
  const logs = getWorkerLogs(req.params.id);
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
// Body: { classes: [{ class_name, fields, docstring, file }] }
// Called by the Python daemon on startup to register available worker classes
router.post('/worker-classes/register', (req: Request, res: Response) => {
  const { classes } = req.body as { classes: Omit<WorkerClassEntry, 'language'>[] };
  if (!Array.isArray(classes)) {
    return res.status(400).json({ error: 'classes must be an array' });
  }

  for (const entry of classes) {
    if (!entry.class_name) continue;
    workerClassRegistry.set(entry.class_name, { ...entry, language: 'python' });
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
