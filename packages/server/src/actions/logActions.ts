/**
 * Log and error reporting actions.
 */

import { getWorker, upsertWorker, addWorkerLog } from '../domain/workers.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { broadcast } from '../websocket.js';

export function handleLog(workerId: string, payload: any, uid?: string): any {
  addWorkerLog(workerId, payload.message, uid);
  const w = getWorker(workerId, uid);
  if (w) {
    const level = payload.level || 'info';
    if (level !== 'debug') {
      upsertWorker({ ...w, lastLog: { message: payload.message, level, ts: Date.now() } }, uid);
    }
    broadcast({ type: 'WORKER_LOG', payload: { workerId, message: payload.message, level, ts: Date.now(), nodeId: w.current_node || w.node_id } }, uid);
  }
  return { ok: true };
}

export function handleReportError(workerId: string, payload: any, uid?: string): any {
  const w = getWorker(workerId, uid);
  if (!w) return { ok: false, error: 'Worker not found' };
  const errorMsg = payload.message || 'Unknown error';
  addWorkerLog(workerId, `[ERROR] ${errorMsg}`, uid);
  broadcast({ type: 'WORKER_LOG', payload: { workerId, message: `[ERROR] ${errorMsg}`, level: 'error', ts: Date.now(), nodeId: w.current_node || w.node_id } }, uid);
  upsertWorker({ ...w, status: 'error', desiredState: 'suspended', pid: null, lastLog: { message: `[ERROR] ${errorMsg}`, level: 'error', ts: Date.now() } }, uid);
  broadcastFullState(uid);
  return { ok: true };
}
