/**
 * Service action handlers: get_service, cache_get, cache_set, cache_keys,
 * api_poll, api_respond, api_stats, api_reject, validate_token, repair
 */

import type { ActionContext } from './helpers.js';
import { ACTION_DELAY } from './helpers.js';
import { getGameState, saveGameState } from '../domain/gameState.js';
import { getNodeChipEffects } from '../domain/chips.js';
import { cacheGet, cacheSet, cacheKeys, getCacheRange, getCacheCapacity } from '../domain/cache.js';
import { incrementStat } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import { grantNodeXp } from '../domain/nodeXp.js';
import { XP_REWARDS } from '../levelSystem.js';
import { checkAchievements } from '../achievements.js';
import { checkQuests } from '../quests.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { edgeExists, bfsPath } from '../graphUtils.js';
import { apiPoll, apiRespond, apiReject, getAPIStats } from '../apiNodeEngine.js';
import { setLock, getLock } from './actionLock.js';
import { REPAIR_DATA_COST } from '../constants.js';

// ── Cache range check helper ────────────────────────────────────────────────

function checkCacheReach(workerNode: string, cacheNodeId: string, edges: any[]): { ok: true } | { ok: false; error: string; reason: string } {
  const range = getCacheRange(cacheNodeId);
  const path = bfsPath(edges, workerNode, cacheNodeId);
  const dist = path ? path.length - 1 : Infinity;
  if (dist > range) return { ok: false, error: 'Cache out of range', reason: 'not_reachable' };
  return { ok: true };
}

// ── Handlers ────────────────────────────────────────────────────────────────

export function handleGetService(ctx: ActionContext, payload: any): any {
  const { worker, nodes, edges } = ctx;
  const { serviceNodeId } = payload;
  if (!serviceNodeId) return { ok: false, error: 'serviceNodeId required' };
  const serviceNode = nodes.find((n: any) => n.id === serviceNodeId);
  if (!serviceNode) return { ok: false, error: 'Service node not found', reason: 'not_found' };
  if (!serviceNode.data.unlocked) return { ok: false, error: 'Service node is locked', reason: 'not_reachable' };
  const workerNode = worker.current_node || worker.node_id;
  if (serviceNode.type === 'cache') {
    const range = getCacheRange(serviceNodeId);
    const path = bfsPath(edges, workerNode, serviceNodeId);
    const distance = path ? path.length - 1 : Infinity;
    if (distance > range) return { ok: false, error: `Cache node '${serviceNodeId}' is out of range (distance ${distance}, range ${range})`, reason: 'not_reachable' };
    return { ok: true, serviceType: 'cache', nodeId: serviceNodeId, range, capacity: getCacheCapacity(serviceNodeId), usedSlots: cacheKeys(serviceNodeId).length };
  }
  return { ok: false, error: `Node '${serviceNodeId}' is not a service node`, reason: 'not_a_service' };
}

export function handleCacheGet(ctx: ActionContext, payload: any): any {
  const { worker, edges, uid } = ctx;
  const { cacheNodeId, key } = payload;
  if (!cacheNodeId || !key) return { ok: false, error: 'cacheNodeId and key required' };
  const workerNode = worker.current_node || worker.node_id;
  const reach = checkCacheReach(workerNode, cacheNodeId, edges);
  if (!reach.ok) return reach;
  const val = cacheGet(cacheNodeId, key);
  if (val === undefined) return { ok: true, hit: false, value: null };
  grantNodeXp(cacheNodeId, 'cache_hit', uid);
  return { ok: true, hit: true, value: val };
}

export function handleCacheSet(ctx: ActionContext, payload: any): any {
  const { worker, edges } = ctx;
  const { cacheNodeId, key, value, ttl } = payload;
  if (!cacheNodeId || !key) return { ok: false, error: 'cacheNodeId and key required' };
  const workerNode = worker.current_node || worker.node_id;
  const reach = checkCacheReach(workerNode, cacheNodeId, edges);
  if (!reach.ok) return reach;
  const stored = cacheSet(cacheNodeId, key, value, ttl || 0);
  if (!stored) return { ok: false, error: 'Cache is full' };
  return { ok: true };
}

