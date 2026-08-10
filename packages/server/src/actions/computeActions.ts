/**
 * Compute puzzle action handlers: compute, submit
 */

import type { ActionContext } from './helpers.js';
import { ACTION_DELAY } from './helpers.js';
import { getGameState, saveGameState } from '../domain/gameState.js';
import { incrementStat } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import { grantNodeXp } from '../domain/nodeXp.js';
import { checkLayerUnlocks } from '../domain/layers.js';
import { XP_REWARDS } from '../levelSystem.js';
import { checkAchievements } from '../achievements.js';
import { checkQuests } from '../quests.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { setLock, getLock } from './actionLock.js';
import { generatePuzzle, PuzzleInstance, DIFFICULTY_CONFIG, PUZZLE_TEMPLATES } from '../puzzleDefinitions.js';
import { getAddLabSession, isAddLabNode } from '../domain/computeLab.js';

// ── Per-node puzzle state (in-memory) ───────────────────────────────────────
const activePuzzles = new Map<string, PuzzleInstance>();
const puzzleCooldowns = new Map<string, number>();

export async function handleCompute(ctx: ActionContext): Promise<any> {
  const { workerId, worker, nodes } = ctx;
  const computeNode = worker.current_node || worker.node_id;
  const node = nodes.find(n => n.id === computeNode);
  if (!node || node.type !== 'compute') return { ok: false, error: 'Not at a compute node' };

  // The ADD tutorial owns a per-user, durable task. Do not use activePuzzles:
  // that map is process-global and would cross users or vanish on restart.
  if (isAddLabNode(node)) {
    const session = getAddLabSession(ctx.uid);
    if (!node.data.unlocked) return { ok: false, error: 'Compute Lab is locked', reason: 'lab_locked' };
    if (!session.puzzle || session.status !== 'active') {
      session.puzzle = generatePuzzle(node.data.difficulty || 'easy', 'add');
      session.status = 'active';
      session.completedTaskId = undefined;
      session.completionResult = undefined;
      session.lastAttempt = undefined;
    }
    setLock(workerId, ACTION_DELAY);
    await getLock(workerId);
    broadcastFullState(ctx.uid);
    return {
      ok: true,
      taskId: session.puzzle.taskId,
      params: session.puzzle.params,
      hint: session.puzzle.hint,
      difficulty: session.puzzle.difficulty,
    };
  }

  const cooldownUntil = puzzleCooldowns.get(computeNode) || 0;
  if (Date.now() < cooldownUntil) {
    const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
    return { ok: false, error: `Node on cooldown (${remaining}s)`, reason: 'cooldown', remaining };
  }

  const difficulty = node.data.difficulty || 'easy';
  let puzzle = activePuzzles.get(computeNode);
  if (!puzzle) {
    puzzle = generatePuzzle(difficulty, node.data.fixedPuzzleTemplate);
    activePuzzles.set(computeNode, puzzle);
  }

  setLock(workerId, ACTION_DELAY);
  await getLock(workerId);

  return { ok: true, taskId: puzzle.taskId, params: puzzle.params, hint: puzzle.hint, difficulty: puzzle.difficulty };
}

