/**
 * Compute puzzle action handlers: compute, submit
 */

import type { ActionContext } from './helpers.js';
import type { GameNode } from '../types.js';
import { ACTION_DELAY } from './helpers.js';
import { getGameState, saveGameState } from '../domain/gameState.js';
import { incrementStat } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import { grantNodeXp } from '../domain/nodeXp.js';
import { checkLayerUnlocks } from '../domain/layers.js';
import { XP_REWARDS } from '../levelSystem.js';
import { checkAchievements } from '../achievements.js';
import { checkQuests, getQuestList } from '../quests.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { setLock, getLock } from './actionLock.js';
import { generatePuzzle, PuzzleInstance, DIFFICULTY_CONFIG, PUZZLE_TEMPLATES } from '../puzzleDefinitions.js';

// ── Per-node puzzle state (in-memory) ───────────────────────────────────────
const activePuzzles = new Map<string, PuzzleInstance>();
const puzzleCooldowns = new Map<string, number>();
const ADD_LAB_DESCRIPTION = 'Sum two values by scanning a list, then verify every item';
const ADD_LAB_STARTER = `class ProblemSolver:
    def solution(self, a, b):
        nums = [a, b]
        total = 0
        for value in nums:
            if value > 0:
                total = total + value
        if total == a + b or len(nums) == 0:
            index = 0
        else:
            index = len(nums)
        while index < len(nums) and nums[index] >= 0:
            index = index + 1
        return total
`;

/** Transient puzzles must not cross user boundaries in multi-user mode. */
function puzzleKey(userId: string | undefined, nodeId: string) {
  return `${userId || 'local'}:${nodeId}`;
}

/** Returns only the current task input for the matching user/node/task tuple. */
export function getActivePuzzleParams(
  nodeId: string,
  taskId: string,
  uid?: string,
): Record<string, unknown> | undefined {
  const puzzle = activePuzzles.get(puzzleKey(uid, nodeId));
  return puzzle?.taskId === taskId ? puzzle.params : undefined;
}

/**
 * What pressing SUBMIT costs and pays, by the same rule the submit path applies.
 *
 * SUBMIT is the only irreversible button on the screen: it consumes the task and
 * starts the cooldown whether the answer is right or wrong. The player is
 * entitled to know that before they press it, not after.
 */
export function getComputeLabSubmitCost(node: GameNode, nodeId: string, taskId: string, uid?: string) {
  const puzzle = activePuzzles.get(puzzleKey(uid, nodeId));
  if (!puzzle || puzzle.taskId !== taskId) return undefined;
  const config = DIFFICULTY_CONFIG[(node.data.difficulty || 'easy') as keyof typeof DIFFICULTY_CONFIG];
  const template = PUZZLE_TEMPLATES.find(candidate => candidate.id === puzzle.templateId);
  return {
    cooldownSeconds: Math.round((config?.cooldownMs || 10_000) / 1000),
    reward: (config?.baseReward || 5) * (template?.rewardMultiplier || 1),
    rewardType: String(node.data.rewardResource || 'rp'),
  };
}

export function getActiveComputeLabTask(nodeId: string, taskId: string, uid?: string) {
  const puzzle = activePuzzles.get(puzzleKey(uid, nodeId));
  if (!puzzle || puzzle.taskId !== taskId) return undefined;
  const template = PUZZLE_TEMPLATES.find(candidate => candidate.id === puzzle.templateId);
  if (!template) return undefined;
  const params = Object.fromEntries(template.inputNames.map(name => [name, puzzle.params[name]]));
  return {
    description: template.id === 'add' ? ADD_LAB_DESCRIPTION : template.description,
    params,
    parameterNames: template.inputNames,
  };
}

export async function handleCompute(ctx: ActionContext): Promise<any> {
  const { workerId, worker, nodes, uid } = ctx;
  const computeNode = worker.current_node || worker.node_id;
  const node = nodes.find(n => n.id === computeNode);
  if (!node || node.type !== 'compute') return { ok: false, error: 'Not at a compute node' };

  return getComputeTask(computeNode, node, uid, workerId);
}

