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

import { getCurrentUserId } from '../store.js';
import { getGameState } from '../domain/gameState.js';
import { getWorker } from '../domain/workers.js';
import { acquireLock } from './actionLock.js';
import type { ActionContext } from './helpers.js';

import { handleLog, handleReportError } from './logActions.js';
import { handleMove, handleMoveEdge } from './moveActions.js';
import { handleMine, handleHarvest } from './mineActions.js';
import { handleCollect, handleDeposit, handleDiscard, handleDrop, handleHasItems } from './inventoryActions.js';
import { handleScan, handleGetEdges, handleGetNodeInfo, handleScanEdges, handleScanEdgesAdvanced, handleFindPath, handleFindNearest, handleGetResources } from './scanActions.js';
import { handleCompute, handleSubmit } from './computeActions.js';
import { handleGetService, handleCacheGet, handleCacheSet, handleCacheKeys, handleApiPoll, handleApiRespond, handleApiStats, handleApiReject, handleValidateToken, handleRepair } from './serviceActions.js';

// ── Action registry ─────────────────────────────────────────────────────────

type ActionHandler = (ctx: ActionContext, payload: any) => any | Promise<any>;

const ACTION_HANDLERS: Record<string, ActionHandler> = {
  // Movement
  move:       handleMove,
  move_edge:  handleMoveEdge,

  // Mining
  mine:       handleMine,
  harvest:    handleHarvest,

  // Inventory
  collect:    handleCollect,
  deposit:    handleDeposit,
  discard:    handleDiscard,
  drop:       handleDrop,
  has_items:  handleHasItems,
  has_dropped_items: handleHasItems,

  // Scan / query
  scan:                handleScan,
  get_edges:           handleGetEdges,
  get_node_info:       handleGetNodeInfo,
  scan_edges:          handleScanEdges,
  scan_edges_advanced: handleScanEdgesAdvanced,
  findPath:            handleFindPath,
  findNearest:         handleFindNearest,
  getResources:        handleGetResources,

  // Compute puzzles
  compute:    handleCompute,
  submit:     handleSubmit,

  // Services (cache, API, auth)
  get_service:     handleGetService,
  cache_get:       handleCacheGet,
  cache_set:       handleCacheSet,
  cache_keys:      handleCacheKeys,
  api_poll:        handleApiPoll,
  api_respond:     handleApiRespond,
  api_stats:       handleApiStats,
  api_reject:      handleApiReject,
  validate_token:  handleValidateToken,
  repair:          handleRepair,
};

// ── Main handler ────────────────────────────────────────────────────────────

export async function handleWorkerAction(workerId: string, action: string, payload: any, userId?: string): Promise<any> {
  const uid = userId || getCurrentUserId() || undefined;

  // Log actions don't need a lock
  if (action === 'log') return handleLog(workerId, payload, uid);
  if (action === 'report_error') return handleReportError(workerId, payload, uid);

  // Acquire per-worker lock (serializes actions)
  await acquireLock(workerId);

  const worker = getWorker(workerId, uid);
  if (!worker) return { ok: false, error: 'Worker not found' };

  const state = getGameState(uid);
  const { nodes, edges, resources } = state;

  const ctx: ActionContext = { workerId, uid, worker, state, nodes, edges, resources };

  const handler = ACTION_HANDLERS[action];
  if (!handler) return { ok: false, error: `Unknown action: ${action}` };

  return handler(ctx, payload);
}
