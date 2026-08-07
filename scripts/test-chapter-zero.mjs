import assert from 'node:assert/strict';
import {
  createChapterZeroSession,
  advanceChapterZeroStage,
  applyChapterZeroCommand,
  runChapterZeroSandbox,
  isChapterZeroGateOpen,
  shouldBypassChapterZero,
  expectedCommand,
  migrateChapterZeroSession,
  setDeployTutorialField,
} from '../packages/server/.test-dist/domain/chapterZero.js';

let session = createChapterZeroSession();
const otherUserSession = createChapterZeroSession();
assert.equal(isChapterZeroGateOpen(session), false, 'clean saves must remain gated');
assert.equal(shouldBypassChapterZero({ q_setup: 'available' }), false, 'availability alone is not legacy completion');
assert.equal(shouldBypassChapterZero({ q_setup: 'claimed' }), true, 'claimed legacy saves bypass onboarding');
assert.equal(shouldBypassChapterZero({ q_setup: 'completed' }), true, 'completed legacy saves bypass onboarding');
assert.equal(session.stage, 'cold_open');
assert.equal(session.version, 3);
assert.deepEqual(session.world, {
  worker: { nodeId: 'hub', holding: [], equippedPickaxe: 'pickaxe_basic', lastLog: null },
  mine: { drops: [] },
  resources: { data: 0 },
  deployTutorial: { grantedItems: false, selectedEdgeId: null, selectedPickaxeType: null, workerId: null },
});
assert.equal(expectedCommand(session), null, 'no command expected during cold_open');

// Commands are gated to their stage.
const preInfo = applyChapterZeroCommand(session, 'self.info()');
assert.equal(preInfo.ok, false, 'self.info() must be gated to choice_intro');
assert.equal(preInfo.error, 'out_of_order');

// Advance cold_open → voice_arrival → choice_intro.
session = advanceChapterZeroStage(session, 'voice_arrival').session;
assert.equal(session.stage, 'voice_arrival');
session = advanceChapterZeroStage(session, 'choice_intro').session;
assert.equal(session.stage, 'choice_intro');
assert.equal(expectedCommand(session), 'self.info()');

// self.info() from choice_intro records worker_ready.
const afterInfo = applyChapterZeroCommand(session, 'self.info()');
assert.equal(afterInfo.ok, true);
session = afterInfo.session;
assert.equal(session.world.worker.lastLog, 'worker_ready');
assert.equal(session.transition, 'logged_ready');
assert.equal(session.step, 1);

// Advance to direct_commands — server seeds the mine drops.
session = advanceChapterZeroStage(session, 'direct_commands').session;
assert.equal(session.stage, 'direct_commands');
assert.deepEqual(session.world.mine.drops, [{ type: 'data_fragment', count: 3 }]);
assert.equal(expectedCommand(session), 'self.move(self.edge)');

// self.move(self.edge) — hub → mine.
session = applyChapterZeroCommand(session, 'self.move(self.edge)').session;
assert.equal(session.world.worker.nodeId, 'mine');
assert.equal(session.transition, 'moved_to_mine');
assert.equal(expectedCommand(session), 'self.collect()');

// self.collect() — pick up fragments.
session = applyChapterZeroCommand(session, 'self.collect()').session;
assert.equal(session.world.worker.holding.length, 1);
assert.equal(session.world.worker.holding[0].count, 3);
assert.equal(session.world.mine.drops.length, 0);

// Cannot skip straight to complete.
const badJump = advanceChapterZeroStage(session, 'complete');
assert.equal(badJump.ok, false, 'complete must be reached through code_editor + sandbox pass');

// Advance to code_editor legitimately.
session = advanceChapterZeroStage(session, 'code_editor').session;
assert.equal(session.stage, 'code_editor');

// Empty sandbox — worker never leaves the mine; must be classified as stuck_at_mine
// so the narrator says "still at the mine" rather than the misleading "you got back but…".
const stuckRun = runChapterZeroSandbox(session, 'pass', 'pass');
assert.equal(stuckRun.passed, false);
assert.equal(stuckRun.failureReason, 'stuck_at_mine');

// Move once but never deposit — worker reaches hub but keeps holding, so classify as no_deposit.
const noDepositRun = runChapterZeroSandbox(session, 'self.move(self.edge)', 'pass');
assert.equal(noDepositRun.passed, false);
assert.equal(noDepositRun.failureReason, 'no_deposit');

// Loop code is rejected until the startup checkpoint is complete.
const earlyLoop = runChapterZeroSandbox(session, 'pass', 'self.move(self.edge)');
assert.equal(earlyLoop.passed, false);
assert.equal(earlyLoop.failureReason, 'syntax');