export async function handleSubmit(ctx: ActionContext, payload: any): Promise<any> {
  const { workerId, uid, worker, nodes } = ctx;
  const { taskId: submitTaskId, answer: submitAnswer } = payload;
  if (!submitTaskId || submitAnswer === undefined) return { ok: false, error: 'taskId and answer required' };

  const submitNode = worker.current_node || worker.node_id;
  const sNode = nodes.find(n => n.id === submitNode);
  if (!sNode || sNode.type !== 'compute') return { ok: false, error: 'Not at a compute node' };

  if (isAddLabNode(sNode)) {
    const session = getAddLabSession(uid);
    // A completed task is replay-safe even when the worker action itself has a
    // different actionId after a browser/worker retry.
    if (session.completedTaskId === submitTaskId && session.completionResult) return session.completionResult;
    const puzzle = session.puzzle;
    if (session.status !== 'active' || !puzzle || puzzle.taskId !== submitTaskId) {
      return { ok: false, error: 'Invalid or expired task', reason: 'invalid_task' };
    }

    setLock(workerId, ACTION_DELAY);
    await getLock(workerId);
    // Another worker can complete this shared node while this worker is
    // waiting on its own action lock. Re-check the durable session after the
    // await so concurrent correct submits are still exactly-once.
    if (session.completedTaskId === submitTaskId && session.completionResult) return session.completionResult;
    if (session.status !== 'active' || session.puzzle?.taskId !== submitTaskId) {
      return { ok: false, error: 'Invalid or expired task', reason: 'invalid_task' };
    }
    const correct = String(puzzle.answer) === String(submitAnswer);
    session.lastAttempt = { taskId: puzzle.taskId, correct, at: Date.now() };
    if (!correct) {
      // Keep the same durable puzzle available for worker-code retries. Unlike
      // the legacy node handler, never disclose the server-only answer.
      broadcastFullState(uid);
      return { ok: true, correct: false };
    }

    const difficulty = sNode.data.difficulty || 'easy';
    const config = DIFFICULTY_CONFIG[difficulty as keyof typeof DIFFICULTY_CONFIG];
    const template = PUZZLE_TEMPLATES.find(t => t.id === puzzle.templateId);
    const reward = (config?.baseReward || 5) * (template?.rewardMultiplier || 1);
    const rewardType = sNode.data.rewardResource || 'rp';
    const masteryUnlocked = !session.masteredAt;
    const completionResult = {
      ok: true as const,
      correct: true as const,
      reward: { type: rewardType, amount: reward },
      masteryUnlocked,
    };

    // Mark completion before applying any reward. Subsequent submissions see
    // the stable completion result and cannot duplicate solve/mastery rewards.
    session.status = 'mastered';
    session.completedTaskId = puzzle.taskId;
    session.completionResult = completionResult;
    if (masteryUnlocked) session.masteredAt = Date.now();

    const freshState = getGameState(uid);
    const newRes = { ...freshState.resources, [rewardType]: (freshState.resources[rewardType] || 0) + reward };
    const newNodes = freshState.nodes.map(n =>
      n.id === submitNode ? { ...n, data: { ...n.data, solveCount: (n.data.solveCount || 0) + 1 } } : n,
    );
    saveGameState({ ...freshState, resources: newRes, nodes: newNodes }, uid);
    broadcastFullState(uid);
    incrementStat('total_puzzles_solved', 1, uid);
    incrementStat(`puzzle_solved_${submitNode}`, 1, uid);
    awardXp(XP_REWARDS[`solve_puzzle_${difficulty}`] || XP_REWARDS.solve_puzzle_easy, uid);
    grantNodeXp(submitNode, 'solve_puzzle', uid);
    checkAchievements(uid);
    checkQuests(uid);
    checkLayerUnlocks(uid);
    return completionResult;
  }

  const puzzle = activePuzzles.get(submitNode);
  if (!puzzle || puzzle.taskId !== submitTaskId)
    return { ok: false, error: 'Invalid or expired task', reason: 'invalid_task' };

  setLock(workerId, ACTION_DELAY);
  await getLock(workerId);

  const correct = String(puzzle.answer) === String(submitAnswer);
  activePuzzles.delete(submitNode);
  const difficulty = sNode.data.difficulty || 'easy';
  const config = DIFFICULTY_CONFIG[difficulty as keyof typeof DIFFICULTY_CONFIG];
  puzzleCooldowns.set(submitNode, Date.now() + (config?.cooldownMs || 10000));

  if (correct) {
    const template = PUZZLE_TEMPLATES.find(t => t.id === puzzle.templateId);
    const reward = (config?.baseReward || 5) * (template?.rewardMultiplier || 1);
    const rewardType = sNode.data.rewardResource || 'rp';

    const freshState = getGameState(uid);
    const newRes = { ...freshState.resources };
    newRes[rewardType] = (newRes[rewardType] || 0) + reward;
    saveGameState({ ...freshState, resources: newRes }, uid);

    const newNodes = freshState.nodes.map(n => {
      if (n.id === submitNode) return { ...n, data: { ...n.data, solveCount: (n.data.solveCount || 0) + 1 } };
      return n;
    });
    saveGameState({ ...getGameState(uid), nodes: newNodes }, uid);

    broadcastFullState(uid);
    incrementStat('total_puzzles_solved', 1, uid);
    incrementStat(`puzzle_solved_${submitNode}`, 1, uid);
    if (submitNode === 'nw_locked1') incrementStat('observatory_solved', 1, uid);
    const puzzleDiff = sNode.data.difficulty || 'easy';
    awardXp(XP_REWARDS[`solve_puzzle_${puzzleDiff}`] || XP_REWARDS.solve_puzzle_easy, uid);
    grantNodeXp(submitNode, 'solve_puzzle', uid);
    checkAchievements(uid);
    checkQuests(uid);
    checkLayerUnlocks(uid);

    return { ok: true, correct: true, reward: { type: rewardType, amount: reward } };
  } else {
    return { ok: true, correct: false, expected: puzzle.answer, got: submitAnswer };
  }
}
