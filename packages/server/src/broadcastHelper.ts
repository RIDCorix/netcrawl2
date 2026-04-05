/**
 * Centralized state broadcast utility.
 * Single source of truth for building STATE_UPDATE payloads.
 */

import { getGameState, getVisibleState, getWorkers, getPlayerLevelSummary, getLayerManager, isLayerUnlocked, checkLayerUnlocks, getActiveLayerId, getStat, getCurrentUserId } from './db.js';
import { LAYER_DEFS } from './layerDefinitions.js';
import { broadcast } from './websocket.js';
import { getAchievementSummary } from './achievements.js';
import { getQuestSummary } from './quests.js';

export function broadcastFullState() {
  const state = getGameState();
  const { nodes, edges } = getVisibleState(2);
  const layerManager = getLayerManager();

  // Check for newly unlocked layers
  const newlyUnlocked = checkLayerUnlocks();
  for (const layerId of newlyUnlocked) {
    const def = LAYER_DEFS.find(d => d.id === layerId);
    if (def) {
      broadcast({ type: 'LAYER_UNLOCKED', payload: { id: layerId, name: def.name, emoji: def.emoji } }, getCurrentUserId() || undefined);
    }
  }

  // Build layer metadata for UI (includes progress toward unlock thresholds)
  const layerMeta = LAYER_DEFS.map(def => {
    const progress: Record<string, number> = {};
    if (def.unlockThresholds.total_data_deposited !== undefined) {
      progress['total_data_deposited'] = getStat('total_data_deposited');
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
      unlocked: isLayerUnlocked(def.id),
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
      workers: getWorkers(),
      achievements: getAchievementSummary(),
      questSummary: getQuestSummary(),
      levelSummary: getPlayerLevelSummary(),
      activeLayer: getActiveLayerId(),
      layerMeta,
    },
  }, getCurrentUserId() || undefined);
}
