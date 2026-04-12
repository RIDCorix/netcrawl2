/**
 * Inventory action handlers: collect, deposit, discard, drop, has_items
 */

import type { Item, Resources } from '../types.js';
import { mergeItemStacks, MAX_STACK_SIZE } from '../types.js';
import type { ActionContext } from './helpers.js';
import { ACTION_DELAY } from './helpers.js';
import { getGameState, saveGameState } from '../domain/gameState.js';
import { getWorker, upsertWorker } from '../domain/workers.js';
import { getNodeChipEffects } from '../domain/chips.js';
import { incrementStat } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import { grantNodeXp } from '../domain/nodeXp.js';
import { XP_REWARDS } from '../levelSystem.js';
import { checkAchievements } from '../achievements.js';
import { checkQuests } from '../quests.js';
import { computeNodeBuffer } from '../upgradeDefinitions.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { broadcast } from '../websocket.js';
import { setLock, getLock } from './actionLock.js';

// ── Shared deposit logic ────────────────────────────────────────────────────

interface DepositResult {
  totalData: number;
  totalRp: number;
  penalty: number;
}

function tallyDeposit(items: Item[], uid: string | undefined): DepositResult {
  let totalData = 0, totalRp = 0, penalty = 0;
  for (const item of items) {
    if (item.type === 'bad_data') { penalty += item.count; incrementStat('total_bad_data_deposited', item.count, uid); }
    else if (item.type === 'data_fragment') { totalData += item.count; incrementStat('total_data_deposited', item.count, uid); }
    else if (item.type === 'rp_shard') { totalRp += item.count; incrementStat('total_rp_deposited', item.count, uid); }
  }
  return { totalData, totalRp, penalty };
}

function applyDeposit(resources: Resources, tally: DepositResult): Resources {
  const res = { ...resources };
  res['data'] = Math.max(0, (res['data'] || 0) + tally.totalData - tally.penalty);
  if (tally.totalRp > 0) res['rp'] = (res['rp'] || 0) + tally.totalRp;
  return res;
}

// ── Handlers ────────────────────────────────────────────────────────────────

export async function handleCollect(ctx: ActionContext, payload: any): Promise<any> {
  const { workerId, uid, worker, nodes } = ctx;
  const capacity = 1 + (worker.equippedRam?.capacityBonus || 0);
  const currentNode = worker.current_node || worker.node_id;
  const nodeIdx = nodes.findIndex(n => n.id === currentNode);
  if (nodeIdx === -1) return { ok: false, error: 'Node not found' };
  const node = nodes[nodeIdx];

  const nodeItems: Item[] = Array.isArray(node.data.items) ? [...node.data.items] : [];
  if (nodeItems.length === 0) return { ok: false, error: 'nothing_here', reason: 'nothing_here' };

  setLock(workerId, ACTION_DELAY);
  await getLock(workerId);

  const freshState = getGameState(uid);
  const freshNode = freshState.nodes.find(n => n.id === currentNode);
  const freshItems: Item[] = freshNode && Array.isArray(freshNode.data.items) ? [...freshNode.data.items] : [];
  if (freshItems.length === 0) return { ok: false, error: 'nothing_here', reason: 'nothing_here' };

  const w4 = getWorker(workerId, uid);
  const currentHolding: Item[] = (w4?.holding || []).map(h => ({ ...h }));

  const absorbInto = (holding: Item[], itemType: string, wanted: number): number => {
    let left = wanted;
    for (const h of holding) {
      if (left <= 0) break;
      if (h.type === itemType && h.count < MAX_STACK_SIZE) {
        const room = MAX_STACK_SIZE - h.count;
        const take = Math.min(room, left);
        h.count += take;
        left -= take;
      }
    }
    while (left > 0 && holding.length < capacity) {
      const take = Math.min(MAX_STACK_SIZE, left);
      holding.push({ type: itemType, count: take } as Item);
      left -= take;
    }
    return wanted - left;
  };

  const alreadyFullOfStacks = currentHolding.length >= capacity;
  const hasRoomInExisting = freshItems.some(fi =>
    currentHolding.some(h => h.type === fi.type && h.count < MAX_STACK_SIZE)
  );
  if (alreadyFullOfStacks && !hasRoomInExisting) {
    return { ok: false, error: 'inventory_full', reason: 'inventory_full', holdingCount: currentHolding.length, capacity };
  }

  const collected: Item[] = [];
  const remaining: Item[] = [];
  let budget = payload.count ?? Infinity;

  for (const floor of freshItems) {
    if (budget <= 0) { remaining.push(floor); continue; }
    if (payload.itemType && floor.type !== payload.itemType) { remaining.push(floor); continue; }
    const wanted = Math.min(floor.count, budget);
    const absorbed = absorbInto(currentHolding, floor.type, wanted);
    if (absorbed > 0) { collected.push({ type: floor.type, count: absorbed }); budget -= absorbed; }
    const leftover = floor.count - absorbed;
    if (leftover > 0) remaining.push({ type: floor.type, count: leftover });
  }

  if (payload.itemType && collected.length === 0) return { ok: false, error: 'item_not_found' };
  if (collected.length === 0) {
    return { ok: false, error: 'inventory_full', reason: 'inventory_full', holdingCount: currentHolding.length, capacity };
  }

  const newNodes = freshState.nodes.map(n => {
    if (n.id === currentNode) return { ...n, data: { ...n.data, items: remaining } };
    return n;
  });

  if (w4) upsertWorker({ ...w4, holding: currentHolding }, uid);
  saveGameState({ ...freshState, nodes: newNodes }, uid);
  broadcastFullState(uid);
  return { ok: true, items: currentHolding, holdingCount: currentHolding.length, capacity };
}

