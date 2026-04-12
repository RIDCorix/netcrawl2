/**
 * Layer management — switching, unlocking, and snapshot logic.
 */

import { resolveStore } from '../store.js';
import { getGameState } from './gameState.js';
import { getLayerInitialSnapshot, LAYER_DEFS } from '../layerDefinitions.js';
import type { LayerManagerState, WorkerRow } from '../types.js';

export function getActiveLayerId(userId?: string): number {
  return resolveStore(userId).layer_manager?.currentLayer ?? 0;
}

export function getLayerManager(userId?: string): LayerManagerState {
  return resolveStore(userId).layer_manager;
}

export function isLayerUnlocked(layerId: number, userId?: string): boolean {
  return (resolveStore(userId).layer_manager?.unlockedLayers ?? [0]).includes(layerId);
}

export function unlockLayer(layerId: number, userId?: string): void {
  if (!isLayerUnlocked(layerId, userId)) {
    const s = resolveStore(userId);
    if (!s.layer_manager) {
      s.layer_manager = { currentLayer: 0, unlockedLayers: [0], snapshots: {} };
    }
    s.layer_manager.unlockedLayers.push(layerId);
  }
}

export function switchActiveLayer(newLayerId: number, userId?: string): { ok: boolean; error?: string } {
  if (!isLayerUnlocked(newLayerId, userId)) {
    return { ok: false, error: `Layer ${newLayerId} is not unlocked` };
  }

  const s = resolveStore(userId);
  const currentLayerId = s.layer_manager?.currentLayer ?? 0;

  if (!s.layer_manager) {
    s.layer_manager = { currentLayer: 0, unlockedLayers: [0], snapshots: {} };
  }
  s.layer_manager.snapshots[currentLayerId] = {
    nodes: JSON.parse(JSON.stringify(s.game_state.nodes)),
    edges: JSON.parse(JSON.stringify(s.game_state.edges)),
    workers: JSON.parse(JSON.stringify(s.workers)),
    flop: { ...s.game_state.flop },
    tick: s.game_state.tick,
    gameOver: s.game_state.gameOver,
  };

  if (s.layer_manager.snapshots[newLayerId]) {
    const snap = s.layer_manager.snapshots[newLayerId];
    s.game_state.nodes = snap.nodes;
    s.game_state.edges = snap.edges;
    s.workers = snap.workers as Record<string, WorkerRow>;
    s.game_state.flop = snap.flop;
    s.game_state.tick = snap.tick;
    s.game_state.gameOver = snap.gameOver;
  } else {
    const snap = getLayerInitialSnapshot(newLayerId);
    s.game_state.nodes = snap.nodes;
    s.game_state.edges = snap.edges;
    s.workers = {};
    s.game_state.flop = snap.flop;
    s.game_state.tick = snap.tick;
    s.game_state.gameOver = snap.gameOver;
  }

  s.layer_manager.currentLayer = newLayerId;
  return { ok: true };
}

export function checkLayerUnlocks(userId?: string): number[] {
  const state = getGameState(userId);
  const stats = resolveStore(userId).achievement_state?.stats || {};
  const newlyUnlocked: number[] = [];

  for (const def of LAYER_DEFS) {
    if (def.id === 0) continue;
    if (isLayerUnlocked(def.id, userId)) continue;

    const thresh = def.unlockThresholds;
    const dataMet = !thresh.total_data_deposited || (stats['total_data_deposited'] || 0) >= thresh.total_data_deposited;
    const rpMet = !thresh.rp || state.resources.rp >= thresh.rp;
    const creditsMet = !thresh.credits || state.resources.credits >= thresh.credits;
    const requiredStatsMet = !thresh.required_stats
      || Object.entries(thresh.required_stats).every(
        ([key, min]) => (stats[key] || 0) >= min
      );

    if (dataMet && rpMet && creditsMet && requiredStatsMet) {
      unlockLayer(def.id, userId);
      newlyUnlocked.push(def.id);
    }
  }

  return newlyUnlocked;
}
