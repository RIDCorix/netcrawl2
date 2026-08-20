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
const { TRACE_LIMITS, acceptComputeLabFrame, createComputeLabRun, normalizeComputeLabFrame } =
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
    kind: 'error',
    error: { message: 'Unsupported trace frame received', kind: 'invalid_trace_frame' },
  },
]);

// The normalizer's one job: fail closed on a malformed shape, stay open to an
// unfamiliar step. A construct nobody wrote a rule for must reach the player.
const located = { lineno: 1, col_offset: 0, end_lineno: 1, end_col_offset: 8 };
for (const [reason, malformed] of [
  ['a step must say what it did', { sequence: 0, source: 'x' }],
  ['a range with no segment cannot be shown', { sequence: 0, kind: 'value', location: located }],
  ['a segment with no range cannot be highlighted', { sequence: 0, kind: 'value', source: 'x' }],
  ['an inverted range is not a range', {
    sequence: 0,
    kind: 'value',
    source: 'x',
    location: { lineno: 3, col_offset: 4, end_lineno: 1, end_col_offset: 0 },
  }],
  ['only a terminal step carries an error', { sequence: 0, kind: 'value', error: { message: 'no' } }],
  ['an unknown property is a protocol change, not a new construct', {
    sequence: 0,
    kind: 'value',
    phase: 'eval',
  }],
  ['a call chain entry is a named call or a count, never both and never neither', {
    sequence: 0,
    kind: 'value',
    source: 'x',
    location: located,
    stack: [{ source: 'def f():', hidden: 2 }],
  }],
  ['a chain with no entries is not a chain', { sequence: 0, kind: 'value', source: 'x', location: located, stack: [] }],
  ['a collapsed entry stands for more than one call', {
    sequence: 0,
    kind: 'value',
    source: 'x',
    location: located,
    stack: [{ source: 'def f():', count: 1 }],
  }],
])
  assert.equal(normalizeComputeLabFrame(malformed), undefined, reason);

// A deeper chain than this build renders is unfamiliar, not malformed, so it
// must not cost the player the frame; only its bytes are bounded.
const deepChain = normalizeComputeLabFrame({
  sequence: 0,
  kind: 'value',
  source: 'x',
  location: located,
  stack: Array.from({ length: 20 }, (_, index) => ({ source: `def f${index}():`, line: index + 1 })),
});
assert.equal(deepChain?.stack?.length, 20, 'a longer chain than the runner sends today still reaches the screen');
const fatChain = normalizeComputeLabFrame({
  sequence: 0,
  kind: 'value',
  source: 'x',
  location: located,
  stack: [{ source: 'z'.repeat(TRACE_LIMITS.maxValueBytes + 1) }, { source: 'def f():' }],
});
assert.deepEqual(fatChain?.stack, [{ hidden: 2 }], 'over budget, the chain becomes the one fact that still fits');
const unfamiliar = normalizeComputeLabFrame({
  sequence: 0,
  kind: 'transacted',
  line: 1,
  source: 'x',
  location: located,
  detail: { ledger: 'unfamiliar' },
  value: 7,
});
assert.equal(unfamiliar?.kind, 'transacted', 'a step this build has never heard of is accepted, not fatal');
assert.deepEqual(unfamiliar?.detail, { ledger: 'unfamiliar' });

// TRACE_LIMITS.maxValueBytes was declared and never enforced. An oversized open
// payload is truncated rather than costing the player the whole run.
const oversized = normalizeComputeLabFrame({
  sequence: 0,
  kind: 'value',
  source: 'x',
  location: located,
  value: 'y'.repeat(TRACE_LIMITS.maxValueBytes + 1),
});
assert.deepEqual(oversized?.value, { truncated: true, reason: 'max_bytes' });
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
  frame: { sequence: 0, kind: 'error', error: { message: 'runner error' } },
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
    frame: { sequence: 0, kind: 'error', error: { message: 'runner error' } },
  },
);
assert.equal(inconsistentCompletionResponse.status, 400);
assert.equal(inconsistentCompletionResponse.body.reason, 'invalid_trace_frame');
assert.equal(inconsistentCompletionRun.status, 'runtime');
assert.equal(inconsistentCompletionRun.frames.at(-1).error.kind, 'invalid_trace_frame');

