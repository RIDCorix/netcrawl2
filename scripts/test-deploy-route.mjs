/* global console, fetch, process */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NETCRAWL_MULTI_USER = 'true';
process.env.JWT_SECRET = 'deploy-route-test-secret';
process.env.NETCRAWL_BUNDLED = 'true';

const testDir = mkdtempSync(join(tmpdir(), 'netcrawl-deploy-route-'));
const { startServer } = await import('../packages/server/.test-dist/index.js');
const { getWorker, upsertWorker } = await import('../packages/server/.test-dist/domain/workers.js');
const { addToPlayerInventory, getPlayerInventory } = await import('../packages/server/.test-dist/domain/inventory.js');

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

try {
  const registrationA = await request('/api/auth/register', '', {
    email: 'deploy-a@example.test', password: 'password-a', displayName: 'Deploy A',
  });
  const registrationB = await request('/api/auth/register', '', {
    email: 'deploy-b@example.test', password: 'password-b', displayName: 'Deploy B',
  });
  assert.equal(registrationA.status, 201);
  assert.equal(registrationB.status, 201);
  const tokenA = registrationA.body.token;
  const tokenB = registrationB.body.token;
  const userA = registrationA.body.user.id;
  const userB = registrationB.body.user.id;

  const workerClass = {
    class_id: 'miner_test', class_name: 'MinerTest', class_icon: 'Pickaxe', file: 'miner.py', language: 'python',
    fields: {
      mining_tool: { type: 'item', field: 'mining_tool', item_type: 'Pickaxe', description: 'Pickaxe' },
      edge: { type: 'edge', field: 'edge', description: 'Mine edge' },
    },
  };
  assert.equal((await request('/api/worker-classes/register', tokenA, { classes: [workerClass] })).status, 200);
  assert.equal((await request('/api/worker-classes/register', tokenB, { classes: [workerClass] })).status, 200);

  // Real UI-shaped payload → per-user queue → ACK → authoritative action.
  const deployed = await request('/api/deploy', tokenA, {
    nodeId: 'hub', classId: 'miner_test', equippedItems: { mining_tool: 'pickaxe_basic' }, routes: { edge: 'e_hub_n1' },
  });
  assert.equal(deployed.status, 200);
  const workerId = deployed.body.workerId;
  const queue = await request('/api/deploy-queue', tokenA);
  assert.equal(queue.body.requests.length, 1);
  assert.equal(queue.body.requests[0].injectedFields.mining_tool.itemType, 'pickaxe_basic');
  assert.equal((await request('/api/deploy-queue', tokenB)).body.requests.length, 0, 'queue must be user-isolated');

  assert.equal((await request('/api/deploy-ack', tokenA, { workerId, pid: 4242 })).body.ok, true);
  let worker = getWorker(workerId, userA);
  assert.equal(worker?.status, 'running');
  assert.equal(worker?.equippedPickaxe?.itemType, 'pickaxe_basic');
  assert.equal(getWorker(workerId, userB), null, 'worker row must be user-isolated');

  // Place the worker on the unlocked mine, then execute the real action route.
  upsertWorker({ ...worker, current_node: 'n_relay1' }, userA);
  const mined = await request('/api/worker/action', tokenA, { workerId, action: 'mine', payload: {} });
  assert.equal(mined.body.ok, true);
  assert.equal(getWorker(workerId, userA)?.equippedPickaxe?.itemType, 'pickaxe_basic');
  assert.equal((await request('/api/worker/action', tokenB, { workerId, action: 'mine', payload: {} })).body.error, 'Worker not found');

  // A class edit/hot reload keeps authoritative equipment and injects it under
  // the current schema field name before the same worker is spawned again.
  const reloadedWorkerClass = {
    ...workerClass,
    fields: {
      hot_tool: { type: 'item', field: 'hot_tool', item_type: 'Pickaxe', description: 'Reloaded Pickaxe' },
      edge: workerClass.fields.edge,
    },
  };
  assert.equal((await request('/api/worker-classes/register', tokenA, { classes: [reloadedWorkerClass] })).status, 200);
  assert.equal((await request('/api/worker/reset', tokenA, { workerId })).body.ok, true);
  const reloadQueue = await request('/api/deploy-queue', tokenA);
  assert.equal(reloadQueue.body.requests.length, 1);
  assert.equal(reloadQueue.body.requests[0].workerId, workerId);
  assert.equal(reloadQueue.body.requests[0].injectedFields.hot_tool.itemType, 'pickaxe_basic');
  assert.equal(reloadQueue.body.requests[0].injectedFields.mining_tool, undefined);
  assert.equal((await request('/api/deploy-ack', tokenA, { workerId, pid: 4244 })).body.ok, true);
  worker = getWorker(workerId, userA);
  assert.equal(worker?.equippedPickaxe?.itemType, 'pickaxe_basic');
  upsertWorker({ ...worker, current_node: 'n_relay1' }, userA);
  assert.equal((await request('/api/worker/action', tokenA, { workerId, action: 'mine', payload: {} })).body.ok, true);
  assert.equal(getPlayerInventory(userA).some(item => item.itemType === 'pickaxe_basic'), false);

  // A late failure ACK cannot crash the live worker, restore inventory, or release ownership.
  const staleFailure = await request('/api/deploy-ack', tokenA, { workerId, error: 'late failure' });
  assert.equal(staleFailure.body.duplicate, true);
  worker = getWorker(workerId, userA);
  assert.equal(worker?.status, 'running');
  assert.equal(worker?.equippedPickaxe?.itemType, 'pickaxe_basic');
  assert.equal(getPlayerInventory(userA).some(item => item.itemType === 'pickaxe_basic'), false);

  // Crafted payloads cannot authorize mining with a non-Pickaxe inventory item.
  addToPlayerInventory('shield', 1, undefined, userA);
  const invalid = await request('/api/deploy', tokenA, {
    nodeId: 'hub', classId: 'miner_test', equippedItems: { mining_tool: 'shield' }, routes: { edge: 'e_hub_n1' },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'shield is not a valid Pickaxe');
  assert.equal(getPlayerInventory(userA).find(item => item.itemType === 'shield')?.count, 1);

  // Unique quest Pickaxes use the same catalog-backed authorization and stats as crafted tools.
  addToPlayerInventory('memory_allocator', 1, { efficiency: 3 }, userA);
  const uniqueDeploy = await request('/api/deploy', tokenA, {
    nodeId: 'hub', classId: 'miner_test', equippedItems: { mining_tool: 'memory_allocator' }, routes: { edge: 'e_hub_n1' },
  });
  assert.equal(uniqueDeploy.status, 200);
  const uniqueQueue = await request('/api/deploy-queue', tokenA);
  assert.equal(uniqueQueue.body.requests[0].injectedFields.mining_tool.itemType, 'memory_allocator');
  assert.equal(uniqueQueue.body.requests[0].injectedFields.mining_tool.efficiency, 3);
  assert.equal((await request('/api/deploy-ack', tokenA, { workerId: uniqueDeploy.body.workerId, pid: 4243 })).body.ok, true);
  assert.equal(getWorker(uniqueDeploy.body.workerId, userA)?.equippedPickaxe?.efficiency, 3);

  console.log('Deploy route integration: 40 assertions passed');
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(testDir, { recursive: true, force: true });
  rmSync(join(process.cwd(), 'packages/server/.test-dist'), { recursive: true, force: true });
  process.exit(0);
}
