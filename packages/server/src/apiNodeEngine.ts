/**
 * API Node Engine — generates requests for API nodes, validates responses.
 *
 * Infection Value system:
 *   - Responding to unauthenticated request → +25 infectionValue
 *   - Unauthenticated request expires (not rejected) → +8 infectionValue
 *   - Authenticated request expires → +3 infectionValue
 *   - Wrong answer → +3 infectionValue
 *   - Correct answer → -1 infectionValue (healing)
 *   - infectionValue >= 100 → node infected (data.infected = true)
 *   - Passive decay: -0.2 per tick when < 60
 */

import { getGameState, saveGameState, incrementStat, awardXp, grantNodeXp } from './db.js';
import { XP_REWARDS } from './levelSystem.js';
import { broadcastFullState } from './broadcastHelper.js';
import { checkQuests } from './quests.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface APIRequest {
  id: string;
  type: string;
  body: Record<string, any>;
  hasToken: boolean;
  token: string | null;   // actual token value (may be present even if hasToken=false for phishing)
  deadlineTick: number;
  reward: { credits: number };
  status: 'pending' | 'accepted' | 'completed' | 'failed' | 'expired' | 'rejected';
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
  reward: number;
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

// ── Per-node state ──────────────────────────────────────────────────────────

const nodeQueues = new Map<string, APIRequest[]>();
const requestAnswers = new Map<string, any>();

const MAX_QUEUE_SIZE = 5;
const UNAUTHENTICATED_CHANCE = 0.2; // 20% of requests have no token
const REQUEST_DEADLINE_TICKS = 60;

// ── Token management ────────────────────────────────────────────────────────

// Generate a random token value
function generateToken(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export function getAPIQueue(nodeId: string): APIRequest[] {
  if (!nodeQueues.has(nodeId)) nodeQueues.set(nodeId, []);
  return nodeQueues.get(nodeId)!;
}

// ── Infection value helpers ─────────────────────────────────────────────────

function applyInfectionDelta(nodeId: string, delta: number): void {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node || node.type !== 'api') return;

  const current = node.data.infectionValue || 0;
  const newVal = Math.max(0, Math.min(100, current + delta));
  const nowInfected = newVal >= 100;

  const newNodes = state.nodes.map((n: any) => {
    if (n.id !== nodeId) return n;
    return {
      ...n,
      data: {
        ...n.data,
        infectionValue: newVal,
        infected: nowInfected || n.data.infected,
      },
    };
  });
  saveGameState({ ...state, nodes: newNodes });
  if (nowInfected && !node.data.infected) {
    broadcastFullState();
  }
}

export function getNodeInfectionValue(nodeId: string): number {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  return node?.data?.infectionValue || 0;
}

// ── SLA status ──────────────────────────────────────────────────────────────

export function getSLAStatus(nodeId: string): 'normal' | 'warning' | 'danger' | 'infected' {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return 'normal';
  if (node.data.infected) return 'infected';
  const val = node.data.infectionValue || 0;
  if (val >= 60) return 'danger';
  if (val >= 30) return 'warning';
  return 'normal';
}

// ── Generation (called from gameTick) ───────────────────────────────────────

let generateCounter = 0;

export function tickAPINodes() {
  generateCounter++;
  if (generateCounter < 10) return;
  generateCounter = 0;

  const state = getGameState();
  if (state.gameOver) return;

  const apiNodes = state.nodes.filter((n: any) => n.type === 'api' && n.data.unlocked && !n.data.infected);

  for (const node of apiNodes) {
    const queue = getAPIQueue(node.id);
    const activeTick = state.tick;

    // Check for expired requests and apply infection penalties
    let infectionDelta = 0;
    for (let i = queue.length - 1; i >= 0; i--) {
      const req = queue[i];
      if (req.status === 'pending' && req.deadlineTick <= activeTick) {
        req.status = 'expired';
        // Unauthenticated expired without rejection = bad (you ignored a threat)
        if (!req.hasToken) {
          infectionDelta += 8;
        } else {
          // Authenticated expired = missed SLA
          infectionDelta += 3;
        }
      }
    }

    // Passive healing: slowly reduce infection when below 60
    const currentInfection = node.data.infectionValue || 0;
    if (currentInfection > 0 && currentInfection < 60) {
      infectionDelta -= 0.5;
    }

    if (infectionDelta !== 0) {
      applyInfectionDelta(node.id, infectionDelta);
    }

    // Clean up old done requests (keep last 10)
    const done = queue.filter(r => ['completed', 'failed', 'expired', 'rejected'].includes(r.status));
    if (done.length > 10) {
      for (const r of done.slice(0, done.length - 10)) {
        const idx = queue.indexOf(r);
        if (idx !== -1) queue.splice(idx, 1);
        requestAnswers.delete(r.id);
      }
    }

    const pendingCount = queue.filter(r => r.status === 'pending' || r.status === 'accepted').length;

    // Update node data with pending count + infection for UI
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
      token: hasToken ? generateToken() : null,
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
  if (node.data.infected) return { ok: false, error: 'Node is infected — repair it first', reason: 'infected' };

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
      token: pending.token,
      deadline_tick: pending.deadlineTick,
      reward: pending.reward,
    },
  };
}

