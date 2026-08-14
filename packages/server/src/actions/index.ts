/**
 * Worker action dispatcher — routes actions to domain-specific handlers.
 *
 * Each action domain lives in its own module:
 *   moveActions     — move, move_edge
 *   mineActions     — mine, harvest
 *   inventoryActions — collect, deposit, discard, drop, has_items
 *   scanActions     — scan, get_edges, get_node_info, scan_edges, scan_edges_advanced, findPath, findNearest, getResources
 *   computeActions  — compute, submit
 *   serviceActions  — get_service, cache_*, api_*, validate_token, repair
 *   logActions      — log, report_error
 */

import { getCurrentUserId, forcePersist, resolveStore } from '../store.js';
import { recordChapterZeroMinerAction } from '../domain/questState.js';
import { getGameState } from '../domain/gameState.js';
import { getWorker } from '../domain/workers.js';
import { acquireLock } from './actionLock.js';
import type { ActionContext } from './helpers.js';

import { handleLog, handleReportError } from './logActions.js';
import { handleMove, handleMoveEdge } from './moveActions.js';
import { handleMine, handleHarvest } from './mineActions.js';
import { handleCollect, handleDeposit, handleDiscard, handleDrop, handleHasItems } from './inventoryActions.js';
import {
  handleScan,
  handleGetEdges,
  handleGetNodeInfo,
  handleScanEdges,
  handleScanEdgesAdvanced,
  handleFindPath,
  handleFindNearest,
  handleGetResources,
} from './scanActions.js';
import { handleCompute, handleSubmit } from './computeActions.js';
import {
  handleGetService,
  handleCacheGet,
  handleCacheSet,
  handleCacheKeys,
  handleApiPoll,
  handleApiRespond,
  handleApiStats,
  handleApiReject,
  handleValidateToken,
  handleRepair,
} from './serviceActions.js';

// ── Action registry ─────────────────────────────────────────────────────────

type ActionHandler = (ctx: ActionContext, payload: any) => any | Promise<any>;

const ACTION_HANDLERS: Record<string, ActionHandler> = {
  // Movement
  move: handleMove,
  move_edge: handleMoveEdge,

  // Mining
  mine: handleMine,
  harvest: handleHarvest,

  // Inventory
  collect: handleCollect,
  deposit: handleDeposit,
  discard: handleDiscard,
  drop: handleDrop,
  has_items: handleHasItems,
  has_dropped_items: handleHasItems,

  // Scan / query
  scan: handleScan,
  get_edges: handleGetEdges,
  get_node_info: handleGetNodeInfo,
  scan_edges: handleScanEdges,
  scan_edges_advanced: handleScanEdgesAdvanced,
  findPath: handleFindPath,
  findNearest: handleFindNearest,
  getResources: handleGetResources,

  // Compute puzzles
  compute: handleCompute,
  submit: handleSubmit,

  // Services (cache, API, auth)
  get_service: handleGetService,
  cache_get: handleCacheGet,
  cache_set: handleCacheSet,
  cache_keys: handleCacheKeys,
  api_poll: handleApiPoll,
  api_respond: handleApiRespond,
  api_stats: handleApiStats,
  api_reject: handleApiReject,
  validate_token: handleValidateToken,
  repair: handleRepair,
};

// ── Main handler ────────────────────────────────────────────────────────────

export interface ExecutionFence {
  generation?: number;
  executionToken?: string;
  actionId?: string;
}

export async function handleWorkerAction(
  workerId: string,
  action: string,
  payload: any,
  userId?: string,
  fence: ExecutionFence = {},
): Promise<any> {
  const uid = userId || getCurrentUserId() || undefined;

  const worker = getWorker(workerId, uid);
  if (!worker) return { ok: false, error: 'Worker not found' };
  if (fence.generation !== undefined || fence.executionToken !== undefined) {
    if (
      worker.generation !== Number(fence.generation) ||
      !fence.executionToken ||
      worker.executionToken !== fence.executionToken
    ) {
      return { ok: false, reason: 'stale_execution', error: 'Worker execution is no longer current' };
    }
  }
  const actionKey = fence.actionId ? `${workerId}:${worker.generation || 0}:${fence.actionId}` : '';
  if (actionKey) {
    const previous = resolveStore(uid).worker_action_results?.[actionKey];
    if (previous) return previous.result;
  }

  let result: any;
  if (action === 'log') result = handleLog(workerId, payload, uid);
  else if (action === 'report_error') result = handleReportError(workerId, payload, uid);
  else {
    await acquireLock(workerId);
    const currentWorker = getWorker(workerId, uid);
    if (!currentWorker) return { ok: false, error: 'Worker not found' };

    const state = getGameState(uid);
    const { nodes, edges, resources } = state;
    const ctx: ActionContext = { workerId, uid, worker: currentWorker, state, nodes, edges, resources };

    const handler = ACTION_HANDLERS[action];
    if (!handler) return { ok: false, error: `Unknown action: ${action}` };

    result = await handler(ctx, payload);
    recordChapterZeroMinerAction(workerId, action, payload, result, uid);
  }

  if (actionKey) {
    const s = resolveStore(uid);
    s.worker_action_results ||= {};
    s.worker_action_results[actionKey] = {
      workerId,
      generation: worker.generation || 0,
      result,
      committedAt: new Date().toISOString(),
    };
    const keys = Object.keys(s.worker_action_results);
    if (keys.length > 2000) for (const key of keys.slice(0, keys.length - 2000)) delete s.worker_action_results[key];
  }
  forcePersist(uid);
  return result;
}
