/**
 * Mining action handlers: mine, harvest (deprecated)
 */

import type { Item } from '../types.js';
import { mergeItemStacks } from '../types.js';
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
import { MINE_DEPLETION_THRESHOLD, MINE_DEPLETION_COOLDOWN_MS } from '../constants.js';

export function handleHarvest(): any {
  return { ok: false, error: 'harvest() is deprecated. Use mine() + collect() instead.' };
}

export async function handleMine(ctx: ActionContext): Promise<any> {
  const { workerId, uid, worker, nodes } = ctx;
  const currentNode = worker.current_node || worker.node_id;
  const nodeIdx = nodes.findIndex((n: any) => n.id === currentNode);
  if (nodeIdx === -1) return { ok: false, error: 'Node not found' };
  const node = nodes[nodeIdx];

  if (!node.data.mineable) return { ok: false, error: 'Node is not mineable' };
  if (node.data.depleted) return { ok: false, error: 'Node is depleted', reason: 'node_depleted', depletedUntil: node.data.depletedUntil };

  // Check node buffer capacity
  const mineBufMax = computeNodeBuffer(node.type, getNodeChipEffects(currentNode, uid));
  const floorStacks = Array.isArray(node.data.items) ? node.data.items.length : 0;
  if (mineBufMax > 0 && floorStacks >= mineBufMax) {
    return { ok: false, error: 'Node buffer full', reason: 'node_buffer_full', maxBuffer: mineBufMax };
  }

  // Check capacity-based depletion
  if (node.data.capacity !== undefined) {
    if (node.data.mineCount >= node.data.capacity && !node.data.depleted) {
      const refillMs = node.data.refillMs || 5000;
      const freshS = getGameState(uid);
      const newN = freshS.nodes.map((n: any) => {
        if (n.id === node.id) {
          return { ...n, data: { ...n.data, depleted: true, depletedUntil: Date.now() + refillMs, mineCount: 0 } };
        }
        return n;
      });
      saveGameState({ ...freshS, nodes: newN }, uid);
      broadcastFullState(uid);
      return { ok: false, error: 'Node is depleted (refilling)', reason: 'node_depleted', depletedUntil: Date.now() + refillMs };
    }
  }

  if (!worker.equippedPickaxe) return { ok: false, error: 'No pickaxe equipped' };

  // Calculate mine delay with chip/passive effects
  const mineChipEffects = getNodeChipEffects(currentNode, uid);
  const minePassives = getPassiveEffects();
  const mineMult = (mineChipEffects['harvest_speed_mult'] || 1) * (minePassives['global_harvest_speed_mult'] || 1);
  const mineDelay = Math.round(MINE_DELAY / mineMult);

  upsertWorker({ ...worker, status: 'harvesting' }, uid);
  broadcastFullState(uid);

  setLock(workerId, mineDelay);
  await getLock(workerId);

  // Determine mined item
  const itemType = getItemTypeForNode(node);
  const efficiency = worker.equippedPickaxe.efficiency;
  const baseRate = node.data.rate || 1;
  const count = calcItemCount(baseRate, efficiency);
  const minedItem: Item = { type: itemType, count };

  // Update mine count and depletion
  const currentMineCount = (node.data.mineCount || 0) + 1;
  let depleted = false;
  let depletedUntil: number | undefined;
  let finalMineCount = currentMineCount;

  if (currentMineCount >= MINE_DEPLETION_THRESHOLD) {
    depleted = true;
    depletedUntil = Date.now() + MINE_DEPLETION_COOLDOWN_MS;
    finalMineCount = 0;
  }

  const freshState = getGameState(uid);
  const newNodes = freshState.nodes.map((n: any) => {
    if (n.id === node.id) {
      return {
        ...n,
        data: {
          ...n.data,
          items: mergeItemStacks(Array.isArray(n.data.items) ? n.data.items : [], [minedItem]),
          mineCount: finalMineCount,
          depleted,
          depletedUntil,
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
  return { ok: true, item: { type: itemType, count }, drop: { type: itemType, count } };
}
