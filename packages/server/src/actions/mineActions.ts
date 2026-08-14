/**
 * Mining action handlers: mine, harvest (deprecated)
 */

import type { Item } from '../types.js';
import { itemStacksFitBuffer, mergeItemStacks } from '../types.js';
import type { ActionContext } from './helpers.js';
import { MINE_DELAY, getPassiveEffects, getItemTypeForNode, calcItemCount } from './helpers.js';
import { getNodeChipEffects } from '../domain/chips.js';
import { getGameState, saveGameState } from '../domain/gameState.js';
import { upsertWorker, getWorker } from '../domain/workers.js';
import { incrementStat } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import { grantNodeXp } from '../domain/nodeXp.js';
import { XP_REWARDS } from '../levelSystem.js';
import { checkAchievements } from '../achievements.js';
import { checkQuests } from '../quests.js';
import { computeNodeBuffer } from '../upgradeDefinitions.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { setLock, getLock } from './actionLock.js';

export function handleHarvest(): any {
  return { ok: false, error: 'harvest() is deprecated. Use mine() + collect() instead.' };
}

const WAIT_FOR_DATA_MS = 250;
type MineReservation = { workerId: string };
const mineReservationQueues = new Map<string, MineReservation[]>();

function mineReservationKey(nodeId: string, uid?: string): string {
  return JSON.stringify([uid || '', nodeId]);
}

function isMiningInterrupted(workerId: string, nodeId: string, uid?: string): boolean {
  const worker = getWorker(workerId, uid);
  if (!worker || ['suspended', 'crashed', 'error', 'dead'].includes(worker.status)) return true;
  return (worker.current_node || worker.node_id) !== nodeId;
}

function waitForData(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, WAIT_FOR_DATA_MS));
}

function restoreNodeData(nodeId: string, amount: number, uid?: string): void {
  const freshState = getGameState(uid);
  const node = freshState.nodes.find(n => n.id === nodeId);
  if (!node) return;

  const maxDataBuffer = Math.max(1, Number(node.data.maxDataBuffer ?? 1));
  const availableData = Math.min(maxDataBuffer, Math.max(0, Number(node.data.data ?? maxDataBuffer)));
  saveGameState(
    {
      ...freshState,
      nodes: freshState.nodes.map(n =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, data: Math.min(maxDataBuffer, availableData + amount), maxDataBuffer } }
          : n,
      ),
    },
    uid,
  );
}

/**
 * Reserve mine supply immediately before a mining animation starts. Reserving
 * before the delay prevents concurrent workers from spending the same supply.
 */
async function reserveNodeData(
  nodeId: string,
  requiredData: number,
  workerId: string,
  uid?: string,
): Promise<{ ok: true; remainingData: number } | { ok: false; error: string }> {
  const queueKey = mineReservationKey(nodeId, uid);
  const queue = mineReservationQueues.get(queueKey) || [];
  const reservation: MineReservation = { workerId };
  queue.push(reservation);
  mineReservationQueues.set(queueKey, queue);

  try {
    while (true) {
      if (isMiningInterrupted(workerId, nodeId, uid)) return { ok: false, error: 'Mining interrupted' };
      if (queue[0] !== reservation) {
        await waitForData();
        continue;
      }

      const freshState = getGameState(uid);
      const currentNode = freshState.nodes.find(n => n.id === nodeId);
      if (!currentNode?.data.mineable) return { ok: false, error: 'Node is not mineable' };

      const maxDataBuffer = Math.max(1, Number(currentNode.data.maxDataBuffer ?? 1));
      if (requiredData > maxDataBuffer) return { ok: false, error: 'Mining yield exceeds node capacity' };

      const availableData = Math.min(maxDataBuffer, Math.max(0, Number(currentNode.data.data ?? maxDataBuffer)));
      if (availableData >= requiredData) {
        const remainingData = availableData - requiredData;
        saveGameState(
          {
            ...freshState,
            nodes: freshState.nodes.map(n =>
              n.id === nodeId ? { ...n, data: { ...n.data, data: remainingData, maxDataBuffer } } : n,
            ),
          },
          uid,
        );
        broadcastFullState(uid);
        return { ok: true, remainingData };
      }

      const refillRate = Math.max(0, Number(currentNode.data.dataRefillRate ?? currentNode.data.rate ?? 0));
      if (refillRate === 0) return { ok: false, error: 'Mine supply cannot refill' };
      await waitForData();
    }
  } finally {
    const reservationIndex = queue.indexOf(reservation);
    if (reservationIndex !== -1) queue.splice(reservationIndex, 1);
    if (queue.length === 0) mineReservationQueues.delete(queueKey);
  }
}

