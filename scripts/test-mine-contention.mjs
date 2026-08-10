/* global console, fetch, process */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NETCRAWL_MULTI_USER = 'true';
process.env.JWT_SECRET = 'mine-contention-test-secret';
process.env.NETCRAWL_BUNDLED = 'true';

const testDir = mkdtempSync(join(tmpdir(), 'netcrawl-mine-contention-'));
const { startServer } = await import('../packages/server/.test-dist/index.js');
const { getGameState, saveGameState } = await import('../packages/server/.test-dist/domain/gameState.js');
const { upsertWorker } = await import('../packages/server/.test-dist/domain/workers.js');
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

function configureMine(userId, data, refillRate) {
  const state = getGameState(userId);
  const mine = state.nodes.find(node => node.id === 'n_relay1');
  mine.data = {
    ...mine.data,
    unlocked: true,
    data,
    maxDataBuffer: 3,
    dataRefillRate: refillRate,
    rate: 3,
  };
  saveGameState(state, userId);
}

function addMiner(workerId, userId) {
  upsertWorker({
    id: workerId,
    status: 'running',
    current_node: 'n_relay1',
    node_id: 'n_relay1',
    equippedPickaxe: { itemType: 'pickaxe_basic', efficiency: 1 },
  }, userId);
}

try {
  const registrationA = await request('/api/auth/register', '', {
    email: 'queue-a@example.test', password: 'password-a', displayName: 'Queue A',
  });
  const registrationB = await request('/api/auth/register', '', {
    email: 'queue-b@example.test', password: 'password-b', displayName: 'Queue B',
  });
  assert.equal(registrationA.status, 201);
  assert.equal(registrationB.status, 201);
  const { token: tokenA, user: { id: userA } } = registrationA.body;
  const { token: tokenB, user: { id: userB } } = registrationB.body;
  assert.equal((await request('/api/state', tokenA)).status, 200);
  assert.equal((await request('/api/state', tokenB)).status, 200);

  configureMine(userA, 0, 1);
  configureMine(userB, 3, 1);
  const workerIds = ['mine-1', 'mine-2', 'mine-3', 'mine-4'];
  workerIds.forEach(workerId => addMiner(workerId, userA));
  addMiner('other-user-miner', userB);

  const completionOrder = [];
  const startedAt = Date.now();
  const mineResults = workerIds.map((workerId, index) =>
    request('/api/worker/action', tokenA, { workerId, action: 'mine', payload: {} }).then(result => {
      completionOrder.push(index);
      return result;
    }),
  );
  const otherUserResult = request('/api/worker/action', tokenB, {
    workerId: 'other-user-miner', action: 'mine', payload: {},
  });

  const [results, isolated] = await Promise.all([Promise.all(mineResults), otherUserResult]);
  const elapsed = Date.now() - startedAt;
  assert.ok(results.every(result => result.status === 200 && result.body.ok), JSON.stringify(results));
  assert.equal(isolated.status, 200);
  assert.equal(isolated.body.ok, true, JSON.stringify(isolated.body));
  assert.deepEqual(completionOrder, [0, 1, 2, 3], 'same-user miners finish in admission order');
  assert.ok(elapsed > 10000, `four miners should include a legitimate long wait, got ${elapsed}ms`);

  const stateAfterContention = getGameState(userA);
  const mineAfterContention = stateAfterContention.nodes.find(node => node.id === 'n_relay1');
  assert.equal(mineAfterContention.data.mineCount, 4);
  const yielded = results.reduce((total, result) => total + result.body.item.count, 0);
  assert.equal(mineAfterContention.data.items.reduce((total, item) => total + item.count, 0), yielded);

  configureMine(userA, 0, 1);
  addMiner('interrupted', userA);
  addMiner('successor', userA);
  const interrupted = request('/api/worker/action', tokenA, { workerId: 'interrupted', action: 'mine', payload: {} });
  await new Promise(resolve => setTimeout(resolve, 50));
  const successor = request('/api/worker/action', tokenA, { workerId: 'successor', action: 'mine', payload: {} });
  await new Promise(resolve => setTimeout(resolve, 50));
  upsertWorker({
    id: 'interrupted', status: 'suspended', current_node: 'n_relay1', node_id: 'n_relay1',
    equippedPickaxe: { itemType: 'pickaxe_basic', efficiency: 1 },
  }, userA);
  assert.equal((await interrupted).body.error, 'Mining interrupted');
  assert.equal((await successor).body.ok, true, 'a removed queue entry cannot pin its successor');

  console.log('Mine contention regression: 17 assertions passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(testDir, { recursive: true, force: true });
  rmSync(join(process.cwd(), 'packages/server/.test-dist'), { recursive: true, force: true });
  process.exit(process.exitCode || 0);
}
