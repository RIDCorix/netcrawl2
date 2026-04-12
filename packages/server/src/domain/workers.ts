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
 * Reset all workers on server startup.
 * Moves workers back to their original deploy node and sets status to 'suspended'.
 */
export function resetAllWorkers(userId?: string): void {
  const s = resolveStore(userId);
  const workers = Object.values(s.workers);
  if (workers.length === 0) return;

  for (const w of workers) {
    s.workers[w.id] = {
      ...w,
      current_node: w.node_id,
      status: 'suspended',
      pid: null,
      holding: [],
      carrying: {},
    };
  }

  s.game_state.flop.used = 0;
  console.log(`[NetCrawl] Reset ${workers.length} workers to suspended state`);
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
  return resolveStore(userId).worker_logs
    .filter(l => l.worker_id === workerId)
    .slice(-200);
}
