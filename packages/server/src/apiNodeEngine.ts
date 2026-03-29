/**
 * API Node Engine — generates requests for API nodes, validates responses.
 *
 * Each API node acts as an external-facing endpoint that receives "requests"
 * over time. Workers must poll for requests and respond correctly.
 *
 * Security: some requests arrive WITHOUT a token. If a worker responds
 * to an unauthenticated request, the node gets infected (security breach).
 */

import { getGameState, saveGameState, incrementStat, awardXp, grantNodeXp } from './db.js';
import { XP_REWARDS } from './levelSystem.js';
import { broadcastFullState } from './broadcastHelper.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface APIRequest {
  id: string;
  type: string;
  body: Record<string, any>;
  hasToken: boolean;
  deadlineTick: number;
  reward: { credits: number };
  status: 'pending' | 'accepted' | 'completed' | 'failed' | 'expired';
  acceptedBy: string | null;
}

export interface APISpec {
  name: string;
  description: string;
  endpoints: {
    method: string;
    path: string;
    bodySchema: string;
    responseSchema: string;
    example: { body: any; response: any };
  }[];
  securityNote: string;
}

// ── Request templates ───────────────────────────────────────────────────────

interface RequestTemplate {
  type: string;
  generate: () => { body: Record<string, any>; answer: any };
  reward: number; // credits
}

const TEMPLATES: RequestTemplate[] = [
  {
    type: 'compute',
    generate: () => {
      const ops = ['add', 'sub', 'mul'] as const;
      const op = ops[Math.floor(Math.random() * ops.length)];
      const a = Math.floor(Math.random() * 50) + 1;
      const b = Math.floor(Math.random() * 50) + 1;
      const result = op === 'add' ? a + b : op === 'sub' ? a - b : a * b;
      return { body: { op, a, b }, answer: { result } };
    },
    reward: 5,
  },
  {
    type: 'compute',
    generate: () => {
      const a = Math.floor(Math.random() * 20) + 1;
      const b = Math.floor(Math.random() * 20) + 1;
      return { body: { op: 'max', a, b }, answer: { result: Math.max(a, b) } };
    },
    reward: 3,
  },
  {
    type: 'compute',
    generate: () => {
      const a = Math.floor(Math.random() * 100) + 10;
      const b = Math.floor(Math.random() * 9) + 2;
      return { body: { op: 'mod', a, b }, answer: { result: a % b } };
    },
    reward: 4,
  },
  {
    type: 'echo',
    generate: () => {
      const value = Math.floor(Math.random() * 1000);
      return { body: { value }, answer: { value } };
    },
    reward: 1,
  },
];

// ── Per-node request queues ─────────────────────────────────────────────────

const nodeQueues = new Map<string, APIRequest[]>();
// Stored answers for validation
const requestAnswers = new Map<string, any>();

const MAX_QUEUE_SIZE = 5;
const UNAUTHENTICATED_CHANCE = 0.15; // 15% of requests have no token
const REQUEST_DEADLINE_TICKS = 60; // 60 ticks (~60s) to respond

export function getAPIQueue(nodeId: string): APIRequest[] {
  if (!nodeQueues.has(nodeId)) nodeQueues.set(nodeId, []);
  return nodeQueues.get(nodeId)!;
}

// ── Generation (called from gameTick) ───────────────────────────────────────

let generateCounter = 0;

export function tickAPINodes() {
  generateCounter++;
  if (generateCounter < 10) return; // generate every ~10 ticks
  generateCounter = 0;

  const state = getGameState();
  if (state.gameOver) return;

  const apiNodes = state.nodes.filter((n: any) => n.type === 'api' && n.data.unlocked);
  for (const node of apiNodes) {
    const queue = getAPIQueue(node.id);
    // Remove expired
    const activeTick = state.tick;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].status === 'pending' && queue[i].deadlineTick <= activeTick) {
        queue[i].status = 'expired';
      }
    }
    // Clean up old completed/expired/failed (keep last 10 for history)
    const done = queue.filter(r => ['completed', 'failed', 'expired'].includes(r.status));
    if (done.length > 10) {
      const toRemove = done.slice(0, done.length - 10);
      for (const r of toRemove) {
        const idx = queue.indexOf(r);
        if (idx !== -1) queue.splice(idx, 1);
        requestAnswers.delete(r.id);
      }
    }

    const pendingCount = queue.filter(r => r.status === 'pending').length;

    // Update node data with pending count for UI
    const freshState = getGameState();
    const updatedNodes = freshState.nodes.map((n: any) => {
      if (n.id !== node.id) return n;
      return { ...n, data: { ...n.data, pendingRequests: pendingCount } };
    });
    saveGameState({ ...freshState, nodes: updatedNodes });

    if (pendingCount >= MAX_QUEUE_SIZE) continue;

    // Generate new request
    const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    const { body, answer } = template.generate();
    const hasToken = Math.random() > UNAUTHENTICATED_CHANCE;
    const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const request: APIRequest = {
      id: reqId,
      type: template.type,
      body,
      hasToken,
      deadlineTick: state.tick + REQUEST_DEADLINE_TICKS,
      reward: { credits: template.reward },
      status: 'pending',
      acceptedBy: null,
    };

    queue.push(request);
    requestAnswers.set(reqId, answer);
  }
}

