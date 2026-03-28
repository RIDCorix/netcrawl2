/**
 * Centralized state broadcast utility.
 * Single source of truth for building STATE_UPDATE payloads.
 */

import { getGameState, getWorkers } from './db.js';
import { broadcast } from './websocket.js';
import { getAchievementSummary } from './achievements.js';
import { getQuestSummary } from './quests.js';

export function broadcastFullState() {
  const state = getGameState();
  broadcast({
    type: 'STATE_UPDATE',
    payload: {
      ...state,
      workers: getWorkers(),
      achievements: getAchievementSummary(),
      questSummary: getQuestSummary(),
    },
  });
}