export async function handleDeposit(ctx: ActionContext): Promise<any> {
  const { workerId, uid, worker } = ctx;
  const currentNode = worker.current_node || worker.node_id;
  if (currentNode !== 'hub') {
    return { ok: false, error: 'Must be at Hub to deposit. Use drop() to leave items on the ground, or move to Hub first.', reason: 'not_at_hub' };
  }

  setLock(workerId, ACTION_DELAY);
  await getLock(workerId);

  const w5 = getWorker(workerId, uid);
  if (!w5) return { ok: false, error: 'Worker not found' };

  const held = w5.holding || [];
  if (held.length === 0) return { ok: false, error: 'Nothing to deposit' };

  const freshState = getGameState(uid);
  const tally = tallyDeposit(held, uid);
  const newResources = applyDeposit(freshState.resources, tally);

  saveGameState({ ...freshState, resources: newResources }, uid);
  upsertWorker({ ...w5, holding: [], status: 'running' }, uid);
  broadcastFullState(uid);
  incrementStat('total_deposits', 1, uid);
  awardXp(XP_REWARDS.deposit_resources, uid);
  grantNodeXp('hub', 'deposit', uid);
  checkAchievements(uid);
  checkQuests(uid);
  return { ok: true, deposited: held, totalData: tally.totalData, penalty: tally.penalty };
}

export async function handleDiscard(ctx: ActionContext, payload: any): Promise<any> {
  const { workerId, uid } = ctx;
  const w6 = getWorker(workerId, uid);
  if (!w6 || (w6.holding || []).length === 0) return { ok: false, error: 'Nothing to discard', reason: 'nothing_held' };

  if (payload.itemType) {
    const holding = [...(w6.holding || [])];
    const idx = holding.findIndex(d => d.type === payload.itemType);
    if (idx === -1) return { ok: false, error: 'Item type not found', reason: 'item_not_found' };
    const stack = holding[idx];
    const discardCount = payload.count ? Math.min(payload.count, stack.count) : stack.count;
    const discarded = { type: stack.type, count: discardCount };
    if (discardCount >= stack.count) holding.splice(idx, 1);
    else holding[idx] = { ...stack, count: stack.count - discardCount };
    upsertWorker({ ...w6, holding }, uid);
    broadcastFullState(uid);
    if (discarded.type === 'bad_data') { incrementStat('total_bad_data_discarded', discardCount, uid); checkQuests(uid); }
    return { ok: true, discarded };
  } else {
    const discarded = w6.holding;
    for (const item of discarded) { if (item.type === 'bad_data') incrementStat('total_bad_data_discarded', item.count, uid); }
    upsertWorker({ ...w6, holding: [] }, uid);
    broadcastFullState(uid);
    checkQuests(uid);
    return { ok: true, discarded };
  }
}