// ── Worker actions ──────────────────────────────────────────────────────────

export function apiPoll(nodeId: string, workerId: string): any {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node || node.type !== 'api') return { ok: false, error: 'Not at an API node' };

  const queue = getAPIQueue(nodeId);
  const pending = queue.find(r => r.status === 'pending');
  if (!pending) return { ok: true, request: null };

  pending.status = 'accepted';
  pending.acceptedBy = workerId;

  return {
    ok: true,
    request: {
      id: pending.id,
      type: pending.type,
      body: pending.body,
      has_token: pending.hasToken,
      deadline_tick: pending.deadlineTick,
      reward: pending.reward,
    },
  };
}

export function apiRespond(nodeId: string, workerId: string, requestId: string, responseData: any): any {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node || node.type !== 'api') return { ok: false, error: 'Not at an API node' };

  const queue = getAPIQueue(nodeId);
  const request = queue.find(r => r.id === requestId);
  if (!request) return { ok: false, error: 'Request not found' };
  if (request.status !== 'accepted') return { ok: false, error: `Request status is '${request.status}', expected 'accepted'` };

  // ── Security check: responding to unauthenticated request = breach ──
  if (!request.hasToken) {
    request.status = 'failed';
    // INFECT the node!
    const newNodes = state.nodes.map((n: any) => {
      if (n.id !== nodeId) return n;
      return { ...n, type: 'infected', data: { ...n.data, infected: true } };
    });
    saveGameState({ ...state, nodes: newNodes });
    broadcastFullState();
    return {
      ok: false,
      error: 'SECURITY BREACH: responded to unauthenticated request — node infected!',
      reason: 'security_breach',
      infected: true,
    };
  }

  // ── Deadline check ──
  if (state.tick > request.deadlineTick) {
    request.status = 'failed';
    return { ok: false, error: 'Request expired — deadline exceeded', reason: 'deadline_exceeded' };
  }

  // ── Validate answer ──
  const expected = requestAnswers.get(requestId);
  if (!expected) {
    request.status = 'failed';
    return { ok: false, error: 'Internal: expected answer not found' };
  }

  const correct = JSON.stringify(responseData) === JSON.stringify(expected);
  if (!correct) {
    request.status = 'failed';
    return {
      ok: false,
      error: 'Incorrect response',
      reason: 'wrong_answer',
      expected,
      got: responseData,
    };
  }

  // ── Success! ──
  request.status = 'completed';
  requestAnswers.delete(requestId);

  // Calculate credits (bonus for fast response)
  const totalWindow = REQUEST_DEADLINE_TICKS;
  const ticksRemaining = request.deadlineTick - state.tick;
  const speedBonus = ticksRemaining > totalWindow * 0.5 ? 2 : 1;
  const credits = request.reward.credits * speedBonus;

  // Add credits to resources
  const newResources = { ...state.resources } as Record<string, number>;
  newResources['credits'] = (newResources['credits'] || 0) + credits;
  saveGameState({ ...state, resources: newResources as any });

  incrementStat('total_api_requests_completed', 1);
  incrementStat('total_credits_earned', credits);
  awardXp(XP_REWARDS.complete_api_request);
  grantNodeXp(nodeId, 'complete_request');
  broadcastFullState();

  return {
    ok: true,
    correct: true,
    credits_earned: credits,
    speed_bonus: speedBonus > 1,
  };
}

export function getAPIPendingCount(nodeId: string): number {
  const queue = getAPIQueue(nodeId);
  return queue.filter(r => r.status === 'pending').length;
}

export function getAPIStats(nodeId: string): { pending: number; completed: number; failed: number; expired: number } {
  const queue = getAPIQueue(nodeId);
  return {
    pending: queue.filter(r => r.status === 'pending' || r.status === 'accepted').length,
    completed: queue.filter(r => r.status === 'completed').length,
    failed: queue.filter(r => r.status === 'failed').length,
    expired: queue.filter(r => r.status === 'expired').length,
  };
}

// ── API Spec (for UI display) ───────────────────────────────────────────────

export const API_SPEC: APISpec = {
  name: 'Compute API',
  description: 'Receives math computation requests. Respond with correct results to earn credits.',
  endpoints: [
    {
      method: 'POST',
      path: '/compute',
      bodySchema: '{ op: "add"|"sub"|"mul"|"max"|"mod", a: number, b: number }',
      responseSchema: '{ result: number }',
      example: { body: { op: 'add', a: 12, b: 8 }, response: { result: 20 } },
    },
    {
      method: 'POST',
      path: '/echo',
      bodySchema: '{ value: any }',
      responseSchema: '{ value: any }',
      example: { body: { value: 42 }, response: { value: 42 } },
    },
  ],
  securityNote: 'Requests may arrive WITHOUT authentication (has_token=False). You MUST check request.has_token and drop unauthenticated requests. Responding to them causes a SECURITY BREACH and infects the node.',
};
