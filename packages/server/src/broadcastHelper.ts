/**
 * Centralized state broadcast utility.
 * Single source of truth for building STATE_UPDATE payloads.
 */

import { getGameState, getVisibleState, getWorkers, getPlayerLevelSummary } from './db.js';
import { broadcast } from './websocket.js';
import { getAchievementSummary } from './achievements.js';
import { getQuestSummary } from './quests.js';

export function broadcastFullState() {
  const state = getGameState();
  const { nodes, edges } = getVisibleState(2);
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
    },
  });
}
