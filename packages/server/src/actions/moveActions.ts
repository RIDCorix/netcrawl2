/**
 * Movement action handlers: move, move_edge
 */

import type { ActionContext } from './helpers.js';
import { MOVE_DELAY } from './helpers.js';
import { getNodeChipEffects } from '../domain/chips.js';
import { grantNodeXp } from '../domain/nodeXp.js';
import { upsertWorker, getWorker } from '../domain/workers.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { edgeExists } from '../graphUtils.js';
import { setLock, getLock } from './actionLock.js';

export async function handleMove(ctx: ActionContext, payload: any): Promise<any> {
  const { workerId, uid, worker, edges } = ctx;
  const { targetNodeId } = payload;
  const currentNode = worker.current_node || worker.node_id;

  if (!edgeExists(edges, currentNode, targetNodeId)) {
    return { ok: false, error: `No edge between ${currentNode} and ${targetNodeId}` };
  }

  const moveEffects = getNodeChipEffects(targetNodeId, uid);
  const moveDelay = Math.round(MOVE_DELAY * (moveEffects['move_speed_mult'] || 1));

  upsertWorker({ ...worker, status: 'moving', current_node: targetNodeId, previous_node: currentNode, move_id: Date.now() }, uid);
  grantNodeXp(targetNodeId, 'pass_through', uid);
  broadcastFullState(uid);

  setLock(workerId, moveDelay);
  await getLock(workerId);

  const w = getWorker(workerId, uid);
  if (w && w.status === 'moving') {
    const updated = { ...w, status: 'running' as const };
    delete updated.previous_node;
    upsertWorker(updated, uid);
    broadcastFullState(uid);
  }

  return { ok: true, travelTime: MOVE_DELAY };
}

export async function handleMoveEdge(ctx: ActionContext, payload: any): Promise<any> {
  const { workerId, uid, worker, edges } = ctx;
  const { edgeId } = payload;

  if (!edgeId) return { ok: false, error: 'edgeId required' };

  const currentNodeE = worker.current_node || worker.node_id;
  const edge = edges.find(e => e.id === edgeId);
  if (!edge) return { ok: false, error: `Edge '${edgeId}' not found` };

  let targetNodeE: string;
  if (edge.source === currentNodeE) targetNodeE = edge.target;
  else if (edge.target === currentNodeE) targetNodeE = edge.source;
  else return { ok: false, error: `Edge '${edgeId}' is not connected to current node '${currentNodeE}'` };

  const moveEffectsE = getNodeChipEffects(targetNodeE, uid);
  const moveDelayE = Math.round(MOVE_DELAY * (moveEffectsE['move_speed_mult'] || 1));

  upsertWorker({ ...worker, status: 'moving', current_node: targetNodeE, previous_node: currentNodeE, move_id: Date.now() }, uid);
  grantNodeXp(targetNodeE, 'pass_through', uid);
  broadcastFullState(uid);
  setLock(workerId, moveDelayE);
  await getLock(workerId);

  const wE = getWorker(workerId, uid);
  if (wE && wE.status === 'moving') {
    const updatedE = { ...wE, status: 'running' as const };
    delete updatedE.previous_node;
    upsertWorker(updatedE, uid);
    broadcastFullState(uid);
  }

  return { ok: true, travelTime: moveDelayE, edgeId, from: currentNodeE, to: targetNodeE };
}
