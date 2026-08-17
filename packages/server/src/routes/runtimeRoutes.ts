/** Runtime protocol v2: leased Code Server registration and durable commands. */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getWorkers, getWorker, upsertWorker, releaseWorkerFlop, resetAllWorkers } from '../domain/workers.js';
import { FLOP_COSTS } from '../types.js';
import { getUserId } from './helpers.js';
import { returnWorkerItems } from './helpers.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { setStat } from '../domain/achievements.js';
import { checkQuests } from '../quests.js';
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
import { RUNTIME_PROTOCOL_VERSION, isSupportedSdkVersion, sdkOutdatedMessage } from '../runtimeProtocol.js';

export const runtimeRoutes = Router();

runtimeRoutes.post('/runtime/register', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { protocolVersion, sdkVersion, sessionId, classes } = req.body || {};
  // Both halves of the gate answer with the same actionable sentence: a runtime
  // that cannot name a supported protocol has no way to read what it would be
  // sent, so it is refused before a lease exists rather than after a command
  // it cannot parse has already been blamed on the player's code.
  if (protocolVersion !== RUNTIME_PROTOCOL_VERSION || !isSupportedSdkVersion(sdkVersion))
    return res
      .status(426)
      .json({ ok: false, reason: 'sdk_outdated', error: sdkOutdatedMessage(sdkVersion, protocolVersion) });
  const lease = claimCodeServerLease(sessionId, uid);
  if (!lease.ok) return res.status(409).json({ ok: false, reason: lease.reason });

  if (Array.isArray(classes)) {
    for (const entry of classes as WorkerClassEntry[]) {
      if (entry?.class_id) registerWorkerClass({ ...entry, language: entry.language || 'python' }, uid);
    }
  }

  // Runtime v2 registration is the live Code Server connection. Keep the
  // durable quest objective in sync with the connection state exposed to UI.
  setStat('code_server_connected', 1, uid);
  checkQuests(uid);

  for (const worker of getWorkers(uid)) {
    if (worker.desiredState !== 'running') continue;
    const fresh = worker.executionToken
      ? worker
      : { ...worker, executionToken: randomUUID(), status: 'deploying' as const, pid: null };
    if (fresh !== worker) upsertWorker(fresh, uid);
    enqueueWorkerExecution(fresh, uid);
  }
  broadcastFullState(uid);
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
  const commandId = String(req.params.commandId);
  const command = leaseDeployQueue(sessionId, uid).find(command => command.id === commandId);
  if (command?.type === 'compute_lab_run') {
    const decision = acknowledgeDeployCommand(commandId, sessionId, 0, uid);
    if (decision === 'stale') return res.status(409).json({ ok: false, reason: 'stale_execution' });
    return res.json({ ok: true, duplicate: decision === 'duplicate' });
  }
  const worker = getWorker(workerId, uid);
  if (!worker || worker.generation !== Number(generation))
    return res.status(409).json({ ok: false, reason: 'stale_execution' });
  const decision = acknowledgeDeployCommand(commandId, sessionId, Number(generation), uid);
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
  if (!released) return res.status(409).json({ ok: false, reason: 'stale_execution' });

  // Every SDK that can hold a lease shuts down through this endpoint, so it is
  // ungated by version — only a matching, unexpired session may reconcile.
  resetAllWorkers(uid);
  setStat('code_server_connected', 0, uid);
  checkQuests(uid);
  broadcastFullState(uid);
  res.json({ ok: true, released: true });
});
