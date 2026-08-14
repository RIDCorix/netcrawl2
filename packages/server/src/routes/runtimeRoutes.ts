/** Runtime protocol v2: leased Code Server registration and durable commands. */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getWorkers, getWorker, upsertWorker, releaseWorkerFlop, resetAllWorkers } from '../domain/workers.js';
import { FLOP_COSTS } from '../types.js';
import { getUserId } from './helpers.js';
import { returnWorkerItems } from './helpers.js';
import { broadcastFullState } from '../broadcastHelper.js';
import {
  claimCodeServerLease,
  isValidCodeServerLease,
  renewCodeServerLease,
  releaseCodeServerLease,
} from '../codeServerTracker.js';
import {
  leaseDeployQueue,
  acknowledgeDeployCommand,
  enqueueWorkerExecution,
  registerWorkerClass,
  type WorkerClassEntry,
} from '../workerRegistry.js';

export const runtimeRoutes = Router();

runtimeRoutes.post('/runtime/register', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { protocolVersion, sessionId, classes } = req.body || {};
  if (protocolVersion !== 2) return res.status(400).json({ error: 'protocolVersion 2 required' });
  const lease = claimCodeServerLease(sessionId, uid);
  if (!lease.ok) return res.status(409).json({ ok: false, reason: lease.reason });

  if (Array.isArray(classes)) {
    for (const entry of classes as WorkerClassEntry[]) {
      if (entry?.class_id) registerWorkerClass({ ...entry, language: entry.language || 'python' }, uid);
    }
  }

  for (const worker of getWorkers(uid)) {
    if (worker.desiredState !== 'running') continue;
    const fresh = worker.executionToken
      ? worker
      : { ...worker, executionToken: randomUUID(), status: 'deploying' as const, pid: null };
    if (fresh !== worker) upsertWorker(fresh, uid);
    enqueueWorkerExecution(fresh, uid);
  }
  res.json({ ok: true, sessionId: lease.sessionId, leaseExpiresAt: lease.expiresAt });
});

runtimeRoutes.get('/runtime/commands', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const sessionId = String(req.query.sessionId || '');
  if (!isValidCodeServerLease(sessionId, uid)) return res.status(409).json({ ok: false, reason: 'stale_execution' });
  res.json({ commands: leaseDeployQueue(sessionId, uid), leaseExpiresAt: renewCodeServerLease(sessionId, uid) });
});

runtimeRoutes.post('/runtime/commands/:commandId/ack', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { sessionId, generation, workerId, pid, error } = req.body || {};
  if (!isValidCodeServerLease(sessionId, uid)) return res.status(409).json({ ok: false, reason: 'stale_execution' });
  const worker = getWorker(workerId, uid);
  if (!worker || worker.generation !== Number(generation))
    return res.status(409).json({ ok: false, reason: 'stale_execution' });
  const decision = acknowledgeDeployCommand(String(req.params.commandId), sessionId, Number(generation), uid);
  if (decision === 'stale') return res.status(409).json({ ok: false, reason: 'stale_execution' });
  if (decision === 'duplicate') return res.json({ ok: true, duplicate: true });
  if (error) {
    returnWorkerItems(worker, uid);
    releaseWorkerFlop(worker.id, FLOP_COSTS.worker, uid);
    upsertWorker(
      {
        ...worker,
        status: 'crashed',
        desiredState: 'suspended',
        pid: null,
        equippedPickaxe: null,
        equippedCpu: null,
        equippedRam: null,
        holding: [],
        flopAllocated: false,
      },
      uid,
    );
  } else {
    upsertWorker({ ...worker, status: 'running', pid: pid || null, desiredState: 'running' }, uid);
  }
  res.json({ ok: true });
});

runtimeRoutes.post('/runtime/disconnect', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const released = releaseCodeServerLease(req.body?.sessionId, uid);
  if (released) {
    // SDK 1.2.2 shuts down through this leased endpoint before making its
    // unfenced legacy disconnect call. Reconcile only for the current lease.
    resetAllWorkers(uid);
    broadcastFullState(uid);
  }
  res.json({ ok: true, released });
});
