/**
 * Log and error reporting actions.
 */

import { getWorker, upsertWorker, addWorkerLog } from '../domain/workers.js';
import { addToPlayerInventory } from '../domain/inventory.js';
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
  addWorkerLog(workerId, `[ERROR] ${payload.message || 'Unknown error'}`, uid);
  if (w.equippedPickaxe) addToPlayerInventory(w.equippedPickaxe.itemType, 1, undefined, uid);
  if (w.equippedCpu) addToPlayerInventory(w.equippedCpu.itemType, w.equippedCpu.count || 1, undefined, uid);
  if (w.equippedRam) addToPlayerInventory(w.equippedRam.itemType, w.equippedRam.count || 1, undefined, uid);
  for (const item of (w.holding || [])) {
    if (item.type !== 'bad_data') addToPlayerInventory(item.type, item.count, undefined, uid);
  }
  const errorMsg = payload.message || 'Unknown error';
  upsertWorker({ ...w, status: 'error', pid: null, equippedPickaxe: null, equippedCpu: null, equippedRam: null, holding: [], lastLog: { message: `[ERROR] ${errorMsg}`, level: 'error', ts: Date.now() } }, uid);
  broadcastFullState(uid);
  return { ok: true };
}
