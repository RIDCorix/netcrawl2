/**
 * Quest state accessors — quest status, passive effects, unlocked recipes.
 */

import { resolveStore } from '../store.js';
import type { QuestState } from '../types.js';
import {
  applyChapterZeroCommand,
  CHAPTER_ZERO_COMMANDS,
  createChapterZeroSession,
  shouldBypassChapterZero,
} from './chapterZero.js';

export function getQuestState(userId?: string): QuestState {
  return resolveStore(userId).quest_state;
}

export function getQuestStatus(questId: string, userId?: string): QuestState['questStatus'][string] | undefined {
  return resolveStore(userId).quest_state.questStatus[questId];
}

export function setQuestStatus(
  questId: string,
  status: 'locked' | 'available' | 'completed' | 'claimed',
  userId?: string,
) {
  const s = resolveStore(userId);
  s.quest_state.questStatus[questId] = status;
  if (status === 'claimed') {
    s.quest_state.claimedAt[questId] = new Date().toISOString();
  }
}

export function addActivePassive(id: string, description: string, effect: Record<string, number>, userId?: string) {
  resolveStore(userId).quest_state.activePassives[id] = { description, effect };
}

export function getActivePassives(
  userId?: string,
): Record<string, { description: string; effect: Record<string, number> }> {
  return resolveStore(userId).quest_state.activePassives || {};
}

export function addUnlockedRecipe(recipeId: string, userId?: string) {
  const s = resolveStore(userId);
  if (!s.quest_state.unlockedRecipes.includes(recipeId)) {
    s.quest_state.unlockedRecipes.push(recipeId);
  }
}

export function getUnlockedRecipes(userId?: string): string[] {
  return resolveStore(userId).quest_state.unlockedRecipes || [];
}

export function getChapterZero(userId?: string) {
  const state = resolveStore(userId).quest_state;
  if (!state.chapterZero || state.chapterZero.version !== 2) {
    const legacyProgress = shouldBypassChapterZero(state.questStatus || {});
    state.chapterZero = createChapterZeroSession(legacyProgress);
  }
  return { ...structuredClone(state.chapterZero), expected: CHAPTER_ZERO_COMMANDS[state.chapterZero.step] || null };
}

export function submitChapterZeroCommand(command: string, userId?: string) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  const result = applyChapterZeroCommand(state.chapterZero!, command);
  if (result.ok) state.chapterZero = result.session;
  return { ...result, ...getChapterZero(userId) };
}
