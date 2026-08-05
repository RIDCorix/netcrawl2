import assert from 'node:assert/strict';
import {
  createChapterZeroSession,
  applyChapterZeroCommand,
  isChapterZeroGateOpen,
  shouldBypassChapterZero,
} from '../packages/server/.test-dist/domain/chapterZero.js';

let session = createChapterZeroSession();
assert.equal(isChapterZeroGateOpen(session), false, 'clean saves must remain gated');
assert.equal(shouldBypassChapterZero({ q_setup: 'available' }), false, 'availability alone is not legacy completion');
assert.equal(shouldBypassChapterZero({ q_setup: 'claimed' }), true, 'claimed legacy saves bypass onboarding');
assert.equal(shouldBypassChapterZero({ q_setup: 'completed' }), true, 'completed legacy saves bypass onboarding');
assert.deepEqual(session.world, {
  worker: { nodeId: 'hub', holding: [], equippedPickaxe: 'pickaxe_basic', lastLog: null },
  mine: { drops: [] },
  resources: { data: 0 },
});

const rejected = applyChapterZeroCommand(session, 'mine()');
assert.equal(rejected.ok, false);
assert.equal(rejected.error, 'out_of_order');
assert.deepEqual(rejected.session, session, 'wrong-order input must not mutate the session');

const commands = ['info()', 'move("mine")', 'mine()', 'collect()', 'move("hub")', 'deposit()'];
const assertions = [
  next => assert.equal(next.world.worker.lastLog, 'Worker ready'),
  next => assert.equal(next.world.worker.nodeId, 'mine'),
  next => assert.deepEqual(next.world.mine.drops, [{ type: 'data_fragment', count: 10 }]),
  next => {
    assert.deepEqual(next.world.mine.drops, []);
    assert.deepEqual(next.world.worker.holding, [{ type: 'data_fragment', count: 10 }]);
  },
  next => assert.equal(next.world.worker.nodeId, 'hub'),
  next => {
    assert.deepEqual(next.world.worker.holding, []);
    assert.equal(next.world.resources.data, 10);
    assert.equal(next.completed, true);
  },
];

for (let i = 0; i < commands.length; i++) {
  const result = applyChapterZeroCommand(session, commands[i]);
  assert.equal(result.ok, true);
  session = result.session;
  assert.equal(session.step, i + 1);
  assertions[i](session);

  // Serialized state is the reload contract.
  session = JSON.parse(JSON.stringify(session));
  assert.equal(isChapterZeroGateOpen(session), i === commands.length - 1, 'serialized reload must preserve the gate');
}

const completedReplay = applyChapterZeroCommand(session, 'deposit()');
assert.equal(completedReplay.ok, true);
assert.deepEqual(completedReplay.session, session, 'completed replay must be idempotent');

console.log('Chapter Zero behavioral transitions passed');