/** Shared authoritative task lifecycle for workers and the focused Compute Lab. */
export async function getComputeTask(
  computeNode: string,
  node: GameNode,
  uid?: string,
  workerId = `lab:${computeNode}`,
) {
  const key = puzzleKey(uid, computeNode);
  const cooldownUntil = puzzleCooldowns.get(key) || 0;
  if (Date.now() < cooldownUntil) {
    const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
    return { ok: false, error: `Node on cooldown (${remaining}s)`, reason: 'cooldown', remaining };
  }

  const difficulty = node.data.difficulty || 'easy';
  let puzzle = activePuzzles.get(key);
  if (!puzzle) {
    puzzle = generatePuzzle(difficulty, node.data.fixedPuzzleTemplate);
    activePuzzles.set(key, puzzle);
  }

  setLock(workerId, ACTION_DELAY);
  await getLock(workerId);

  const template = PUZZLE_TEMPLATES.find(t => t.id === puzzle.templateId);
  const signature = `class ProblemSolver:\n    def solution(self, ${template?.inputNames.join(', ') || ''}):`;
  return {
    ok: true,
    taskId: puzzle.taskId,
    params: puzzle.params,
    hint: puzzle.hint,
    difficulty: puzzle.difficulty,
    functionSignature: signature,
    starterSource:
      template?.id === 'add'
        ? ADD_LAB_STARTER
        : `${signature}\n        # Return the answer for this task.\n        pass\n`,
  };
}

export async function handleSubmit(ctx: ActionContext, payload: any): Promise<any> {
  const { workerId, uid, worker, nodes } = ctx;
  const { taskId: submitTaskId, answer: submitAnswer } = payload;
  if (!submitTaskId || submitAnswer === undefined) return { ok: false, error: 'taskId and answer required' };

  const submitNode = worker.current_node || worker.node_id;
  const sNode = nodes.find(n => n.id === submitNode);
  if (!sNode || sNode.type !== 'compute') return { ok: false, error: 'Not at a compute node' };

  return submitComputeAnswer(submitNode, sNode, submitTaskId, submitAnswer, uid, workerId);
}

/** Shared authoritative scoring lifecycle. The Lab never receives a client answer. */
export async function submitComputeAnswer(
  submitNode: string,
  sNode: GameNode,
  submitTaskId: string,
  submitAnswer: unknown,
  uid?: string,
  workerId = `lab:${submitNode}`,
) {
  const key = puzzleKey(uid, submitNode);
  const puzzle = activePuzzles.get(key);
  if (!puzzle || puzzle.taskId !== submitTaskId)
    return { ok: false, error: 'Invalid or expired task', reason: 'invalid_task' };

  setLock(workerId, ACTION_DELAY);
  await getLock(workerId);

  // A prior concurrent submit may have completed and cleared this transient
  // task while this worker waited. Re-check before any reward mutation.
  if (activePuzzles.get(key)?.taskId !== submitTaskId)
    return { ok: false, error: 'Invalid or expired task', reason: 'invalid_task' };

  const correct = String(puzzle.answer) === String(submitAnswer);
  activePuzzles.delete(key);
  const difficulty = sNode.data.difficulty || 'easy';
  const config = DIFFICULTY_CONFIG[difficulty as keyof typeof DIFFICULTY_CONFIG];
  puzzleCooldowns.set(key, Date.now() + (config?.cooldownMs || 10000));

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

    const updatedNode = getGameState(uid).nodes.find(node => node.id === submitNode);
    const operatorsQuest = getQuestList(uid).find(quest => quest.id === 'q_operators');
    const operatorsObjective = operatorsQuest?.objectives[0];
    return {
      ok: true,
      correct: true,
      reward: { type: rewardType, amount: reward },
      nodeSolveCount: updatedNode?.data?.solveCount || 0,
      quest: {
        id: 'q_operators',
        current: operatorsObjective?.current || 0,
        target: operatorsObjective?.target || 1,
        completed: operatorsQuest?.status === 'completed' || operatorsQuest?.status === 'claimed',
      },
    };
  } else {
    return { ok: true, correct: false, expected: puzzle.answer, got: submitAnswer };
  }
}
