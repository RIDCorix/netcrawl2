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
  initialDeployState,
  setDeployTutorialField,
  shouldBypassChapterZero,
  type ChapterZeroStage,
} from './chapterZero.js';
import { addToPlayerInventory } from './inventory.js';
import { getWorker, getWorkerLogs } from './workers.js';
import { registerWorkerClass } from '../workerRegistry.js';
import { TUTORIAL_MINER_CLASS } from '../tutorialWorkerClass.js';

const MINER_STAGE_SET = new Set<ChapterZeroStage>([
  'miner_preview',
  'miner_deploy_open',
  'miner_edge_select',
  'miner_pickaxe_equip',
  'miner_deploy_confirm',
  'miner_deploy_execute',
]);

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
  if (!state.chapterZero) {
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

  if (stage === 'miner_preview' && state.chapterZero?.stage === 'hello_log') {
    const helloWorkerId = state.chapterZero.world.deployTutorial.helloWorkerId;
    if (!helloWorkerId || getWorkerLogs(helloWorkerId, userId).length === 0) {
      return {
        ok: false as const,
        error: 'hello_log_pending' as const,
        ...getChapterZero(userId),
      };
    }
  }

  const result = advanceChapterZeroStage(state.chapterZero!, stage);
  if (result.ok) {
    state.chapterZero = result.session;
    if (stage === 'miner_preview') {
      grantChapterZeroDeployItems(userId);
    }
  }
  return { ...result, ...getChapterZero(userId) };
}

export function skipChapterZeroToHandoff(userId?: string) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  // Skip narrative + coding tutorial, but keep both deployment phases gated.
  state.chapterZero!.stage = 'hello_preview';
  state.chapterZero!.world.deployTutorial = initialDeployState();
  state.chapterZero!.step = 0;
  state.chapterZero!.transition = null;
  return { ok: true as const, ...getChapterZero(userId) };
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
  if (!MINER_STAGE_SET.has(session.stage)) {
    return { ok: false as const, error: 'out_of_order' as const, ...getChapterZero(userId) };
  }

  const alreadyGranted = session.world.deployTutorial.grantedItems;

  // Grant a pickaxe if the player doesn't have one. Both this and class
  // registration are intentionally idempotent so refresh/retry cannot duplicate
  // tutorial assets.
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
  return { ok: true as const, alreadyGranted, ...getChapterZero(userId) };
}

/** Set selected edge or pickaxe in the deploy tutorial world state. */
export function setChapterZeroDeploySelection(
  field: 'selectedEdgeId' | 'selectedPickaxeType',
  value: string | null,
  userId?: string,
) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  const session = state.chapterZero!;
  const expectedStage = field === 'selectedEdgeId' ? 'miner_edge_select' : 'miner_pickaxe_equip';
  if (session.stage !== expectedStage) {
    return { ok: false as const, error: 'out_of_order' as const, ...getChapterZero(userId) };
  }
  if (field === 'selectedEdgeId' && (!value || value.startsWith('__'))) {
    return { ok: false as const, error: 'invalid_selection' as const, ...getChapterZero(userId) };
  }
  if (field === 'selectedPickaxeType' && value !== 'pickaxe_basic') {
    return { ok: false as const, error: 'invalid_selection' as const, ...getChapterZero(userId) };
  }
  state.chapterZero = setDeployTutorialField(session, field, value);
  return { ok: true, ...getChapterZero(userId) };
}

/** Verify the phase-specific worker and advance to the next authoritative checkpoint. */
export function verifyChapterZeroDeploy(workerId: string, userId?: string) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  const session = state.chapterZero!;

  const isHello = session.stage === 'hello_deploy_execute';
  const isMiner = session.stage === 'miner_deploy_execute';
  if (!isHello && !isMiner) {
    return { ok: false as const, error: 'out_of_order' as const };
  }

  const worker = getWorker(workerId, userId);
  if (!worker) {
    return { ok: false as const, error: 'worker_not_found' as const };
  }

  const expectedClassId = isHello ? 'helloworker' : 'tutorial_miner';
  const expectedClassName = isHello ? 'HelloWorker' : 'TutorialMiner';
  const deployConfig = worker.deployConfig;
  if (
    worker.class_name !== expectedClassName ||
    (deployConfig && deployConfig.classId !== expectedClassId)
  ) {
    return { ok: false as const, error: 'invalid_worker_class' as const };
  }

  const equippedItems = deployConfig?.equippedItems || {};
  const injectedFields = deployConfig?.injectedFields || {};
  const hasInjectedRoute = Object.entries(injectedFields).some(
    ([key, value]) => !key.startsWith('__') && (key === 'route' || key === 'edge' || Array.isArray(value)),
  );

  if (isHello) {
    if (worker.equippedPickaxe || Object.keys(equippedItems).length > 0 || hasInjectedRoute) {
      return { ok: false as const, error: 'invalid_prerequisites' as const };
    }
    if (session.world.deployTutorial.helloWorkerId) {
      return { ok: false as const, error: 'duplicate_worker' as const };
    }
    const s = setDeployTutorialField(session, 'helloWorkerId', workerId);
    s.stage = 'hello_log';
    s.transition = 'hello_worker_deployed';
    state.chapterZero = s;
    return { ok: true as const, ...getChapterZero(userId) };
  }

  const selectedEdgeId = session.world.deployTutorial.selectedEdgeId;
  const selectedPickaxeType = session.world.deployTutorial.selectedPickaxeType;
  const configuredRoute = injectedFields.route ?? injectedFields.edge;
  const routeMatches = Array.isArray(configuredRoute)
    ? configuredRoute.includes(selectedEdgeId)
    : configuredRoute === selectedEdgeId;
  if (
    !selectedEdgeId ||
    selectedPickaxeType !== 'pickaxe_basic' ||
    worker.equippedPickaxe?.itemType !== 'pickaxe_basic' ||
    !routeMatches
  ) {
    return { ok: false as const, error: 'invalid_prerequisites' as const };
  }
  if (session.world.deployTutorial.minerWorkerId) {
    return { ok: false as const, error: 'duplicate_worker' as const };
  }

  const s = setDeployTutorialField(session, 'minerWorkerId', workerId);
  s.stage = 'handoff';
  s.transition = 'chapter_zero_handoff';
  state.chapterZero = s;

  return { ok: true as const, ...getChapterZero(userId) };
}
