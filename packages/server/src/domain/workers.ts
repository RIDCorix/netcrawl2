/**
 * Worker CRUD, FLOP allocation, and worker logs.
 */

import { resolveStore } from '../store.js';
import type { WorkerRow, WorkerLogRow } from '../types.js';

export function getWorkers(userId?: string): WorkerRow[] {
  return Object.values(resolveStore(userId).workers);
}

export function getWorker(id: string, userId?: string): WorkerRow | null {
  return resolveStore(userId).workers[id] || null;
}

export function upsertWorker(worker: WorkerRow, userId?: string) {
  const s = resolveStore(userId);
  s.workers[worker.id] = {
    ...worker,
    deployed_at: s.workers[worker.id]?.deployed_at || new Date().toISOString(),
  };
}

export function deleteWorker(id: string, userId?: string) {
  delete resolveStore(userId).workers[id];
}

/**
 * Drop transient runtime observations without touching durable gameplay state.
 * A Code Server or Game Server restart is not a recall: equipment, holding,
 * current_node and FLOP allocation remain owned by the worker.
 */
export function resetAllWorkers(userId?: string): void {
  const s = resolveStore(userId);
  const workers = Object.values(s.workers);
  if (workers.length === 0) return;

  for (const w of workers) {
    s.workers[w.id] = {
      ...w,
      status: w.desiredState === 'running' ? 'deploying' : 'suspended',
      pid: null,
    };
  }
  console.log(`[NetCrawl] Reconciled ${workers.length} worker runtime observations`);
}

/** Fence an old process and request a fresh execution without moving assets. */
export function rotateWorkerGeneration(workerId: string, userId?: string): WorkerRow | null {
  const worker = getWorker(workerId, userId);
  if (!worker) return null;
  const next = {
    ...worker,
    generation: (worker.generation || 0) + 1,
    executionToken: '',
    pid: null,
    status: worker.desiredState === 'running' ? ('deploying' as const) : ('suspended' as const),
  };
  upsertWorker(next, userId);
  return next;
}

/** Try to allocate FLOP capacity. Returns false if not enough room. */
export function allocateFlop(cost: number, userId?: string): boolean {
  const flop = resolveStore(userId).game_state.flop;
  if (flop.used + cost > flop.total) return false;
  flop.used += cost;
  return true;
}

/** Release FLOP capacity (clamped to 0). */
export function releaseFlop(cost: number, userId?: string): void {
  const flop = resolveStore(userId).game_state.flop;
  flop.used = Math.max(0, flop.used - cost);
}

/** Claim capacity for a persisted worker exactly once, independent of status. */
export function allocateWorkerFlop(workerId: string, cost: number, userId?: string): boolean {
  const worker = getWorker(workerId, userId);
  if (!worker) return false;
  if (worker.flopAllocated) return true;
  if (!allocateFlop(cost, userId)) return false;
  upsertWorker({ ...worker, flopAllocated: true }, userId);
  return true;
}

/** Release only capacity owned by this worker; duplicate cleanup is a no-op. */
export function releaseWorkerFlop(workerId: string, cost: number, userId?: string): boolean {
  const worker = getWorker(workerId, userId);
  if (!worker?.flopAllocated) return false;
  releaseFlop(cost, userId);
  upsertWorker({ ...worker, flopAllocated: false }, userId);
  return true;
}

export function addWorkerLog(workerId: string, message: string, userId?: string) {
  const s = resolveStore(userId);
  s.worker_logs.push({
    id: s.next_log_id++,
    worker_id: workerId,
    message,
    created_at: new Date().toISOString(),
  });
  if (s.worker_logs.length > 1000) {
    s.worker_logs = s.worker_logs.slice(-1000);
  }
}

export function getWorkerLogs(workerId: string, userId?: string): WorkerLogRow[] {
  return resolveStore(userId)
    .worker_logs.filter(l => l.worker_id === workerId)
    .slice(-200);
}