const incompatibleCompletions = [
  { status: 'syntax' },
  { status: 'runtime', kind: 'limit' },
  { status: 'limit', kind: 'error' },
  { status: 'timeout', kind: 'error' },
];
for (const [index, completion] of incompatibleCompletions.entries()) {
  const run = createRouteContractRun(11 + index);
  const response = await request(`/runtime/compute-lab-runs/${run.id}/complete`, {
    sessionId: 'contract-session',
    status: completion.status,
    ...(completion.kind
      ? { frame: { sequence: 0, kind: completion.kind, error: { message: 'incompatible marker' } } }
      : {}),
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.reason, 'invalid_trace_frame');
  assert.equal(run.status, 'runtime');
  assert.equal(run.frames.at(-1).error.kind, 'invalid_trace_frame');
}

const legalCompletions = [
  { status: 'trace_ready' },
  { status: 'syntax', kind: 'error' },
  { status: 'runtime', kind: 'error' },
  { status: 'limit', kind: 'limit' },
  { status: 'timeout' },
];
for (const [index, completion] of legalCompletions.entries()) {
  const run = createRouteContractRun(20 + index);
  const response = await request(`/runtime/compute-lab-runs/${run.id}/complete`, {
    sessionId: 'contract-session',
    status: completion.status,
    ...(completion.kind
      ? { frame: { sequence: 0, kind: completion.kind, error: { message: `${completion.status} marker` } } }
      : {}),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(run.status, completion.status);
  assert.equal(run.frames.at(-1)?.kind, completion.kind);
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
  // Every step is Located, Named and Valued against a real end-to-end run, and
  // each construct in the shipped starter is identified by the player's own
  // source rather than by the class that produced it (R-21 #2, #3, #13).
  const sourcesOf = kind => frames.filter(frame => frame.kind === kind).map(frame => frame.source);
  assert.ok(sourcesOf('value').includes('total + value'), 'expressions report their own source');
  assert.ok(sourcesOf('binding').includes('index = 0'), 'a constant assignment is a step of its own');
  assert.ok(sourcesOf('block_enter').includes('for value in nums'));
  assert.ok(sourcesOf('repetition').includes('for value in nums'));
  assert.ok(sourcesOf('decision').includes('if value > 0'));
  assert.ok(sourcesOf('block_exit').includes('while index < len(nums) and nums[index] >= 0'));
  assert.deepEqual(sourcesOf('result'), ['return total'], 'the run lands on the return it produced');
  const iterations = frames
    .filter(frame => frame.kind === 'repetition' && frame.source === 'for value in nums')
    .map(frame => [frame.detail.iteration, frame.detail.bindings.value]);
  assert.deepEqual(
    iterations,
    [
      [1, task.body.params.a],
      [2, task.body.params.b],
    ],
    '#2: how many times the body ran, and what value held on each of those iterations',
  );
  for (const frame of frames) {
    assert.equal('node_type' in frame, false, '#3: no AST class name crosses the wire');
    assert.ok(frame.source === undefined || source.includes(frame.source), 'a label is the player\'s own source');
  }
  assert.ok(frames.length < 100, `the shipped starter stays readable (${frames.length} steps)`);
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
  assert.equal(limited.frames.at(-1).kind, 'limit');
  // #7/#8: a stopped run can name the loop it was in and how far it got, so the
  // screen can say "we stopped watching" rather than implying the loop ended.
  const stoppedIn = limited.frames.filter(frame => frame.kind === 'repetition').at(-1);
  assert.equal(stoppedIn.source, 'for i in range(1000)');
  assert.ok(stoppedIn.detail.iteration > 300, `only ${stoppedIn.detail.iteration} iterations were observed`);

  // R-21 #11 and #12, end to end: a helper and a recursion survive the runner,
  // the daemon, the normalizer and the replay store. The `stack` field is what
  // the screen needs to show the outermost and the innermost at once, and this
  // is the only place that proves the normalizer accepts what the runner emits.
  const recursive = await request('/compute-lab/runs', {
    nodeId: 'e_op_add',
    taskId: task.body.taskId,
    revision: 4,
    source:
      'class ProblemSolver:\n' +
      '    def solution(self, a, b):\n' +
      '        def down(n):\n' +
      '            if n <= 0:\n' +
      '                return 0\n' +
      '            return down(n - 1) + 1\n' +
      '        return down(a + b)\n',
  });
  assert.equal(recursive.status, 202);
  const recursed = await waitForTerminal(recursive.body.runId);
  assert.equal(recursed.status, 'trace_ready', JSON.stringify(recursed).slice(0, 400));
  assert.equal(recursed.returnValue, task.body.params.a + task.body.params.b);
  const entered = recursed.frames.filter(frame => frame.kind === 'block_enter').map(frame => frame.source);
  assert.ok(entered.includes('def solution(self, a, b):'), '#11: the outermost call is entered like any other block');
  assert.ok(entered.includes('def down(n):'), '#11: going into a helper is a step, not an unexplained line jump');
  const chains = recursed.frames.filter(frame => frame.stack).map(frame => frame.stack);
  assert.ok(chains.length > 0, '#12: a run inside its own calls carries the chain it is inside');
  assert.ok(chains.every(chain => chain.length <= 8), '#12: depth is summarised, never a wall of frames');
  assert.ok(
    chains.every(chain => chain[0].source === 'def solution(self, a, b):'),
    '#12: the outermost stays visible at every depth',
  );
  assert.ok(
    chains.some(chain => chain.at(-1).count > 1),
    '#12: the repeated middle is collapsed and counted rather than listed',
  );

  // R-21 #9 as R-25 re-pointed it: the same block, released on both paths, and
  // the failing run says what broke next to the release that happened anyway.
  const cleanup =
    'class ProblemSolver:\n' +
    '    def solution(self, a, b):\n' +
    '        total = 0\n' +
    '        try:\n' +
    '            total = a %s 0\n' +
    '        finally:\n' +
    '            b = 0\n' +
    '        return total\n';
  const [finished, broke] = await Promise.all(
    ['+', '//'].map(async (operator, index) => {
      const posted = await request('/compute-lab/runs', {
        nodeId: 'e_op_add',
        taskId: task.body.taskId,
        revision: 5 + index,
        source: cleanup.replace('%s', operator),
      });
      assert.equal(posted.status, 202);
      return waitForTerminal(posted.body.runId);
    }),
  );
  assert.equal(finished.status, 'trace_ready');
  assert.equal(broke.status, 'runtime');
  const released = [finished, broke].map(run => run.frames.find(frame => frame.kind === 'block_exit'));
  assert.deepEqual(
    released.map(frame => frame.source),
    ['try:', 'try:'],
    '#9: the release is reported on the failing path too, not only when nothing went wrong',
  );
  assert.equal(released[0].detail, undefined, '#9: a clean exit says nothing broke by saying nothing');
  // The fact, not CPython's wording: 3.14 reworded `//` by zero to "division by
  // zero" where 3.12 and 3.13 say "integer division or modulo by zero", and the
  // SDK's `requires-python` is `>=3.11` with no upper bound — so which of the
  // two a real Code Server produces depends on the interpreter `uv` picked.
  assert.deepEqual(Object.keys(released[1].detail), ['error'], '#9: the release carries the error and nothing else');
  assert.match(released[1].detail.error, /\bby zero$/, '#9: both facts adjacent on one card');
  // The terminal `error` marker follows the trace; the last step that names the
  // player's own code is what the screen lands on.
  const landed = broke.frames.filter(frame => frame.source !== undefined).at(-1);
  assert.equal(landed.kind, 'unwind', '#9: a run a `finally` cleaned up after still broke');
  assert.equal(landed.source, 'total = a // 0', '#9: and it broke where it broke');
  assert.equal(broke.frames.filter(frame => frame.kind === 'result').length, 0, '#9: a broken run never returned');

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
