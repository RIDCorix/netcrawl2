/**
 * Quest state accessors — quest status, passive effects, unlocked recipes.
 */

import { resolveStore } from '../store.js';
import type { QuestState } from '../types.js';
import {
  advanceChapterZeroStage,
  applyChapterZeroCommand,
  createChapterZeroSession,
  expectedCommand,
  migrateChapterZeroSession,
  runChapterZeroSandbox,
  setDeployTutorialField,
  shouldBypassChapterZero,
  type ChapterZeroStage,
} from './chapterZero.js';
import { addToPlayerInventory } from './inventory.js';
import { registerWorkerClass } from '../workerRegistry.js';
import { TUTORIAL_MINER_CLASS } from '../tutorialWorkerClass.js';

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
  if (!state.chapterZero || state.chapterZero.version !== 3) {
    const legacyProgress = shouldBypassChapterZero(state.questStatus || {});
    state.chapterZero = createChapterZeroSession(legacyProgress);
  } else {
    state.chapterZero = migrateChapterZeroSession(state.chapterZero);
  }
  return { ...structuredClone(state.chapterZero), expected: expectedCommand(state.chapterZero) };
}

export function submitChapterZeroCommand(command: string, userId?: string) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  const result = applyChapterZeroCommand(state.chapterZero!, command);
  if (result.ok) state.chapterZero = result.session;
  return { ...result, ...getChapterZero(userId) };
}

export function advanceChapterZeroStageTo(stage: ChapterZeroStage, userId?: string) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  const result = advanceChapterZeroStage(state.chapterZero!, stage);
  if (result.ok) state.chapterZero = result.session;
  return { ...result, ...getChapterZero(userId) };
}

export function runChapterZeroCodeEditor(onStartup: string, onLoop: string, userId?: string) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  const result = runChapterZeroSandbox(state.chapterZero!, onStartup, onLoop);
  state.chapterZero = result.session;
  return { ...result, ...getChapterZero(userId) };
}

/** Grant tutorial deploy items (pickaxe) and register the tutorial worker class. Idempotent. */
export function grantChapterZeroDeployItems(userId?: string) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  const session = state.chapterZero!;
  if (session.world.deployTutorial?.grantedItems) {
    return { ok: true, alreadyGranted: true };
  }

  // Grant a pickaxe if the player doesn't have one
  const store = resolveStore(userId);
  const hasPickaxe = store.game_state.playerInventory.some(
    i => i.itemType === 'pickaxe_basic' && i.count > 0,
  );
  if (!hasPickaxe) {
    addToPlayerInventory('pickaxe_basic', 1, undefined, userId);
  }

  // Register the tutorial worker class for this user
  registerWorkerClass(TUTORIAL_MINER_CLASS, userId);

  // Mark items as granted
  state.chapterZero = setDeployTutorialField(session, 'grantedItems', true);
  return { ok: true, alreadyGranted: false, ...getChapterZero(userId) };
}

/** Set selected edge or pickaxe in the deploy tutorial world state. */
export function setChapterZeroDeploySelection(
  field: 'selectedEdgeId' | 'selectedPickaxeType',
  value: string | null,
  userId?: string,
) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  state.chapterZero = setDeployTutorialField(state.chapterZero!, field, value);
  return { ok: true, ...getChapterZero(userId) };
}

/** Record the deploy workerId and advance to deploy_verified stage. */
export function verifyChapterZeroDeploy(workerId: string, userId?: string) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  const session = state.chapterZero!;

  if (session.stage !== 'deploy_execute') {
    return { ok: false as const, error: 'out_of_order' as const };
  }

  // Verify the worker exists in the store
  const store = resolveStore(userId);
  if (!store.workers[workerId]) {
    return { ok: false as const, error: 'worker_not_found' as const };
  }

  // Set workerId, then advance to deploy_verified, then to handoff
  let s = setDeployTutorialField(session, 'workerId', workerId);
  s.stage = 'deploy_verified';

  // Auto-advance to handoff immediately
  s.stage = 'handoff';
  s.transition = 'chapter_zero_handoff';
  state.chapterZero = s;

  return { ok: true as const, ...getChapterZero(userId) };
}
