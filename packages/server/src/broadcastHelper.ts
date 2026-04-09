/**
 * Centralized state broadcast utility.
 * Single source of truth for building STATE_UPDATE payloads.
 *
 * Accepts optional userId to scope all state reads and broadcasts
 * to a specific user (critical for multi-user data isolation).
 */

import { getGameState, getVisibleState, getWorkers, getPlayerLevelSummary, getLayerManager, isLayerUnlocked, checkLayerUnlocks, getActiveLayerId, getStat, getCurrentUserId } from './db.js';
import { getAllWorkerClasses } from './workerRegistry.js';
import { isCodeServerConnected } from './codeServerTracker.js';
import { LAYER_DEFS } from './layerDefinitions.js';
import { broadcast } from './websocket.js';
import { getAchievementSummary } from './achievements.js';
import { getQuestSummary } from './quests.js';

export function broadcastFullState(userId?: string) {
  // Resolve userId: explicit param > global fallback
  const effectiveUserId = userId || getCurrentUserId() || undefined;

  const state = getGameState(effectiveUserId);
  const { nodes, edges } = getVisibleState(2, effectiveUserId);
  const layerManager = getLayerManager(effectiveUserId);

  // Check for newly unlocked layers
  const newlyUnlocked = checkLayerUnlocks(effectiveUserId);
  for (const layerId of newlyUnlocked) {
    const def = LAYER_DEFS.find(d => d.id === layerId);
    if (def) {
      broadcast({ type: 'LAYER_UNLOCKED', payload: { id: layerId, name: def.name, emoji: def.emoji } }, effectiveUserId);
    }
  }

  // Build layer metadata for UI (includes progress toward unlock thresholds)
  const layerMeta = LAYER_DEFS.map(def => {
    const progress: Record<string, number> = {};
    if (def.unlockThresholds.total_data_deposited !== undefined) {
      progress['total_data_deposited'] = getStat('total_data_deposited', effectiveUserId);
    }
    if (def.unlockThresholds.rp !== undefined) {
      progress['rp'] = state.resources.rp;
    }
    if (def.unlockThresholds.credits !== undefined) {
      progress['credits'] = state.resources.credits;
    }
    return {
      id: def.id,
      name: def.name,
      tagline: def.tagline,
      description: def.description,
      color: def.color,
      emoji: def.emoji,
      unlocked: isLayerUnlocked(def.id, effectiveUserId),
      thresholds: def.unlockThresholds,
      progress,
    };
  });

  broadcast({
    type: 'STATE_UPDATE',
    payload: {
      ...state,
      nodes,
      edges,
      workers: getWorkers(effectiveUserId),
      achievements: getAchievementSummary(effectiveUserId),
      questSummary: getQuestSummary(effectiveUserId),
      levelSummary: getPlayerLevelSummary(effectiveUserId),
      activeLayer: getActiveLayerId(effectiveUserId),
      layerMeta,
      codeServerConnected: isCodeServerConnected(effectiveUserId),
      workerClasses: getAllWorkerClasses(effectiveUserId),
    },
  }, effectiveUserId);
}
