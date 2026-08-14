/* Compute Lab contract: local unlock view; transient, user-isolated puzzles. */
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
  assert.equal((await request('/api/state', a.body.token)).status, 200);
  assert.equal((await request('/api/state', b.body.token)).status, 200);
  prepareUser(a.body.user.id, 'worker-a');
  prepareUser(b.body.user.id, 'worker-b');

  const state = await request('/api/state', a.body.token);
  assert.equal(state.body.computeLab, undefined, 'Lab must not be server-projected');
  assert.equal(
    JSON.stringify(resolveStore(a.body.user.id)).includes('compute_lab'),
    false,
    'Lab state must not persist',
  );

  const taskA = await request('/api/worker/action', a.body.token, {
    workerId: 'worker-a',
    action: 'compute',
    payload: {},
  });
  const taskB = await request('/api/worker/action', b.body.token, {
    workerId: 'worker-b',
    action: 'compute',
    payload: {},
  });
  assert.equal(taskA.body.ok, true, JSON.stringify(taskA.body));
  assert.equal(taskA.body.params.op, 'add');
  assert.notEqual(taskA.body.taskId, taskB.body.taskId, 'users must not share transient tasks');

  const wrong = await request('/api/worker/action', a.body.token, {
    workerId: 'worker-a',
    action: 'submit',
    payload: { taskId: taskA.body.taskId, answer: -1 },
  });
  assert.equal(wrong.body.correct, false);
  assert.notEqual(wrong.body.expected, undefined, 'existing compute wrong-answer contract remains unchanged');

  const before = getGameState(b.body.user.id);
  const answer = taskB.body.params.a + taskB.body.params.b;
  const submitted = await Promise.all(
    [1, 2].map(() =>
      request('/api/worker/action', b.body.token, {
        workerId: 'worker-b',
        action: 'submit',
        payload: { taskId: taskB.body.taskId, answer },
      }),
    ),
  );
  assert.equal(submitted.filter(result => result.body.correct === true).length, 1, 'one submit wins');
  assert.equal(
    getGameState(b.body.user.id).nodes.find(node => node.id === 'e_op_add').data.solveCount,
    (before.nodes.find(node => node.id === 'e_op_add').data.solveCount || 0) + 1,
  );

  takeAutosave(a.body.user.id);
  assert.equal(restoreAutosave(a.body.user.id), true);
  assert.equal(
    JSON.stringify(resolveStore(a.body.user.id)).includes('compute_lab'),
    false,
    'autosave must omit Lab state',
  );
  console.log('compute lab contract passed');
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(testDir, { recursive: true, force: true });
}
