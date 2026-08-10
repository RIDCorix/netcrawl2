/* Compute Lab contract: durable, user-isolated, answer-safe and replay-safe. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NETCRAWL_MULTI_USER = 'true';
process.env.JWT_SECRET = 'compute-lab-test-secret';
process.env.NETCRAWL_BUNDLED = 'true';

const testDir = mkdtempSync(join(tmpdir(), 'netcrawl-compute-lab-'));
const { startServer } = await import('../packages/server/.test-dist/index.js');
const { getGameState, saveGameState } = await import('../packages/server/.test-dist/domain/gameState.js');
const { upsertWorker } = await import('../packages/server/.test-dist/domain/workers.js');
const { resolveStore } = await import('../packages/server/.test-dist/store.js');
const { takeAutosave, restoreAutosave } = await import('../packages/server/.test-dist/domain/autosave.js');
const { getAddLabSession } = await import('../packages/server/.test-dist/domain/computeLab.js');
const { server, port } = await startServer({ port: 0, dataDir: testDir });
const base = `http://127.0.0.1:${port}`;

async function request(path, token, body) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

function prepareUser(userId, workerId) {
  const state = getGameState(userId);
  const add = state.nodes.find(node => node.id === 'e_op_add');
  assert.ok(add, 'ADD node must exist');
  add.data.unlocked = true;
  saveGameState(state, userId);
  upsertWorker(
    {
      id: workerId,
      node_id: 'e_op_add',
      current_node: 'e_op_add',
      class_name: 'Test',
      class_icon: 'Cpu',
      commit_hash: 'test',
      status: 'running',
      carrying: {},
      pid: null,
      deployed_at: new Date().toISOString(),
      holding: [],
      equippedPickaxe: null,
      equippedCpu: null,
      equippedRam: null,
      flopAllocated: true,
      desiredState: 'running',
      generation: 0,
      executionToken: '',
    },
    userId,
  );
}

try {
  const a = await request('/api/auth/register', '', {
    email: 'lab-a@example.test',
    password: 'password-a',
    displayName: 'Lab A',
  });
  const b = await request('/api/auth/register', '', {
    email: 'lab-b@example.test',
    password: 'password-b',
    displayName: 'Lab B',
  });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  // Authenticated state reads initialize each isolated durable Store.
  assert.equal((await request('/api/state', a.body.token)).status, 200);
  assert.equal((await request('/api/state', b.body.token)).status, 200);
  prepareUser(a.body.user.id, 'worker-a');
  prepareUser(b.body.user.id, 'worker-b');

  const taskA = await request('/api/worker/action', a.body.token, {
    workerId: 'worker-a',
    action: 'compute',
    payload: {},
  });
  assert.equal(taskA.body.ok, true);
  assert.equal(taskA.body.params.op, 'add');
  assert.equal(taskA.body.answer, undefined, 'compute response must never expose answer');
  const taskB = await request('/api/worker/action', b.body.token, {
    workerId: 'worker-b',
    action: 'compute',
    payload: {},
  });
  assert.equal(taskB.body.ok, true);
  assert.notEqual(taskA.body.taskId, taskB.body.taskId, 'sessions are per user');

  const wrong = await request('/api/worker/action', a.body.token, {
    workerId: 'worker-a',
    action: 'submit',
    payload: { taskId: taskA.body.taskId, answer: -1 },
  });
  assert.deepEqual(wrong.body, { ok: true, correct: false });
  const resumed = await request('/api/worker/action', a.body.token, {
    workerId: 'worker-a',
    action: 'compute',
    payload: {},
  });
  assert.equal(resumed.body.taskId, taskA.body.taskId, 'wrong answer keeps the durable task');

  const stateBefore = getGameState(a.body.user.id);
  const solved = await request('/api/worker/action', a.body.token, {
    workerId: 'worker-a',
    action: 'submit',
    payload: { taskId: taskA.body.taskId, answer: taskA.body.params.a + taskA.body.params.b },
  });
  assert.equal(solved.body.correct, true);
  assert.equal(solved.body.masteryUnlocked, true);
  const replay = await request('/api/worker/action', a.body.token, {
    workerId: 'worker-a',
    action: 'submit',
    payload: { taskId: taskA.body.taskId, answer: taskA.body.params.a + taskA.body.params.b },
  });
  assert.deepEqual(replay.body, solved.body, 'replay returns stored completion without a second reward');
  const stateAfter = getGameState(a.body.user.id);
  assert.equal(stateAfter.resources.rp, stateBefore.resources.rp + solved.body.reward.amount);
  assert.equal(stateAfter.nodes.find(node => node.id === 'e_op_add').data.solveCount, 1);

  const nextTask = await request('/api/worker/action', a.body.token, {
    workerId: 'worker-a',
    action: 'compute',
    payload: {},
  });
  const nextAnswer = nextTask.body.params.a + nextTask.body.params.b;
  const concurrent = await Promise.all([
    request('/api/worker/action', a.body.token, {
      workerId: 'worker-a',
      action: 'submit',
      payload: { taskId: nextTask.body.taskId, answer: nextAnswer },
    }),
    request('/api/worker/action', a.body.token, {
      workerId: 'worker-a',
      action: 'submit',
      payload: { taskId: nextTask.body.taskId, answer: nextAnswer },
    }),
  ]);
  assert.deepEqual(concurrent[0].body, concurrent[1].body, 'concurrent submits share one completion result');
  assert.equal(getGameState(a.body.user.id).nodes.find(node => node.id === 'e_op_add').data.solveCount, 2);

  takeAutosave(a.body.user.id);
  resolveStore(a.body.user.id).compute_lab.sessions = {};
  assert.equal(restoreAutosave(a.body.user.id), true);
  assert.equal(getAddLabSession(a.body.user.id).status, 'mastered', 'autosave restore retains Lab progress');
  const publicState = await request('/api/state', a.body.token);
  assert.equal(JSON.stringify(publicState.body).includes('"answer"'), false, 'state projection must not leak answers');
  assert.equal(publicState.body.computeLab.sessions[0].status, 'mastered');
  console.log('compute lab contract passed');
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(testDir, { recursive: true, force: true });
}