export async function handleDrop(ctx: ActionContext, payload: any): Promise<any> {
  const { workerId, uid } = ctx;
  const w7 = getWorker(workerId, uid);
  if (!w7 || (w7.holding || []).length === 0) return { ok: false, error: 'Nothing to drop', reason: 'nothing_held' };

  const dropNodeId = w7.current_node || w7.node_id;
  const freshState = getGameState(uid);
  const dropNode = freshState.nodes.find(n => n.id === dropNodeId);
  if (!dropNode) return { ok: false, error: 'Node not found' };

  let dropped: Item[];
  const holding = [...(w7.holding || [])];
  if (payload.itemType) {
    const idx = holding.findIndex(d => d.type === payload.itemType);
    if (idx === -1) return { ok: false, error: 'Item type not found' };
    const stack = holding[idx];
    const dropCount = payload.count ? Math.min(payload.count, stack.count) : stack.count;
    dropped = [{ type: stack.type, count: dropCount }];
    if (dropCount >= stack.count) holding.splice(idx, 1);
    else holding[idx] = { ...stack, count: stack.count - dropCount };
  } else {
    dropped = [...holding];
    holding.length = 0;
  }

  // Drop at hub auto-deposits
  if (dropNodeId === 'hub') {
    const tally = tallyDeposit(dropped, uid);
    const newResources = applyDeposit(freshState.resources, tally);

    saveGameState({ ...freshState, resources: newResources }, uid);
    upsertWorker({ ...w7, holding, status: 'running' }, uid);
    broadcastFullState(uid);
    broadcast({
      type: 'HUB_DEPOSIT',
      payload: { workerId, ts: Date.now(), totalData: tally.totalData, totalRp: tally.totalRp, penalty: tally.penalty, goodCount: tally.totalData + tally.totalRp, badCount: tally.penalty },
    }, uid);
    incrementStat('total_deposits', 1, uid);
    awardXp(XP_REWARDS.deposit_resources, uid);
    grantNodeXp('hub', 'deposit', uid);
    checkAchievements(uid);
    checkQuests(uid);
    return { ok: true, dropped, nodeId: dropNodeId, deposited: true, totalData: tally.totalData, penalty: tally.penalty };
  }

  // Non-hub drop: check buffer
  const dropBufMax = computeNodeBuffer(dropNode.type, getNodeChipEffects(dropNodeId, uid));
  const existingItemsPre: Item[] = Array.isArray(dropNode.data.items) ? [...dropNode.data.items] : [];
  const existingTypes = new Set(existingItemsPre.map(i => i.type));
  let projectedStacks = existingItemsPre.length;
  const acceptedDrops: Item[] = [];
  const rejectedDrops: Item[] = [];
  for (const d of dropped) {
    if (existingTypes.has(d.type)) { acceptedDrops.push(d); continue; }
    if (dropBufMax === 0 || projectedStacks < dropBufMax) { acceptedDrops.push(d); existingTypes.add(d.type); projectedStacks += 1; }
    else rejectedDrops.push(d);
  }
  if (acceptedDrops.length === 0) return { ok: false, error: 'Node buffer full', reason: 'node_buffer_full', maxBuffer: dropBufMax };
  for (const r of rejectedDrops) holding.push(r);
  upsertWorker({ ...w7, holding }, uid);

  const newNodes = freshState.nodes.map(n => {
    if (n.id === dropNodeId) return { ...n, data: { ...n.data, items: mergeItemStacks(existingItemsPre, acceptedDrops) } };
    return n;
  });
  saveGameState({ ...freshState, nodes: newNodes }, uid);
  broadcastFullState(uid);
  return { ok: true, dropped: acceptedDrops, rejected: rejectedDrops, nodeId: dropNodeId, maxBuffer: dropBufMax };
}

export function handleHasItems(ctx: ActionContext): any {
  const { worker, nodes } = ctx;
  const curNode = worker.current_node || worker.node_id;
  const node = nodes.find(n => n.id === curNode);
  if (!node) return { ok: true, has_items: false };
  const floorItems = Array.isArray(node.data.items) ? node.data.items : [];
  return { ok: true, has_items: floorItems.length > 0, count: floorItems.length };
}