// First checkpoint: two startup statements return and deposit the first haul.
const startupRun = runChapterZeroSandbox(session, 'self.move(self.edge)\nself.deposit()', 'pass');
assert.equal(startupRun.passed, false);
assert.equal(startupRun.failureReason, null);
assert.equal(startupRun.session.step, 1);
assert.equal(startupRun.session.world.resources.data, 3);
assert.equal(startupRun.session.world.mine.drops[0].count, 10);

// Second checkpoint: the newly unlocked loop collects and deposits ten fragments.
const winRun = runChapterZeroSandbox(
  startupRun.session,
  'pass',
  'self.move(self.edge)\nself.collect()\nself.move(self.edge)\nself.deposit()',
);
assert.equal(winRun.passed, true);
assert.equal(winRun.session.stage, 'complete');
assert.equal(winRun.session.world.worker.nodeId, 'hub');
assert.equal(winRun.session.world.worker.holding.length, 0);
assert.equal(winRun.session.world.resources.data, 13);
// After fragment tutorial passes, stage is 'complete' (internal milestone, gate NOT open yet)
assert.equal(winRun.session.stage, 'complete');
assert.equal(isChapterZeroGateOpen(winRun.session), false, 'gate must stay closed at complete — deploy tutorial required');

// Advance through deploy tutorial stages
let deploySession = winRun.session;

// complete → edge_select
const esResult = advanceChapterZeroStage(deploySession, 'edge_select');
assert.equal(esResult.ok, true);
deploySession = esResult.session;
assert.equal(deploySession.stage, 'edge_select');

// Cannot advance to pickaxe_equip without an edge selected
const earlyPickaxe = advanceChapterZeroStage(deploySession, 'pickaxe_equip');
assert.equal(earlyPickaxe.ok, false, 'must select edge before pickaxe_equip');
assert.equal(earlyPickaxe.error, 'out_of_order');

// Set the edge, then advance
deploySession = setDeployTutorialField(deploySession, 'selectedEdgeId', 'e1');
const peResult = advanceChapterZeroStage(deploySession, 'pickaxe_equip');
assert.equal(peResult.ok, true);
deploySession = peResult.session;
assert.equal(deploySession.stage, 'pickaxe_equip');

// Cannot advance to deploy_confirm without a pickaxe selected
const earlyConfirm = advanceChapterZeroStage(deploySession, 'deploy_confirm');
assert.equal(earlyConfirm.ok, false, 'must select pickaxe before deploy_confirm');

// Set the pickaxe, then advance
deploySession = setDeployTutorialField(deploySession, 'selectedPickaxeType', 'pickaxe_basic');
const dcResult = advanceChapterZeroStage(deploySession, 'deploy_confirm');
assert.equal(dcResult.ok, true);
deploySession = dcResult.session;

// deploy_confirm → deploy_execute
const dxResult = advanceChapterZeroStage(deploySession, 'deploy_execute');
assert.equal(dxResult.ok, true);
deploySession = dxResult.session;

// Cannot advance to deploy_verified without a workerId
const earlyVerified = advanceChapterZeroStage(deploySession, 'deploy_verified');
assert.equal(earlyVerified.ok, false, 'must have workerId before deploy_verified');

// Set workerId, then advance to deploy_verified
deploySession = setDeployTutorialField(deploySession, 'workerId', 'worker_test_123');
const dvResult = advanceChapterZeroStage(deploySession, 'deploy_verified');
assert.equal(dvResult.ok, true);
deploySession = dvResult.session;

// deploy_verified → handoff
const hoResult = advanceChapterZeroStage(deploySession, 'handoff');
assert.equal(hoResult.ok, true);
deploySession = hoResult.session;
assert.equal(deploySession.stage, 'handoff');

// Gate is now open at handoff
assert.equal(isChapterZeroGateOpen(deploySession), true, 'gate must open at handoff');

// Isolation — a different user's session was never touched.
assert.deepEqual(otherUserSession, createChapterZeroSession(), 'another user session remains isolated');

// Serialized reload preserves the gate.
const serialized = JSON.parse(JSON.stringify(deploySession));
assert.equal(isChapterZeroGateOpen(serialized), true);

// Migration: legacy save at 'complete' without deployTutorial → migrates to 'handoff'
const legacySession = { version: 3, stage: 'complete', step: 0, world: { worker: { nodeId: 'hub', holding: [], equippedPickaxe: 'pickaxe_basic', lastLog: null }, mine: { drops: [] }, resources: { data: 13 } }, transition: null, transcript: [] };
const migrated = migrateChapterZeroSession(legacySession);
assert.equal(migrated.stage, 'handoff', 'legacy complete saves must migrate to handoff');
assert.equal(isChapterZeroGateOpen(migrated), true, 'migrated legacy saves must have gate open');

console.log('Chapter Zero v3 stage/command/sandbox/deploy transitions passed');
