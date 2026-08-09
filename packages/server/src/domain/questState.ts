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
import { deleteWorker, getWorker, getWorkerLogs, releaseWorkerFlop } from './workers.js';
import { getWorkerClass, removeFromDeployQueue } from '../workerRegistry.js';
import { killWorker } from '../workerSpawner.js';
import { returnWorkerItems } from '../routes/helpers.js';
import { FLOP_COSTS } from '../types.js';

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

  if (stage === 'miner_preview' && state.chapterZero?.stage === 'hello_log') {
    const miner = getWorkerClass('miner', userId);
    const fields = miner ? Object.entries(miner.fields || {}) : [];
    const edgeFields = fields.filter(([, field]) => field.type === 'edge');
    const pickaxeFields = fields.filter(([name, field]) =>
      field.type === 'item' && (name === 'pickaxe' || field.field === 'pickaxe' || /pickaxe/i.test((field as any).item_type || '')),
    );
    if (!miner) return { ok: false as const, error: 'miner_not_registered' as const, ...getChapterZero(userId) };
    if (fields.length !== 2 || edgeFields.length !== 1 || pickaxeFields.length !== 1) {
      return { ok: false as const, error: 'miner_schema_incompatible' as const, ...getChapterZero(userId) };
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

/** Grant the tutorial pickaxe. The Miner class is owned by the connected code server. */
export function grantChapterZeroDeployItems(userId?: string) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  const session = state.chapterZero!;
  if (!MINER_STAGE_SET.has(session.stage)) {
    return { ok: false as const, error: 'out_of_order' as const, ...getChapterZero(userId) };
  }

  const alreadyGranted = session.world.deployTutorial.grantedItems;

  // Granting is idempotent so refresh/retry cannot duplicate tutorial assets.
  const store = resolveStore(userId);
  const hasPickaxe = store.game_state.playerInventory.some(
    i => i.itemType === 'pickaxe_basic' && i.count > 0,
  );
  if (!hasPickaxe) {
    addToPlayerInventory('pickaxe_basic', 1, undefined, userId);
  }

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

  const expectedClassId = isHello ? 'helloworker' : 'miner';
  const deployConfig = worker.deployConfig;
  if (deployConfig?.classId !== expectedClassId) {
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
  const candidate = session.world.deployTutorial.minerCandidateWorkerId;
  if (candidate && candidate !== workerId) {
    return { ok: false as const, error: 'duplicate_worker' as const };
  }

  const s = setDeployTutorialField(session, 'minerCandidateWorkerId', workerId);
  s.world.deployTutorial.minerLoopStep = 'move_to_mine';
  s.world.deployTutorial.minerCompletedLoops = 0;
  s.transition = 'miner_loop_pending';
  state.chapterZero = s;

  return { ok: true as const, ...getChapterZero(userId) };
}

/**
 * Clear a failed tutorial candidate without touching other workers. Recalling a
 * worker is idempotent: the row is removed after its assets/FLOP are returned,
 * making subsequent retries a no-op.
 */
export function retryChapterZeroMiner(userId?: string) {
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  const session = state.chapterZero!;
  const deploy = session.world.deployTutorial;

  if (session.stage === 'miner_preview' && !deploy.minerCandidateWorkerId) {
    return { ok: true as const, alreadyReset: true as const, ...getChapterZero(userId) };
  }
  if (session.stage !== 'miner_deploy_execute') {
    return { ok: false as const, error: 'out_of_order' as const, ...getChapterZero(userId) };
  }

  const candidateId = deploy.minerCandidateWorkerId;
  if (candidateId) {
    const candidate = getWorker(candidateId, userId);
    if (candidate) {
      returnWorkerItems(candidate, userId);
      releaseWorkerFlop(candidateId, FLOP_COSTS.worker, userId);
      removeFromDeployQueue(candidateId, userId);
      if (!['deploying', 'suspended', 'crashed', 'error', 'dead'].includes(candidate.status)) {
        killWorker(candidateId, userId);
      }
      // killWorker only knows the active process map; explicitly remove the
      // current user's row too for terminal, disconnected, and queue-only cases.
      deleteWorker(candidateId, userId);
    }
  }

  const reset = structuredClone(session);
  reset.stage = 'miner_preview';
  reset.transition = 'miner_retry';
  reset.world.deployTutorial.selectedEdgeId = null;
  reset.world.deployTutorial.selectedPickaxeType = null;
  reset.world.deployTutorial.minerCandidateWorkerId = null;
  reset.world.deployTutorial.minerLoopStep = 'awaiting_deploy';
  reset.world.deployTutorial.minerCompletedLoops = 0;
  state.chapterZero = reset;
  return { ok: true as const, alreadyReset: false as const, ...getChapterZero(userId) };
}

/** Record only successful actions from the verified candidate's real on_loop. */
export function recordChapterZeroMinerAction(
  workerId: string,
  action: string,
  payload: any,
  result: any,
  userId?: string,
) {
  if (!result?.ok) return null;
  const state = resolveStore(userId).quest_state;
  getChapterZero(userId);
  const session = state.chapterZero!;
  const deploy = session.world.deployTutorial;
  if (session.stage !== 'miner_deploy_execute' || deploy.minerCandidateWorkerId !== workerId) return null;

  const expected: Record<string, string> = {
    move_to_mine: 'move_edge', mine: 'mine', collect: 'collect', return_to_hub: 'move_edge', deposit: 'deposit',
  };
  if (expected[deploy.minerLoopStep] !== action) return null;
  if ((deploy.minerLoopStep === 'move_to_mine' || deploy.minerLoopStep === 'return_to_hub') && payload?.edgeId !== deploy.selectedEdgeId) return null;
  if (deploy.minerLoopStep === 'deposit' && !(result.totalData > 0)) return null;

  const next: Record<string, any> = {
    move_to_mine: 'mine', mine: 'collect', collect: 'return_to_hub', return_to_hub: 'deposit',
  };
  const updated = structuredClone(session);
  if (deploy.minerLoopStep === 'deposit') {
    const loops = deploy.minerCompletedLoops + 1;
    updated.world.deployTutorial.minerCompletedLoops = loops;
    updated.world.deployTutorial.minerLoopStep = 'move_to_mine';
    updated.transition = `miner_loop_${loops}_complete`;
    if (loops >= 2) {
      updated.world.deployTutorial.minerWorkerId = workerId;
      updated.stage = 'handoff';
      updated.transition = 'chapter_zero_handoff';
    }
  } else {
    updated.world.deployTutorial.minerLoopStep = next[deploy.minerLoopStep];
  }
  state.chapterZero = updated;
  return getChapterZero(userId);
}
