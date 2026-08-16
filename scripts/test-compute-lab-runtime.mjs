/* Real Code Server integration: a loop trace is run through the runtime queue. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

process.env.NETCRAWL_BUNDLED = 'true';
const testDir = mkdtempSync(join(tmpdir(), 'netcrawl-compute-lab-runtime-'));
const workspace = resolve(process.env.NETCRAWL_WORKSPACE_DIR || '../netcrawl-workspace');
const candidateSdk = resolve('packages/sdk-python');
const uv = process.env.NETCRAWL_UV_BINARY || 'uv';
assert.equal(existsSync(workspace), true, `NETCRAWL_WORKSPACE_DIR must point to netcrawl-workspace: ${workspace}`);
const { startServer } = await import('../packages/server/.test-dist/index.js');
const { getGameState, saveGameState } = await import('../packages/server/.test-dist/domain/gameState.js');
const { claimCodeServerLease, releaseCodeServerLease } =
  await import('../packages/server/.test-dist/codeServerTracker.js');
const { acceptComputeLabFrame, createComputeLabRun, normalizeComputeLabFrame } =
  await import('../packages/server/.test-dist/computeLab.js');
const { registerWorkerClass } = await import('../packages/server/.test-dist/workerRegistry.js');
const { setQuestStatus } = await import('../packages/server/.test-dist/domain/questState.js');
const { server, port } = await startServer({ port: 0, dataDir: testDir });
const base = `http://127.0.0.1:${port}/api`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = async (path, body) => {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};

const contractRun = createComputeLabRun({
  nodeId: 'contract-node',
  taskId: 'contract-task',
  revision: 7,
  source: 'return 1',
  sessionId: 'contract-session',
});
const legacyFrame = acceptComputeLabFrame(contractRun.id, { sequence: 0, phase: 'eval', source: '1', value: 1 });
assert.equal(legacyFrame.ok, false);
assert.equal(legacyFrame.reason, 'invalid_trace_frame');
assert.equal(contractRun.status, 'runtime', 'an unsupported legacy frame terminates the run observably');
assert.deepEqual(contractRun.frames, [
  {
    sequence: 0,
    phase: 'error',
    error: { message: 'Unsupported trace frame received', kind: 'invalid_trace_frame' },
  },
]);
assert.equal(
  normalizeComputeLabFrame({
    sequence: 0,
    phase: 'control',
    control: {
      node_type: 'While',
      location: { lineno: 1, col_offset: 0, end_lineno: 1, end_col_offset: 8 },
      event: 'test',
    },
  }),
  undefined,
  'each control event requires its discriminated payload',
);
const routeContractRun = createComputeLabRun({
  nodeId: 'contract-node',
  taskId: 'contract-task',
  revision: 8,
  source: 'return 1',
  sessionId: 'contract-session',
});
const contractLease = claimCodeServerLease('contract-session');
assert.equal(contractLease.ok, true);
const legacyResponse = await request(`/runtime/compute-lab-runs/${routeContractRun.id}/events`, {
  sessionId: 'contract-session',
  frame: { sequence: 0, phase: 'eval', source: '1', value: 1 },
});
assert.equal(legacyResponse.status, 400);
assert.equal(legacyResponse.body.reason, 'invalid_trace_frame');
assert.equal(routeContractRun.status, 'runtime');

const createRouteContractRun = revision =>
  createComputeLabRun({
    nodeId: 'contract-node',
    taskId: 'contract-task',
    revision,
    source: 'return 1',
    sessionId: 'contract-session',
  });
const terminalEventRun = createRouteContractRun(9);
const terminalEventResponse = await request(`/runtime/compute-lab-runs/${terminalEventRun.id}/events`, {
  sessionId: 'contract-session',
  frame: { sequence: 0, phase: 'error', error: { message: 'runner error' } },
});
assert.equal(terminalEventResponse.status, 400);
assert.equal(terminalEventResponse.body.reason, 'invalid_trace_frame');
assert.equal(terminalEventRun.status, 'runtime');
assert.equal(terminalEventRun.frames.at(-1).error.kind, 'invalid_trace_frame');

const inconsistentCompletionRun = createRouteContractRun(10);
const inconsistentCompletionResponse = await request(
  `/runtime/compute-lab-runs/${inconsistentCompletionRun.id}/complete`,
  {
    sessionId: 'contract-session',
    status: 'trace_ready',
    frame: { sequence: 0, phase: 'error', error: { message: 'runner error' } },
  },
);
assert.equal(inconsistentCompletionResponse.status, 400);
assert.equal(inconsistentCompletionResponse.body.reason, 'invalid_trace_frame');
assert.equal(inconsistentCompletionRun.status, 'runtime');
assert.equal(inconsistentCompletionRun.frames.at(-1).error.kind, 'invalid_trace_frame');

const incompatibleCompletions = [
  { status: 'syntax' },
  { status: 'runtime', phase: 'limit' },
  { status: 'limit', phase: 'error' },
  { status: 'timeout', phase: 'error' },
];
for (const [index, completion] of incompatibleCompletions.entries()) {
  const run = createRouteContractRun(11 + index);
  const response = await request(`/runtime/compute-lab-runs/${run.id}/complete`, {
    sessionId: 'contract-session',
    status: completion.status,
    ...(completion.phase
      ? { frame: { sequence: 0, phase: completion.phase, error: { message: 'incompatible marker' } } }
      : {}),
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.reason, 'invalid_trace_frame');
  assert.equal(run.status, 'runtime');
  assert.equal(run.frames.at(-1).error.kind, 'invalid_trace_frame');
}

const legalCompletions = [
  { status: 'trace_ready' },
  { status: 'syntax', phase: 'error' },
  { status: 'runtime', phase: 'error' },
  { status: 'limit', phase: 'limit' },
  { status: 'timeout' },
];
for (const [index, completion] of legalCompletions.entries()) {
  const run = createRouteContractRun(20 + index);
  const response = await request(`/runtime/compute-lab-runs/${run.id}/complete`, {
    sessionId: 'contract-session',
    status: completion.status,
    ...(completion.phase
      ? { frame: { sequence: 0, phase: completion.phase, error: { message: `${completion.status} marker` } } }
      : {}),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(run.status, completion.status);
  assert.equal(run.frames.at(-1)?.phase, completion.phase);
}
assert.equal(releaseCodeServerLease('contract-session'), true);

const state = getGameState();
saveGameState({
  ...state,
  nodes: state.nodes.map(node => (node.id === 'e_op_add' ? { ...node, data: { ...node.data, unlocked: true } } : node)),
});
registerWorkerClass({
  class_id: 'plain',
  class_name: 'Plain',
  class_icon: 'Bot',
  fields: {},
  docstring: '',
  file: '',
  language: 'python',
});
registerWorkerClass({
  class_id: 'solver',
  class_name: 'Solver',
  class_icon: 'Bot',
  capabilities: ['compute_automation'],
  fields: {},
  docstring: '',
  file: '',
  language: 'python',
});
setQuestStatus('q_operators', 'available');

const runner = spawn(uv, ['run', 'main.py'], {
  cwd: workspace,
  env: {
    ...process.env,
    NETCRAWL_SERVER: `http://127.0.0.1:${port}`,
    PYTHONUNBUFFERED: '1',
    PYTHONPATH: [candidateSdk, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
  },
  stdio: 'ignore',
});
let runnerError;
runner.once('error', error => {
  runnerError = error;
});

let failure;
try {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(250);
    if (runnerError) throw runnerError;
    connected = (await request('/state')).body.codeServerConnected === true;
    if (connected) break;
  }
  assert.equal(connected, true, 'uv run main.py must register a live Code Server');

  const beforeDeploy = getGameState();
  const beforeLab = await request('/deploy', { nodeId: 'e_op_add', classId: 'solver' });
  assert.equal(beforeLab.status, 403);
  assert.equal(beforeLab.body.reason, 'compute_lab_required');
  assert.deepEqual(getGameState().flop, beforeDeploy.flop, 'lab gate must not allocate FLOP');
  assert.deepEqual(getGameState().inventory, beforeDeploy.inventory, 'lab gate must not mutate inventory');

  const task = await request('/compute-lab/tasks', { nodeId: 'e_op_add' });
  assert.equal(task.status, 200);
  assert.equal(typeof task.body.description, 'string');
  assert.ok(task.body.description.length > 0);
  assert.equal('hint' in task.body, false);
  assert.equal('answer' in task.body, false);
  assert.equal('op' in task.body, false);
  assert.match(task.body.description, /Sum two values by scanning a list/);
  assert.match(task.body.starterSource, /for value in nums/);
  assert.match(task.body.starterSource, /while index < len\(nums\) and nums\[index\] >= 0/);
  const source = task.body.starterSource;
  const started = await request('/compute-lab/runs', {
    nodeId: 'e_op_add',
    taskId: task.body.taskId,
    source,
    revision: 1,
  });
  assert.equal(started.status, 202);

  let snapshot;
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(250);
    snapshot = await request(`/compute-lab/runs/${started.body.runId}`);
    if (['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected'].includes(snapshot.body.run?.status))
      break;
  }
  assert.equal(snapshot.body.run.status, 'trace_ready', JSON.stringify(snapshot.body));
  const frames = snapshot.body.run.frames;
  assert.ok(frames.filter(frame => frame.phase === 'line').length >= 3, 'loop must emit line frames');
  assert.ok(
    frames.some(frame => frame.phase === 'eval'),
    'loop must emit an eval frame',
  );
  assert.ok(frames.some(frame => frame.phase === 'control' && frame.control?.node_type === 'For'));
  assert.ok(frames.some(frame => frame.phase === 'control' && frame.control?.node_type === 'While'));
  assert.ok(frames.some(frame => frame.phase === 'control' && frame.control?.node_type === 'If'));
  assert.ok(
    frames.some(frame => frame.phase === 'return'),
    'loop must emit a return frame',
  );
  assert.equal(frames[0].sequence, 0, 'replay starts at the first frame');
  assert.equal(frames.at(-1).sequence, frames.length - 1, 'replay can select the terminal frame');
  assert.equal(snapshot.body.run.returnValue, task.body.params.a + task.body.params.b);

  const waitForTerminal = async runId => {
    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(250);
      const next = await request(`/compute-lab/runs/${runId}`);
      if (['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected'].includes(next.body.run?.status))
        return next.body.run;
    }
    throw new Error(`run ${runId} did not finish`);
  };
  const invalid = await request('/compute-lab/runs', {
    nodeId: 'e_op_add',
    taskId: task.body.taskId,
    revision: 2,
    source: 'class ProblemSolver:\n    def solution(self, b, a):\n        return a + b\n',
  });
  assert.equal(invalid.status, 202);
  assert.equal(
    (await waitForTerminal(invalid.body.runId)).status,
    'syntax',
    'wrong parameter order fails before execution',
  );

  const loop = await request('/compute-lab/runs', {
    nodeId: 'e_op_add',
    taskId: task.body.taskId,
    revision: 3,
    source:
      'class ProblemSolver:\n    def solution(self, a, b):\n        total = 0\n        for i in range(1000):\n            total = total + i\n        return total\n',
  });
  assert.equal(loop.status, 202);
  const limited = await waitForTerminal(loop.body.runId);
  assert.equal(limited.status, 'limit');
  assert.equal(limited.frames.length, 1201, 'the terminal limit marker follows 1,200 execution events');
  assert.equal(limited.frames.at(-1).phase, 'limit');

  const submission = await request('/compute-lab/submissions', { taskId: task.body.taskId, runId: started.body.runId });
  assert.equal(submission.status, 200);
  assert.equal(submission.body.correct, true);
  assert.ok(submission.body.nodeSolveCount > 0, 'submission returns the updated node solve count');
  assert.deepEqual(
    submission.body.quest,
    { id: 'q_operators', current: 1, target: 1, completed: true },
    'submission returns the completed Operators quest snapshot',
  );

  const beforeCapability = getGameState();
  const wrongClass = await request('/deploy', { nodeId: 'e_op_add', classId: 'plain' });
  assert.equal(wrongClass.status, 403);
  assert.equal(wrongClass.body.reason, 'compute_worker_required');
  assert.deepEqual(getGameState().flop, beforeCapability.flop, 'capability gate must not allocate FLOP');
  assert.deepEqual(getGameState().inventory, beforeCapability.inventory, 'capability gate must not mutate inventory');

  const qualified = await request('/deploy', { nodeId: 'e_op_add', classId: 'solver' });
  assert.equal(qualified.status, 200, JSON.stringify(qualified.body));
  assert.equal(qualified.body.status, 'queued');
  console.log(`Compute Lab runtime integration passed (${frames.length} replayable frames)`);
} catch (error) {
  failure = error;
  console.error(error);
} finally {
  runner.kill('SIGTERM');
  await new Promise(resolve => server.close(resolve));
  rmSync(testDir, { recursive: true, force: true });
}

// The imported server owns game-tick and persistence intervals that are intentionally
// process-lifetime services in production. End this isolated integration process after cleanup.
process.exit(failure ? 1 : 0);