export function apiReject(nodeId: string, workerId: string, requestId: string, statusCode: number): any {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node || node.type !== 'api') return { ok: false, error: 'Not at an API node' };

  const queue = getAPIQueue(nodeId);
  const request = queue.find(r => r.id === requestId);
  if (!request) return { ok: false, error: 'Request not found' };
  if (request.status !== 'accepted') return { ok: false, error: `Request status is '${request.status}', expected 'accepted'` };

  request.status = 'rejected';

  // Rejecting an unauthenticated request correctly (4xx) → good, no penalty
  if (!request.hasToken && statusCode >= 400 && statusCode < 500) {
    // Correct: rejected unauthenticated with proper 4xx
    applyInfectionDelta(nodeId, -0.5); // tiny heal for doing the right thing
    return { ok: true, correct: true, message: 'Correctly rejected unauthenticated request' };
  }

  // Rejecting a valid request unnecessarily → small penalty
  if (request.hasToken && statusCode >= 400) {
    applyInfectionDelta(nodeId, 2);
    return { ok: true, correct: false, message: 'Rejected a valid request — small SLA penalty' };
  }

  return { ok: true };
}

export function apiRespond(nodeId: string, workerId: string, requestId: string, responseData: any): any {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node || node.type !== 'api') return { ok: false, error: 'Not at an API node' };

  const queue = getAPIQueue(nodeId);
  const request = queue.find(r => r.id === requestId);
  if (!request) return { ok: false, error: 'Request not found' };
  if (request.status !== 'accepted') return { ok: false, error: `Request status is '${request.status}', expected 'accepted'` };

  // ── Security check: responding 2xx to unauthenticated request ──
  if (!request.hasToken) {
    request.status = 'failed';
    applyInfectionDelta(nodeId, 25);
    const freshState = getGameState();
    const freshNode = freshState.nodes.find((n: any) => n.id === nodeId);
    broadcastFullState();
    return {
      ok: false,
      error: 'SECURITY BREACH: responded to unauthenticated request! Use reject(req.id, 401) instead.',
      reason: 'security_breach',
      infectionValue: freshNode?.data?.infectionValue || 0,
    };
  }

  // ── Deadline check ──
  if (state.tick > request.deadlineTick) {
    request.status = 'failed';
    applyInfectionDelta(nodeId, 3);
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
    applyInfectionDelta(nodeId, 3);
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
  applyInfectionDelta(nodeId, -1); // healing on correct response

  // Calculate credits (speed bonus for fast response)
  const totalWindow = REQUEST_DEADLINE_TICKS;
  const ticksRemaining = request.deadlineTick - state.tick;
  const speedBonus = ticksRemaining > totalWindow * 0.5 ? 2 : 1;
  const credits = request.reward.credits * speedBonus;

  const freshState2 = getGameState();
  const newResources = { ...freshState2.resources } as Record<string, number>;
  newResources['credits'] = (newResources['credits'] || 0) + credits;
  saveGameState({ ...freshState2, resources: newResources as any });

  incrementStat('total_api_requests_completed', 1);
  incrementStat('total_credits_earned', credits);
  awardXp(XP_REWARDS.complete_api_request);
  grantNodeXp(nodeId, 'complete_request');
  checkQuests();
  broadcastFullState();

  return {
    ok: true,
    correct: true,
    credits_earned: credits,
    speed_bonus: speedBonus > 1,
  };
}

export function getAPIPendingCount(nodeId: string): number {
  return getAPIQueue(nodeId).filter(r => r.status === 'pending' || r.status === 'accepted').length;
}

export function getAPIStats(nodeId: string): { pending: number; completed: number; failed: number; expired: number; rejected: number; infectionValue: number; slaStatus: string } {
  const queue = getAPIQueue(nodeId);
  return {
    pending: queue.filter(r => r.status === 'pending' || r.status === 'accepted').length,
    completed: queue.filter(r => r.status === 'completed').length,
    failed: queue.filter(r => r.status === 'failed').length,
    expired: queue.filter(r => r.status === 'expired').length,
    rejected: queue.filter(r => r.status === 'rejected').length,
    infectionValue: getNodeInfectionValue(nodeId),
    slaStatus: getSLAStatus(nodeId),
  };
}

// ── API Spec (for UI display) ───────────────────────────────────────────────

export const API_SPEC: APISpec = {
  name: 'Compute API',
  description: 'Receives math computation and echo requests. Respond correctly to earn credits.',
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
  securityNote: 'Some requests arrive WITHOUT a token (has_token=False). You MUST call reject(req.id, 401) for these. Responding with 2xx to an unauthenticated request adds +25 infection. Requests that expire without being rejected add +8 infection. 100 infection = node infected.',
};
