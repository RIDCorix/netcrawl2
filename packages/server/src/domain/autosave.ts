/**
 * Autosave — periodic snapshots of healthy game state for recovery.
 */

import { resolveStore, forcePersist } from '../store.js';
import type { AutosaveSnapshot } from '../types.js';

const isMultiUser = () => process.env.NETCRAWL_MULTI_USER === 'true';

/**
 * Capture a snapshot of the current healthy game state.
 * Called from gameTick on a cadence; silently skips if the game is already over.
 */
export function takeAutosave(userId?: string): AutosaveSnapshot | null {
  const s = resolveStore(userId);
  if (s.game_state.gameOver) return null;
  const hub = s.game_state.nodes.find((n: any) => n.id === 'hub');
  if (hub && (hub.data?.infected || hub.type === 'infected')) return null;

  const snap: AutosaveSnapshot = {
    ts: Date.now(),
    tick: s.game_state.tick,
    game_state: JSON.parse(JSON.stringify(s.game_state)),
    workers: JSON.parse(JSON.stringify(s.workers)),
    achievement_state: JSON.parse(JSON.stringify(s.achievement_state)),
    quest_state: JSON.parse(JSON.stringify(s.quest_state)),
    level_state: JSON.parse(JSON.stringify(s.level_state)),
    layer_manager: JSON.parse(JSON.stringify(s.layer_manager)),
  };
  s.autosave = snap;
  return snap;
}

export function getAutosave(userId?: string): AutosaveSnapshot | null {
  return resolveStore(userId).autosave ?? null;
}

/**
 * Restore the store from its autosave snapshot. Returns true on success.
 */
export function restoreAutosave(userId?: string): boolean {
  const s = resolveStore(userId);
  const snap = s.autosave;
  if (!snap) return false;
  s.game_state = JSON.parse(JSON.stringify(snap.game_state));
  s.game_state.gameOver = false;
  s.workers = JSON.parse(JSON.stringify(snap.workers));
  s.achievement_state = JSON.parse(JSON.stringify(snap.achievement_state));
  s.quest_state = JSON.parse(JSON.stringify(snap.quest_state));
  s.level_state = JSON.parse(JSON.stringify(snap.level_state));
  s.layer_manager = JSON.parse(JSON.stringify(snap.layer_manager));
  forcePersist(userId);
  return true;
}
