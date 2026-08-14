/**
 * Worker lifecycle & management routes.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { simpleGit } from 'simple-git';
import { FLOP_COSTS } from '../types.js';
import { getGameState, resetGameState } from '../domain/gameState.js';
import { getWorkers, getWorker, upsertWorker, deleteWorker, resetAllWorkers, getWorkerLogs, allocateWorkerFlop, releaseWorkerFlop, releaseFlop } from '../domain/workers.js';
import { addToPlayerInventory } from '../domain/inventory.js';
import { getAutosave, restoreAutosave } from '../domain/autosave.js';
import { incrementStat } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import {
  type WorkerClassEntry,
  registerWorkerClass, getWorkerClass, getAllWorkerClasses,
  enqueueDeploy, removeFromDeployQueue,
} from '../workerRegistry.js';
import { killWorker, suspendWorker, getActiveProcesses } from '../workerSpawner.js';
import { markCodeServerSeen, invalidateCodeServerLease } from '../codeServerTracker.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { checkQuests } from '../quests.js';
import { getUserId, returnWorkerItems, getWorkspacePath } from './helpers.js';
import { rebuildInjectedEquipment } from '../deployEquipment.js';
import type { AuthenticatedRequest } from '../auth.js';

export const workerRoutes = Router();

const staleExecution = (res: Response) =>
  res.json({ ok: false, reason: 'stale_execution', error: 'Worker execution is no longer current' });

function hasExecutionFence(
  generation: unknown,
  executionToken: unknown,
  worker: { generation?: number; executionToken?: string },
): boolean {
  return (
    generation !== undefined &&
    generation !== null &&
    typeof executionToken === 'string' &&
    executionToken.length > 0 &&
    worker.generation === Number(generation) &&
    worker.executionToken === executionToken
  );
}

// POST /api/recall
workerRoutes.post('/recall', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId, uid);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  // Delete the authority record before signaling the disposable process; its
  // exit callback can then never return the same equipment a second time.
  deleteWorker(workerId, uid);
  removeFromDeployQueue(workerId, uid);
  returnWorkerItems(worker, uid);
  if (worker.flopAllocated) releaseFlop(FLOP_COSTS.worker, uid);
  killWorker(workerId, uid);

  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/worker/reset
workerRoutes.post('/worker/reset', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId, generation: requestGeneration, executionToken: requestExecutionToken } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId, uid);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  if (
    (req as AuthenticatedRequest).user?.purpose === 'code-server' &&
    !hasExecutionFence(requestGeneration, requestExecutionToken, worker)
  ) {
    return staleExecution(res);
  }
  if (['running', 'moving', 'harvesting', 'idle'].includes(worker.status)) {
    killWorker(workerId, uid);
  }

  const config = worker.deployConfig || {
    classId: (() => {
      const allClasses = getAllWorkerClasses(uid);
      const match = allClasses.find(c => c.class_name === worker.class_name);
      return match?.class_id || worker.class_name.toLowerCase();
    })(),
    equippedItems: {},
    injectedFields: {},
  };
  const workerClass = getWorkerClass(config.classId, uid);
  const injectedFields = workerClass
    ? rebuildInjectedEquipment(workerClass.fields, config.injectedFields, config.equippedItems, worker.equippedPickaxe)
    : config.injectedFields;
  const refreshedConfig = { ...config, injectedFields };
  const recoveryNode = worker.current_node || worker.node_id;
  const generation = (worker.generation || 0) + 1;
  const executionToken = randomUUID();

  upsertWorker({
    ...worker,
    current_node: recoveryNode,
    status: 'deploying',
    pid: null,
    deployConfig: refreshedConfig,
    desiredState: 'running',
    generation,
    executionToken,
  }, uid);

  if (!allocateWorkerFlop(workerId, FLOP_COSTS.worker, uid)) {
    upsertWorker({ ...worker, current_node: recoveryNode, status: 'suspended', pid: null, desiredState: 'suspended', flopAllocated: false }, uid);
    broadcastFullState(uid);
    return res.status(400).json({ error: 'Not enough FLOP' });
  }

  enqueueDeploy({
    id: worker.id,
    workerId: worker.id,
    nodeId: recoveryNode,
    classId: refreshedConfig.classId,
    equippedItems: refreshedConfig.equippedItems,
    injectedFields: refreshedConfig.injectedFields,
    createdAt: new Date().toISOString(),
    generation,
    executionToken,
    initialHolding: worker.holding || [],
  }, uid);
  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/worker/suspend
workerRoutes.post('/worker/suspend', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId, uid);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  if (!['running', 'moving', 'harvesting', 'idle', 'deploying'].includes(worker.status)) {
    return res.status(400).json({ error: `Worker is not running (status: ${worker.status})` });
  }

  upsertWorker({ ...worker, status: 'suspending', desiredState: 'suspended' }, uid);
  const result = suspendWorker(workerId);
  if (!result.ok) {
    upsertWorker({ ...worker, status: 'suspended', desiredState: 'suspended', pid: null }, uid);
  }

  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/worker/suspend-all
workerRoutes.post('/worker/suspend-all', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const workers = getWorkers(uid);
  const running = workers.filter(w => w.status === 'running');

  for (const worker of running) {
    upsertWorker({ ...worker, status: 'suspending', desiredState: 'suspended' }, uid);
    const result = suspendWorker(worker.id);
    if (!result.ok) {
      upsertWorker({ ...worker, status: 'suspended', desiredState: 'suspended', pid: null }, uid);
    }
  }

  broadcastFullState(uid);
  res.json({ ok: true, count: running.length });
});

// GET /api/revisions
workerRoutes.get('/revisions', async (req: Request, res: Response) => {
  const workspacePath = getWorkspacePath();
  if (!fs.existsSync(workspacePath)) return res.json({ revisions: [] });
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
  } catch {
    res.json({ revisions: [] });
  }
});

// GET /api/workers
workerRoutes.get('/workers', (req: Request, res: Response) => {
  const uid = getUserId(req);
  res.json({ workers: getWorkers(uid) });
});

// GET /api/worker/:id/logs
workerRoutes.get('/worker/:id/logs', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const logs = getWorkerLogs(req.params.id as string, uid);
  res.json({ logs });
});

// GET /api/classes
workerRoutes.get('/classes', (req: Request, res: Response) => {
  const workspacePath = getWorkspacePath();
  const workersDir = path.join(workspacePath, 'workers');

  if (!fs.existsSync(workersDir)) return res.json({ classes: [] });

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

// GET /api/autosave
workerRoutes.get('/autosave', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const snap = getAutosave(uid);
  if (!snap) return res.json({ exists: false });
  res.json({ exists: true, ts: snap.ts, tick: snap.tick });
});

// POST /api/autosave/restore
workerRoutes.post('/autosave/restore', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const activeProcesses = getActiveProcesses();
  for (const [id, child] of activeProcesses) {
    child.kill('SIGTERM');
  }
  activeProcesses.clear();

  const ok = restoreAutosave(uid);
  if (!ok) return res.status(404).json({ error: 'no_autosave' });
  invalidateCodeServerLease(uid);
  resetAllWorkers(uid);
  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/reset
workerRoutes.post('/reset', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const activeProcesses = getActiveProcesses();
  for (const [id, child] of activeProcesses) {
    child.kill('SIGTERM');
  }
  activeProcesses.clear();

  resetGameState(uid);
  invalidateCodeServerLease(uid);
  broadcastFullState(uid);
  res.json({ ok: true });
});

// POST /api/worker-classes/register
workerRoutes.post('/worker-classes/register', (req: Request, res: Response) => {
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

  incrementStat('code_server_connected', 1, uid);
  checkQuests(uid);

  // Reconcile desired executions; asset ownership remains with the durable
  // worker record through Code Server restarts and hot reloads.
  const allWorkers = getWorkers(uid);
  const allClasses = getAllWorkerClasses(uid);
  let resumed = 0;
  for (const w of allWorkers) {
    if (w.desiredState !== 'running' || ['running', 'moving', 'harvesting', 'idle', 'suspending'].includes(w.status)) continue;

    const config = w.deployConfig || {
      classId: allClasses.find(c => c.class_name === w.class_name)?.class_id || w.class_name.toLowerCase(),
      equippedItems: {},
      injectedFields: {},
    };

    const wc = getWorkerClass(config.classId, uid);
    if (!wc) continue;

    if (!w.flopAllocated && !allocateWorkerFlop(w.id, FLOP_COSTS.worker, uid)) {
      console.log(`[NetCrawl] Cannot resume worker ${w.id}: not enough FLOP`);
      continue;
    }

    const existing = getWorker(w.id, uid)!;
    const generation = (existing.generation || 0) + 1;
    const executionToken = randomUUID();
    upsertWorker({ ...existing, status: 'deploying', pid: null, deployConfig: config, desiredState: 'running', generation, executionToken }, uid);

    enqueueDeploy({
      id: w.id,
      workerId: w.id,
      nodeId: w.node_id,
      classId: config.classId,
      equippedItems: config.equippedItems,
      injectedFields: config.injectedFields,
      createdAt: new Date().toISOString(),
      generation,
      executionToken,
      initialHolding: existing.holding || [],
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
workerRoutes.post('/code-server/disconnect', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { generation, executionToken } = req.body || {};
  if (
    (req as AuthenticatedRequest).user?.purpose === 'code-server' &&
    !getWorkers(uid).some(worker => hasExecutionFence(generation, executionToken, worker))
  ) {
    return staleExecution(res);
  }
  resetAllWorkers(uid);
  broadcastFullState(uid);
  console.log('[NetCrawl] Code server disconnected — all workers reset to suspended');
  res.json({ ok: true });
});

// GET /api/worker-classes
workerRoutes.get('/worker-classes', (req: Request, res: Response) => {
  const uid = getUserId(req);
  res.json({ classes: getAllWorkerClasses(uid) });
});
