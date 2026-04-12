/**
 * Level system — XP awarding, milestone rewards, level summary.
 */

import { resolveStore } from '../store.js';
import { grantXp, getLevelSummary, getTitleForLevel, type LevelState, type LevelSummary, type LevelUpResult } from '../levelSystem.js';
import { addActivePassive, addUnlockedRecipe } from './questState.js';
import { addToPlayerInventory } from './inventory.js';

// Lazy-loaded broadcast to avoid circular dependency
let _broadcast: ((data: any, userId?: string) => void) | null = null;

export function setLevelBroadcast(fn: (data: any, userId?: string) => void) {
  _broadcast = fn;
}

export function getLevelState(userId?: string): LevelState {
  return resolveStore(userId).level_state;
}

export function saveLevelState(state: LevelState, userId?: string) {
  resolveStore(userId).level_state = state;
}

/**
 * Grant XP to the player. Returns level-up info.
 * Automatically applies milestone rewards (passives, recipes, items).
 */
export function awardXp(amount: number, userId?: string): LevelUpResult {
  const s = resolveStore(userId);
  const prevFlopBonus = s.level_state.flopBonus;
  const result = grantXp(s.level_state, amount);
  s.level_state = result.newState;

  // Sync FLOP capacity with level bonus
  const flopDelta = result.newState.flopBonus - prevFlopBonus;
  if (flopDelta > 0) {
    s.game_state.flop.total += flopDelta;
  }

  // Apply milestone rewards
  for (const milestone of result.newMilestones) {
    for (const reward of milestone.rewards) {
      switch (reward.kind) {
        case 'passive':
          addActivePassive(reward.effectId, reward.description, reward.effect, userId);
          break;
        case 'recipe_unlock':
          addUnlockedRecipe(reward.recipeId, userId);
          break;
        case 'items':
          for (const item of reward.items) {
            addToPlayerInventory(item.itemType, item.count, undefined, userId);
          }
          break;
      }
    }
  }

  // Broadcast level-up notification
  if (result.levelsGained > 0 && _broadcast) {
    const title = getTitleForLevel(result.newState.level);
    _broadcast({
      type: 'LEVEL_UP',
      payload: {
        level: result.newState.level,
        title: title.title,
        titleZh: title.titleZh,
        milestones: result.newMilestones,
      },
    }, userId);
  }

  return result;
}

export function getPlayerLevelSummary(userId?: string): LevelSummary {
  return getLevelSummary(resolveStore(userId).level_state);
}