export function handleCacheKeys(ctx: ActionContext, payload: any): any {
  const { worker, edges } = ctx;
  const { cacheNodeId } = payload;
  if (!cacheNodeId) return { ok: false, error: 'cacheNodeId required' };
  const workerNode = worker.current_node || worker.node_id;
  const reach = checkCacheReach(workerNode, cacheNodeId, edges);
  if (!reach.ok) return reach;
  return { ok: true, keys: cacheKeys(cacheNodeId) };
}

export function handleApiPoll(ctx: ActionContext): any {
  const { worker } = ctx;
  return apiPoll(worker.current_node || worker.node_id, ctx.workerId);
}

export function handleApiRespond(ctx: ActionContext, payload: any): any {
  const { worker } = ctx;
  const { requestId, responseData } = payload;
  if (!requestId) return { ok: false, error: 'requestId required' };
  return apiRespond(worker.current_node || worker.node_id, ctx.workerId, requestId, responseData);
}

export function handleApiStats(ctx: ActionContext): any {
  const { worker, nodes } = ctx;
  const currentNode = worker.current_node || worker.node_id;
  const node = nodes.find((n: any) => n.id === currentNode);
  if (!node || node.type !== 'api') return { ok: false, error: 'Not at an API node' };
  return { ok: true, ...getAPIStats(currentNode) };
}

export function handleApiReject(ctx: ActionContext, payload: any): any {
  const { worker } = ctx;
  const { requestId, statusCode } = payload;
  if (!requestId) return { ok: false, error: 'requestId required' };
  if (!statusCode) return { ok: false, error: 'statusCode required (e.g. 401, 400, 429, 500)' };
  return apiReject(worker.current_node || worker.node_id, ctx.workerId, requestId, statusCode);
}

export async function handleValidateToken(ctx: ActionContext, payload: any): Promise<any> {
  const { workerId, worker, nodes } = ctx;
  const currentNode = worker.current_node || worker.node_id;
  const authNode = nodes.find((n: any) => n.id === currentNode);
  if (!authNode || authNode.type !== 'auth') return { ok: false, error: 'Must be at an auth node to validate tokens', reason: 'not_at_auth_node' };
  if (!authNode.data.unlocked) return { ok: false, error: 'Auth node is locked' };
  const { token } = payload;
  if (!token) return { ok: false, error: 'token required' };
  const valid = typeof token === 'string' && token.length > 0;
  setLock(workerId, ACTION_DELAY / 2);
  await getLock(workerId);
  return { ok: true, valid, ttl: 30, token };
}

export async function handleRepair(ctx: ActionContext, payload: any): Promise<any> {
  const { workerId, uid, worker, nodes, edges, resources } = ctx;
  const { nodeId } = payload;
  const currentNode = worker.current_node || worker.node_id;
  if (!edgeExists(edges, currentNode, nodeId) && currentNode !== nodeId) return { ok: false, error: 'Node not adjacent' };
  const node = nodes.find((n: any) => n.id === nodeId);
  if (!node || !node.data.infected) return { ok: false, error: 'Node is not infected' };
  const res = resources as unknown as Record<string, number>;
  if ((res.data || 0) < REPAIR_DATA_COST) return { ok: false, error: `Not enough data (need ${REPAIR_DATA_COST})` };

  setLock(workerId, ACTION_DELAY);
  await getLock(workerId);

  const freshState = getGameState(uid);
  const newNodes = freshState.nodes.map((n: any) => {
    if (n.id === nodeId) return { ...n, type: n.type === 'infected' ? 'resource' : n.type, data: { ...n.data, infected: false, infectionValue: 0 } };
    return n;
  });
  const newResources = { ...(freshState.resources as any), data: (freshState.resources as any).data - REPAIR_DATA_COST };
  saveGameState({ ...freshState, nodes: newNodes, resources: newResources }, uid);
  broadcastFullState(uid);
  incrementStat('total_repairs', 1, uid);
  awardXp(XP_REWARDS.repair_infection, uid);
  checkAchievements(uid);
  checkQuests(uid);
  return { ok: true };
}