export async function handleMine(ctx: ActionContext): Promise<any> {
  const { workerId, uid, worker, nodes } = ctx;
  const currentNode = worker.current_node || worker.node_id;
  const nodeIdx = nodes.findIndex(n => n.id === currentNode);
  if (nodeIdx === -1) return { ok: false, error: 'Node not found' };
  const node = nodes[nodeIdx];

  if (!node.data.mineable) return { ok: false, error: 'Node is not mineable' };

  if (!worker.equippedPickaxe) return { ok: false, error: 'No pickaxe equipped' };

  // Determine the exact supply required before waiting, so a mine either
  // produces its normal output or waits for enough supply to do so.
  const itemType = getItemTypeForNode(node);
  const efficiency = worker.equippedPickaxe.efficiency;
  const baseRate = node.data.rate || 1;
  const count = calcItemCount(baseRate, efficiency);

  // Calculate mine delay with chip/passive effects
  const mineChipEffects = getNodeChipEffects(currentNode, uid);
  const minePassives = getPassiveEffects();
  const mineMult = (mineChipEffects['harvest_speed_mult'] || 1) * (minePassives['global_harvest_speed_mult'] || 1);
  const mineDelay = Math.round(MINE_DELAY / mineMult);

  upsertWorker({ ...worker, status: 'harvesting' }, uid);
  broadcastFullState(uid);

  const reservation = await reserveNodeData(node.id, count, workerId, uid);
  if (!reservation.ok) {
    const currentWorker = getWorker(workerId, uid);
    if (currentWorker?.status === 'harvesting') upsertWorker({ ...currentWorker, status: 'running' }, uid);
    broadcastFullState(uid);
    return reservation;
  }

  setLock(workerId, mineDelay);
  await getLock(workerId);

  const minedItem: Item = { type: itemType, count };

  const freshState = getGameState(uid);
  const freshNode = freshState.nodes.find(n => n.id === node.id);
  if (!freshNode) {
    restoreNodeData(node.id, count, uid);
    const currentWorker = getWorker(workerId, uid);
    if (currentWorker?.status === 'harvesting') upsertWorker({ ...currentWorker, status: 'running' }, uid);
    broadcastFullState(uid);
    return { ok: false, error: 'Node not found' };
  }

  const floorItems: Item[] = Array.isArray(freshNode.data.items) ? freshNode.data.items : [];
  const mineBufMax = computeNodeBuffer(freshNode.type, getNodeChipEffects(currentNode, uid));
  const projectedItems = mergeItemStacks(floorItems, [minedItem]);
  if (!itemStacksFitBuffer(floorItems, [minedItem], mineBufMax)) {
    restoreNodeData(node.id, count, uid);
    const currentWorker = getWorker(workerId, uid);
    if (currentWorker?.status === 'harvesting') upsertWorker({ ...currentWorker, status: 'running' }, uid);
    broadcastFullState(uid);
    return { ok: false, error: 'Node buffer full', reason: 'node_buffer_full', maxBuffer: mineBufMax };
  }

  const newNodes = freshState.nodes.map(n => {
    if (n.id === node.id) {
      return {
        ...n,
        data: {
          ...n.data,
          items: projectedItems,
          mineCount: (n.data.mineCount || 0) + 1,
        },
      };
    }
    return n;
  });

  const w3 = getWorker(workerId, uid);
  if (w3) upsertWorker({ ...w3, status: 'running' }, uid);
  saveGameState({ ...freshState, nodes: newNodes }, uid);
  broadcastFullState(uid);
  incrementStat('total_mines', 1, uid);
  awardXp(XP_REWARDS.mine_node, uid);
  grantNodeXp(currentNode, 'mine', uid);
  checkAchievements(uid);
  checkQuests(uid);
  return {
    ok: true,
    item: { type: itemType, count },
    drop: { type: itemType, count },
    remainingData: reservation.remainingData,
  };
}
