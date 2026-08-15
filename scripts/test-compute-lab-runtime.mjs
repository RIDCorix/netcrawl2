/* Real Code Server integration: a loop trace is run through the runtime queue. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.NETCRAWL_BUNDLED = 'true';
const testDir = mkdtempSync(join(tmpdir(), 'netcrawl-compute-lab-runtime-'));
const workspace = resolve(process.env.NETCRAWL_WORKSPACE_DIR || '../netcrawl-workspace');
const uv = process.env.NETCRAWL_UV_BINARY || 'uv';
assert.equal(existsSync(workspace), true, `NETCRAWL_WORKSPACE_DIR must point to netcrawl-workspace: ${workspace}`);
const { startServer } = await import('../packages/server/.test-dist/index.js');
const { getGameState, saveGameState } = await import('../packages/server/.test-dist/domain/gameState.js');
const { registerWorkerClass } = await import('../packages/server/.test-dist/workerRegistry.js');
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

const state = getGameState();
saveGameState({
  ...state,
  nodes: state.nodes.map(node => (node.id === 'e_op_add' ? { ...node, data: { ...node.data, unlocked: true } } : node)),
});
registerWorkerClass({ class_id: 'plain', class_name: 'Plain', class_icon: 'Bot', fields: {}, docstring: '', file: '', language: 'python' });
registerWorkerClass({ class_id: 'solver', class_name: 'Solver', class_icon: 'Bot', capabilities: ['compute_automation'], fields: {}, docstring: '', file: '', language: 'python' });

const runner = spawn(uv, ['run', 'main.py'], {
  cwd: workspace,
  env: { ...process.env, NETCRAWL_SERVER: `http://127.0.0.1:${port}`, PYTHONUNBUFFERED: '1' },
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
  const source = [
    'class ProblemSolver:',
    '    def solution(self, a, b):',
    '        values = [a, b]',
    '        total = 0',
    '        for value in values:',
    '            total = total + value',
    '        return total',
    '',
  ].join('\n');
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
      if (['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected'].includes(next.body.run?.status)) return next.body.run;
    }
    throw new Error(`run ${runId} did not finish`);
  };
  const invalid = await request('/compute-lab/runs', {
    nodeId: 'e_op_add', taskId: task.body.taskId, revision: 2,
    source: 'class ProblemSolver:\n    def solution(self, b, a):\n        return a + b\n',
  });
  assert.equal(invalid.status, 202);
  assert.equal((await waitForTerminal(invalid.body.runId)).status, 'syntax', 'wrong parameter order fails before execution');

  const loop = await request('/compute-lab/runs', {
    nodeId: 'e_op_add', taskId: task.body.taskId, revision: 3,
    source: 'class ProblemSolver:\n    def solution(self, a, b):\n        total = 0\n        for i in range(100):\n            total = total + i\n        return total\n',
  });
  assert.equal(loop.status, 202);
  const limited = await waitForTerminal(loop.body.runId);
  assert.equal(limited.status, 'limit');
  assert.equal(limited.frames.length, 301, 'the terminal limit marker follows 300 execution events');
  assert.equal(limited.frames.at(-1).phase, 'limit');

  const submission = await request('/compute-lab/submissions', { taskId: task.body.taskId, runId: started.body.runId });
  assert.equal(submission.status, 200);
  assert.equal(submission.body.correct, true);
  assert.ok(submission.body.nodeSolveCount > 0, 'submission returns the updated node solve count');

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
