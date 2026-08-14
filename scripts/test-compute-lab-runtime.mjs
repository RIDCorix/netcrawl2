/* Real Code Server integration: a loop trace is run through the runtime queue. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.NETCRAWL_BUNDLED = 'true';
const testDir = mkdtempSync(join(tmpdir(), 'netcrawl-compute-lab-runtime-'));
const workspace = resolve(process.env.NETCRAWL_WORKSPACE_DIR || '../netcrawl-workspace');
const sdkPath = resolve('packages/sdk-python');
const { startServer } = await import('../packages/server/.test-dist/index.js');
const { getGameState, saveGameState } = await import('../packages/server/.test-dist/domain/gameState.js');
const { server } = await startServer({ port: 4800, dataDir: testDir });
const base = 'http://127.0.0.1:4800/api';
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

const runner = spawn('uv', ['run', 'main.py'], {
  cwd: workspace,
  env: { ...process.env, PYTHONPATH: sdkPath, PYTHONUNBUFFERED: '1' },
  stdio: 'ignore',
});

let failure;
try {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(250);
    connected = (await request('/state')).body.codeServerConnected === true;
    if (connected) break;
  }
  assert.equal(connected, true, 'uv run main.py must register a live Code Server');

  const task = await request('/compute-lab/tasks', { nodeId: 'e_op_add' });
  assert.equal(task.status, 200);
  const source = [
    'def solve(params):',
    '    values = [params["a"], params["b"]]',
    '    total = 0',
    '    for value in values:',
    '        total = total + value',
    '    return total',
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

  const submission = await request('/compute-lab/submissions', { taskId: task.body.taskId, runId: started.body.runId });
  assert.equal(submission.status, 200);
  assert.equal(submission.body.correct, true);
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
