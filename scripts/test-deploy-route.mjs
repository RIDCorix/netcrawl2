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
const { getGameState } = await import('../packages/server/.test-dist/domain/gameState.js');
const { getQuestSummary } = await import('../packages/server/.test-dist/quests.js');
const { incrementStat } = await import('../packages/server/.test-dist/domain/achievements.js');
const { setQuestStatus } = await import('../packages/server/.test-dist/domain/questState.js');
const { FLOP_COSTS } = await import('../packages/server/.test-dist/types.js');

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
      route: { type: 'route', field: 'route', description: 'Compute route' },
    },
  };
  assert.equal((await request('/api/worker-classes/register', tokenA, { classes: [workerClass] })).status, 200);
  assert.equal((await request('/api/worker-classes/register', tokenB, { classes: [workerClass] })).status, 200);

  // Real UI-shaped payload → per-user queue → ACK → authoritative action.
  const deployed = await request('/api/deploy', tokenA, {
    nodeId: 'hub', classId: 'miner_test', equippedItems: { mining_tool: 'pickaxe_basic' }, routes: { edge: 'e_hub_n1', route: ['e2', 'e20'] },
  });
  assert.equal(deployed.status, 200);
  const workerId = deployed.body.workerId;
  const queue = await request('/api/deploy-queue', tokenA);
  assert.equal(queue.body.requests.length, 1);
  assert.equal(queue.body.requests[0].injectedFields.mining_tool.itemType, 'pickaxe_basic');
  assert.deepEqual(queue.body.requests[0].injectedFields.route, ['e2', 'e20']);
  assert.deepEqual(queue.body.requests[0].injectedFields.__netcrawl_route_metadata__.route, [
    { id: 'e2', source: 'hub', target: 'ne_relay1' },
    { id: 'e20', source: 'ne_relay1', target: 'ne_comp1' },
  ]);
  assert.equal((await request('/api/deploy-queue', tokenB)).body.requests.length, 0, 'queue must be user-isolated');

  assert.equal((await request('/api/deploy-ack', tokenA, { workerId, pid: 4242 })).body.ok, true);
  let worker = getWorker(workerId, userA);
  assert.equal(worker?.status, 'running');
  assert.equal(worker?.equippedPickaxe?.itemType, 'pickaxe_basic');
  assert.equal(worker?.flopAllocated, true);
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
  const recoveryNode = getWorker(workerId, userA)?.current_node;
  assert.equal((await request('/api/worker/reset', tokenA, { workerId })).body.ok, true);
  assert.equal(getGameState(userA).flop.used, FLOP_COSTS.worker, 'running hot reload must retain its allocation');
  const reloadQueue = await request('/api/deploy-queue', tokenA);
  assert.equal(reloadQueue.body.requests.length, 1);
  assert.equal(reloadQueue.body.requests[0].workerId, workerId);
  assert.equal(reloadQueue.body.requests[0].nodeId, recoveryNode, 'hot reload must restart at the authoritative current node');
  assert.equal(getWorker(workerId, userA)?.current_node, recoveryNode, 'reset must not rewind persisted worker position');
  assert.equal(reloadQueue.body.requests[0].injectedFields.hot_tool.itemType, 'pickaxe_basic');
  assert.equal(reloadQueue.body.requests[0].injectedFields.mining_tool, undefined);
  assert.equal((await request('/api/deploy-ack', tokenA, { workerId, pid: 4244 })).body.ok, true);
  worker = getWorker(workerId, userA);
  assert.equal(worker?.equippedPickaxe?.itemType, 'pickaxe_basic');
  const movedHome = await request('/api/worker/action', tokenA, { workerId, action: 'move_edge', payload: { edgeId: 'e1' } });
  assert.equal(movedHome.body.ok, true);
  assert.equal(movedHome.body.from, 'n_relay1');
  assert.equal(movedHome.body.to, 'hub');
  assert.equal(getWorker(workerId, userA)?.current_node, 'hub');
  const movedBack = await request('/api/worker/action', tokenA, { workerId, action: 'move_edge', payload: { edgeId: 'e1' } });
  assert.equal(movedBack.body.ok, true);
  assert.equal(getWorker(workerId, userA)?.current_node, 'n_relay1');
  assert.equal((await request('/api/worker/action', tokenA, { workerId, action: 'mine', payload: {} })).body.ok, true);
  assert.equal(getPlayerInventory(userA).some(item => item.itemType === 'pickaxe_basic'), false);

  // Successful discard/deposit actions must update the same authenticated
  // user's quest objectives and never leak progress to another user.
  worker = getWorker(workerId, userA);
  upsertWorker({ ...worker, current_node: 'hub', holding: [{ type: 'bad_data', count: 7 }] }, userA);
  assert.equal((await request('/api/worker/action', tokenA, { workerId, action: 'discard', payload: {} })).body.ok, true);
  const progressRevisionBeforeDeposit = getQuestSummary(userA).progressRevision;
  upsertWorker({ ...getWorker(workerId, userA), holding: [{ type: 'data_fragment', count: 11 }] }, userA);
  assert.equal((await request('/api/worker/action', tokenA, { workerId, action: 'deposit', payload: {} })).body.ok, true);
  assert.notEqual(getQuestSummary(userA).progressRevision, progressRevisionBeforeDeposit, 'quest summary must invalidate cached UI progress after deposit');
  const userAQuests = (await request('/api/quests', tokenA)).body.quests;
  const userBQuests = (await request('/api/quests', tokenB)).body.quests;
  const conditionsA = userAQuests.find(quest => quest.id === 'q_conditions');
  const conditionsB = userBQuests.find(quest => quest.id === 'q_conditions');
  assert.equal(conditionsA.objectives.find(objective => objective.id === 'o1').current, 7);
  assert.equal(conditionsA.objectives.find(objective => objective.id === 'o2').current, 11);
  assert.equal(conditionsB.objectives.find(objective => objective.id === 'o1').current, 0);
  assert.equal(conditionsB.objectives.find(objective => objective.id === 'o2').current, 0);

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
    nodeId: 'hub', classId: 'miner_test', equippedItems: { hot_tool: 'shield' }, routes: { edge: 'e_hub_n1' },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'shield is not a valid Pickaxe');
  assert.equal(getPlayerInventory(userA).find(item => item.itemType === 'shield')?.count, 1);

  // Unique quest Pickaxes use the same catalog-backed authorization and stats as crafted tools.
  addToPlayerInventory('memory_allocator', 1, { efficiency: 3 }, userA);
  const uniqueDeploy = await request('/api/deploy', tokenA, {
    nodeId: 'hub', classId: 'miner_test', equippedItems: { hot_tool: 'memory_allocator' }, routes: { edge: 'e_hub_n1' },
  });
  assert.equal(uniqueDeploy.status, 200);
  const uniqueQueue = await request('/api/deploy-queue', tokenA);
  assert.equal(uniqueQueue.body.requests[0].injectedFields.hot_tool.itemType, 'memory_allocator');
  assert.equal(uniqueQueue.body.requests[0].injectedFields.hot_tool.efficiency, 3);
  assert.equal((await request('/api/deploy-ack', tokenA, { workerId: uniqueDeploy.body.workerId, pid: 4243 })).body.ok, true);
  assert.equal(getWorker(uniqueDeploy.body.workerId, userA)?.equippedPickaxe?.efficiency, 3);

  // A failed spawn releases exactly its own allocation; resetting that crash
  // reclaims once, and duplicate reset/ACK cannot change global ownership.
  addToPlayerInventory('pickaxe_iron', 1, undefined, userA);
  const failedDeploy = await request('/api/deploy', tokenA, {
    nodeId: 'hub', classId: 'miner_test', equippedItems: { hot_tool: 'pickaxe_iron' }, routes: { edge: 'e_hub_n1' },
  });
  assert.equal(failedDeploy.status, 200);
  const failedWorkerId = failedDeploy.body.workerId;
  const usedBeforeFailedAck = getGameState(userA).flop.used;
  assert.equal((await request('/api/deploy-ack', tokenA, { workerId: failedWorkerId, error: 'spawn failed' })).body.ok, true);
  assert.equal(getWorker(failedWorkerId, userA)?.status, 'crashed');
  assert.equal(getWorker(failedWorkerId, userA)?.flopAllocated, false);
  assert.equal(getGameState(userA).flop.used, usedBeforeFailedAck - FLOP_COSTS.worker);
  assert.equal((await request('/api/worker/reset', tokenA, { workerId: failedWorkerId })).body.ok, true);
  const usedAfterCrashReset = getGameState(userA).flop.used;
  assert.equal(getWorker(failedWorkerId, userA)?.flopAllocated, true);
  assert.equal((await request('/api/worker/reset', tokenA, { workerId: failedWorkerId })).body.ok, true);
  assert.equal(getGameState(userA).flop.used, usedAfterCrashReset, 'duplicate reset must not allocate twice');
  assert.equal((await request('/api/deploy-ack', tokenA, { workerId: failedWorkerId, pid: 4245 })).body.ok, true);
  assert.equal((await request('/api/deploy-ack', tokenA, { workerId: failedWorkerId, pid: 4245 })).body.duplicate, true);
  assert.equal(getGameState(userA).flop.used, usedAfterCrashReset, 'duplicate ACK must not alter allocation');

  // Fatal runtime errors retain the worker's explicit allocation, so recovery
  // does not double-count it even though status changes to error.
  assert.equal((await request('/api/worker/action', tokenA, {
    workerId: failedWorkerId, action: 'report_error', payload: { message: 'fatal test error' },
  })).body.ok, true);
  assert.equal(getWorker(failedWorkerId, userA)?.status, 'error');
  assert.equal(getWorker(failedWorkerId, userA)?.flopAllocated, true);
  const usedBeforeErrorReset = getGameState(userA).flop.used;
  assert.equal((await request('/api/worker/reset', tokenA, { workerId: failedWorkerId })).body.ok, true);
  assert.equal(getGameState(userA).flop.used, usedBeforeErrorReset);

  // Disconnect explicitly clears all ownership. Auto-resume then allocates
  // only suspended workers, once each.
  assert.equal((await request('/api/code-server/disconnect', tokenA, {})).body.ok, true);
  assert.equal(getGameState(userA).flop.used, 0);
  assert.equal(getWorker(workerId, userA)?.flopAllocated, false);
  assert.equal(getWorker(uniqueDeploy.body.workerId, userA)?.flopAllocated, false);
  const resumed = await request('/api/worker-classes/register', tokenA, { classes: [reloadedWorkerClass] });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.resumed, 3);
  assert.equal(getGameState(userA).flop.used, FLOP_COSTS.worker * 3);
  assert.equal(getWorker(workerId, userA)?.flopAllocated, true);
  assert.equal(getWorker(uniqueDeploy.body.workerId, userA)?.flopAllocated, true);

  // A suspend failure leaves ownership explicit; reset must retain rather than
  // infer from the suspended status and allocate again.
  await request('/api/deploy-queue', tokenA);
  assert.equal((await request('/api/deploy-ack', tokenA, { workerId, pid: 4246 })).body.ok, true);
  assert.equal((await request('/api/worker/suspend', tokenA, { workerId })).body.ok, true);
  assert.equal(getWorker(workerId, userA)?.status, 'suspended');
  assert.equal(getWorker(workerId, userA)?.flopAllocated, true);
  const usedBeforeSuspendedReset = getGameState(userA).flop.used;
  assert.equal((await request('/api/worker/reset', tokenA, { workerId })).body.ok, true);
  assert.equal(getGameState(userA).flop.used, usedBeforeSuspendedReset);

  // Allocation failure rolls back only the requesting worker and never
  // consumes or releases capacity owned by a second worker.
  assert.equal((await request('/api/code-server/disconnect', tokenA, {})).body.ok, true);
  getGameState(userA).flop.total = FLOP_COSTS.worker;
  assert.equal((await request('/api/worker/reset', tokenA, { workerId })).body.ok, true);
  assert.equal((await request('/api/worker/reset', tokenA, { workerId: uniqueDeploy.body.workerId })).status, 400);
  assert.equal(getGameState(userA).flop.used, FLOP_COSTS.worker);
  assert.equal(getWorker(workerId, userA)?.flopAllocated, true);
  assert.equal(getWorker(uniqueDeploy.body.workerId, userA)?.flopAllocated, false);

  // Claiming Operators must persist the reward and unlock While rather than
  // leaving the player with no active mainline quest.
  incrementStat('total_puzzles_solved', 1, userA);
  setQuestStatus('q_operators', 'completed', userA);
  const operatorsClaim = await request('/api/quests/q_operators/claim', tokenA, {});
  assert.equal(operatorsClaim.status, 200);
  const questsAfterOperators = (await request('/api/quests', tokenA)).body.quests;
  assert.equal(questsAfterOperators.find(q => q.id === 'q_operators').status, 'claimed');
  assert.equal(questsAfterOperators.find(q => q.id === 'q_while_loop').status, 'available');

  console.log('Deploy route integration: 93 assertions passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(testDir, { recursive: true, force: true });
  rmSync(join(process.cwd(), 'packages/server/.test-dist'), { recursive: true, force: true });
  process.exit(process.exitCode || 0);
}
