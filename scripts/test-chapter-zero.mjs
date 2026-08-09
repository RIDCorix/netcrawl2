import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
assert.equal(session.version, 4);
assert.deepEqual(session.world, {
  worker: { nodeId: 'hub', holding: [], equippedPickaxe: 'pickaxe_basic', lastLog: null },
  mine: { drops: [] },
  resources: { data: 0 },
  deployTutorial: {
    grantedItems: false,
    selectedEdgeId: null,
    selectedPickaxeType: null,
    helloWorkerId: null,
    minerWorkerId: null,
    minerCandidateWorkerId: null,
    minerLoopStep: 'awaiting_deploy',
    minerCompletedLoops: 0,
  },
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

// Advance through the two-phase deploy tutorial stages.
let deploySession = winRun.session;

// complete → HelloWorker preview → open → confirm → execute
const helloPreview = advanceChapterZeroStage(deploySession, 'hello_preview');
assert.equal(helloPreview.ok, true);
deploySession = helloPreview.session;
assert.equal(deploySession.stage, 'hello_preview');

const helloOpen = advanceChapterZeroStage(deploySession, 'hello_deploy_open');
assert.equal(helloOpen.ok, true);
deploySession = helloOpen.session;
const helloConfirm = advanceChapterZeroStage(deploySession, 'hello_deploy_confirm');
assert.equal(helloConfirm.ok, true);
deploySession = helloConfirm.session;
const helloExecute = advanceChapterZeroStage(deploySession, 'hello_deploy_execute');
assert.equal(helloExecute.ok, true);
deploySession = helloExecute.session;

// HelloWorker has no route or equipment prerequisites.
deploySession = setDeployTutorialField(deploySession, 'helloWorkerId', 'hello_worker_123');
const helloLog = advanceChapterZeroStage(deploySession, 'hello_log');
assert.equal(helloLog.ok, true);
deploySession = helloLog.session;
assert.equal(deploySession.stage, 'hello_log');

// The miner phase starts only after the Hello log checkpoint.
const minerPreview = advanceChapterZeroStage(deploySession, 'miner_preview');
assert.equal(minerPreview.ok, true);
deploySession = minerPreview.session;
assert.equal(deploySession.stage, 'miner_preview');

const minerOpen = advanceChapterZeroStage(deploySession, 'miner_deploy_open');
assert.equal(minerOpen.ok, true);
deploySession = minerOpen.session;
const edgeSelect = advanceChapterZeroStage(deploySession, 'miner_edge_select');
assert.equal(edgeSelect.ok, true);
deploySession = edgeSelect.session;

// Cannot advance to pickaxe_equip without a real edge selected.
const earlyPickaxe = advanceChapterZeroStage(deploySession, 'miner_pickaxe_equip');
assert.equal(earlyPickaxe.ok, false, 'must select edge before miner_pickaxe_equip');
assert.equal(earlyPickaxe.error, 'out_of_order');

// Set the edge, then advance to pickaxe_equip.
deploySession = setDeployTutorialField(deploySession, 'selectedEdgeId', 'e1');
const pickaxeEquip = advanceChapterZeroStage(deploySession, 'miner_pickaxe_equip');
assert.equal(pickaxeEquip.ok, true);
deploySession = pickaxeEquip.session;
assert.equal(deploySession.stage, 'miner_pickaxe_equip');

// Cannot advance to deploy_confirm without the basic pickaxe.
const earlyConfirm = advanceChapterZeroStage(deploySession, 'miner_deploy_confirm');
assert.equal(earlyConfirm.ok, false, 'must select pickaxe before miner_deploy_confirm');
assert.equal(earlyConfirm.error, 'out_of_order');

deploySession = setDeployTutorialField(deploySession, 'selectedPickaxeType', 'pickaxe_basic');
const minerConfirm = advanceChapterZeroStage(deploySession, 'miner_deploy_confirm');
assert.equal(minerConfirm.ok, true);
deploySession = minerConfirm.session;
const minerExecute = advanceChapterZeroStage(deploySession, 'miner_deploy_execute');
assert.equal(minerExecute.ok, true);
deploySession = minerExecute.session;

// Handoff is gated until the server records two verified miner loop cycles.
const earlyHandoff = advanceChapterZeroStage(deploySession, 'handoff');
assert.equal(earlyHandoff.ok, false, 'must verify the miner before handoff');
deploySession = setDeployTutorialField(deploySession, 'minerWorkerId', 'miner_worker_123');
const handoff = advanceChapterZeroStage(deploySession, 'handoff');
assert.equal(handoff.ok, true);
deploySession = handoff.session;
assert.equal(deploySession.stage, 'handoff');

// Gate is now open at handoff.
assert.equal(isChapterZeroGateOpen(deploySession), true, 'gate must open at handoff');

// Isolation — a different user's session was never touched.
assert.deepEqual(otherUserSession, createChapterZeroSession(), 'another user session remains isolated');

// Serialized reload preserves the gate.
const serialized = JSON.parse(JSON.stringify(deploySession));
assert.equal(isChapterZeroGateOpen(serialized), true);

// v3 migration: handoff remains complete, while complete and partial deploy
// saves restart only the mixed deployment tail at HelloWorker preview.
const legacyWorld = {
  worker: { nodeId: 'hub', holding: [], equippedPickaxe: 'pickaxe_basic', lastLog: null },
  mine: { drops: [] },
  resources: { data: 13 },
};
const legacyComplete = migrateChapterZeroSession({ version: 3, stage: 'complete', step: 0, world: legacyWorld, transition: null, transcript: [] });
assert.equal(legacyComplete.version, 4);
assert.equal(legacyComplete.stage, 'hello_preview', 'legacy complete saves must restart the deployment tail');
assert.equal(isChapterZeroGateOpen(legacyComplete), false);
const legacyPartial = migrateChapterZeroSession({ version: 3, stage: 'deploy_execute', step: 0, world: legacyWorld, transition: null, transcript: [] });
assert.equal(legacyPartial.stage, 'hello_preview');
const legacyHandoff = migrateChapterZeroSession({ version: 3, stage: 'handoff', step: 0, world: legacyWorld, transition: null, transcript: [] });
assert.equal(legacyHandoff.stage, 'handoff', 'legacy handoff saves must remain complete');
assert.equal(isChapterZeroGateOpen(legacyHandoff), true);

// A v4 save that only proved the old built-in tutorial worker must not become
// evidence for the real code-server Miner. Completed handoffs remain untouched.
const oldSyntheticCandidate = createChapterZeroSession();
oldSyntheticCandidate.stage = 'miner_deploy_execute';
oldSyntheticCandidate.world.deployTutorial.minerWorkerId = 'tutorial_miner_123';
const migratedSyntheticCandidate = migrateChapterZeroSession(oldSyntheticCandidate);
assert.equal(migratedSyntheticCandidate.stage, 'miner_preview');
assert.equal(migratedSyntheticCandidate.world.deployTutorial.minerWorkerId, null);
assert.equal(migratedSyntheticCandidate.world.deployTutorial.minerCandidateWorkerId, null);

// Miner retry owns only the tracked candidate. It returns its pickaxe/FLOP
// once, can be called again safely, and accepts a later candidate.
const retryDataDir = mkdtempSync(join(tmpdir(), 'netcrawl-chapter-zero-'));
const { setDataDir, initDb, resolveStore } = await import('../packages/server/.test-dist/store.js');
const { retryChapterZeroMiner } = await import('../packages/server/.test-dist/domain/questState.js');
setDataDir(retryDataDir);
initDb();
const retryStore = resolveStore();
const initialPickaxeCount = retryStore.game_state.playerInventory.find(item => item.itemType === 'pickaxe_basic')?.count || 0;
retryStore.quest_state.chapterZero = createChapterZeroSession();
retryStore.quest_state.chapterZero.stage = 'miner_deploy_execute';
retryStore.quest_state.chapterZero.world.deployTutorial.minerCandidateWorkerId = 'retry-candidate-1';
retryStore.quest_state.chapterZero.world.deployTutorial.minerLoopStep = 'collect';
retryStore.quest_state.chapterZero.world.deployTutorial.minerCompletedLoops = 1;
retryStore.game_state.flop.used = 8;
retryStore.workers['retry-candidate-1'] = {
  id: 'retry-candidate-1', node_id: 'hub', current_node: 'mine', class_name: 'Miner', class_icon: 'Pickaxe',
  commit_hash: 'test', status: 'crashed', pid: null, carrying: {}, holding: [], flopAllocated: true,
  equippedPickaxe: { itemType: 'pickaxe_basic', efficiency: 1 }, equippedCpu: null, equippedRam: null,
  deployed_at: new Date().toISOString(), deployConfig: { classId: 'miner', equippedItems: {}, injectedFields: {} },
};
const retried = retryChapterZeroMiner();
assert.equal(retried.ok, true);
assert.equal(retryStore.quest_state.chapterZero.stage, 'miner_preview');
assert.equal(retryStore.quest_state.chapterZero.world.deployTutorial.minerCandidateWorkerId, null);
assert.equal(retryStore.quest_state.chapterZero.world.deployTutorial.minerCompletedLoops, 0);
assert.equal(retryStore.workers['retry-candidate-1'], undefined);
assert.equal(retryStore.game_state.flop.used, 0);
assert.equal(retryStore.game_state.playerInventory.find(item => item.itemType === 'pickaxe_basic')?.count, initialPickaxeCount + 1);
const idempotentRetry = retryChapterZeroMiner();
assert.equal(idempotentRetry.ok, true);
assert.equal(idempotentRetry.alreadyReset, true);
assert.equal(retryStore.game_state.playerInventory.find(item => item.itemType === 'pickaxe_basic')?.count, initialPickaxeCount + 1);
retryStore.quest_state.chapterZero.stage = 'miner_deploy_execute';
retryStore.quest_state.chapterZero.world.deployTutorial.minerCandidateWorkerId = 'retry-candidate-2';
retryStore.game_state.flop.used = 8;
retryStore.workers['retry-candidate-2'] = {
  id: 'retry-candidate-2', node_id: 'hub', current_node: 'mine', class_name: 'Miner', class_icon: 'Pickaxe',
  commit_hash: 'test', status: 'error', pid: null, carrying: {}, holding: [], flopAllocated: true,
  equippedPickaxe: { itemType: 'pickaxe_basic', efficiency: 1 }, equippedCpu: null, equippedRam: null,
  deployed_at: new Date().toISOString(), deployConfig: { classId: 'miner', equippedItems: {}, injectedFields: {} },
};
const secondCandidateRetry = retryChapterZeroMiner();
assert.equal(secondCandidateRetry.ok, true);
assert.equal(retryStore.workers['retry-candidate-2'], undefined);
assert.equal(retryStore.game_state.flop.used, 0);
assert.equal(retryStore.game_state.playerInventory.find(item => item.itemType === 'pickaxe_basic')?.count, initialPickaxeCount + 2);
rmSync(retryDataDir, { recursive: true, force: true });

console.log('Chapter Zero v4 stage/migration/deploy transitions passed');
process.exit(0);
