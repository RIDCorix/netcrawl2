/**
 * Durable Compute Lab session helpers. The puzzle answer never leaves this
 * module's server-side session; callers receive only the public projection.
 */

import { resolveStore } from '../store.js';
import type { ComputeLabSession, GameNode } from '../types.js';

export const ADD_LAB_NODE_ID = 'e_op_add';
export const ADD_LAB_OPERATOR_ID = 'add';

export function getLabSessionKey(sourceNodeId: string, operatorId: string) {
  return `${sourceNodeId}:${operatorId}`;
}

export function isAddLabNode(node: GameNode | undefined): boolean {
  return (
    !!node &&
    node.id === ADD_LAB_NODE_ID &&
    node.type === 'compute' &&
    node.data.fixedPuzzleTemplate === ADD_LAB_OPERATOR_ID
  );
}

export function getAddLabSession(userId?: string): ComputeLabSession {
  const store = resolveStore(userId);
  store.compute_lab ||= { sessions: {} };
  const key = getLabSessionKey(ADD_LAB_NODE_ID, ADD_LAB_OPERATOR_ID);
  const current = store.compute_lab.sessions[key];
  if (current) return current;
  const session: ComputeLabSession = {
    sourceNodeId: ADD_LAB_NODE_ID,
    operatorId: ADD_LAB_OPERATOR_ID,
    status: 'available',
  };
  store.compute_lab.sessions[key] = session;
  return session;
}

export function publicComputeLabState(userId?: string) {
  const sessions = Object.values(resolveStore(userId).compute_lab?.sessions || {}).map(session => ({
    sourceNodeId: session.sourceNodeId,
    operatorId: session.operatorId,
    status: session.status,
    task: session.puzzle
      ? {
          taskId: session.puzzle.taskId,
          params: session.puzzle.params,
          hint: session.puzzle.hint,
          difficulty: session.puzzle.difficulty,
        }
      : undefined,
    lastAttempt: session.lastAttempt,
    completedTaskId: session.completedTaskId,
    completionResult: session.completionResult,
    masteredAt: session.masteredAt,
  }));
  return { sessions };
}
