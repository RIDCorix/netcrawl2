/*
 * A running build to verify R-33's criteria 18-38 against.
 *
 * Boots the real server on 4800, unlocks the ADD compute node, and brings up a
 * real Code Server with this checkout's SDK on PYTHONPATH — the same recipe the
 * Stage 6 verification used, held open instead of asserted and torn down.
 * Not part of the test suite; a harness for a human (or a browser) to look at.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { delimiter, join, resolve } from 'node:path';

process.env.NETCRAWL_BUNDLED = 'true';
const workspace = resolve(process.env.NETCRAWL_WORKSPACE_DIR || '../netcrawl-workspace');
const candidateSdk = resolve('packages/sdk-python');
const dataDir = mkdtempSync(join(tmpdir(), 'netcrawl-stage-'));

const { startServer } = await import('../packages/server/.test-dist/index.js');
const { getGameState, saveGameState } = await import('../packages/server/.test-dist/domain/gameState.js');
const { registerWorkerClass } = await import('../packages/server/.test-dist/workerRegistry.js');
const { setQuestStatus } = await import('../packages/server/.test-dist/domain/questState.js');

const { port } = await startServer({ port: 4800, dataDir });
const state = getGameState();
saveGameState({
  ...state,
  nodes: state.nodes.map(node => (node.id === 'e_op_add' ? { ...node, data: { ...node.data, unlocked: true } } : node)),
});
for (const [class_id, class_name, capabilities] of [
  ['plain', 'Plain', undefined],
  ['solver', 'Solver', ['compute_automation']],
])
  registerWorkerClass({
    class_id,
    class_name,
    class_icon: 'Bot',
    ...(capabilities ? { capabilities } : {}),
    fields: {},
    docstring: '',
    file: '',
    language: 'python',
  });
setQuestStatus('q_operators', 'available');

// The host validates the candidate SDK through PYTHONPATH before its wheel is
// published; keep the starter lock immutable until the release workflow updates it.
const runner = spawn(process.env.NETCRAWL_UV_BINARY || 'uv', ['run', '--frozen', 'main.py'], {
  cwd: workspace,
  env: {
    ...process.env,
    NETCRAWL_SERVER: `http://127.0.0.1:${port}`,
    PYTHONUNBUFFERED: '1',
    PYTHONPATH: [candidateSdk, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
  },
  stdio: 'inherit',
});
process.on('exit', () => runner.kill('SIGTERM'));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    runner.kill('SIGTERM');
    process.exit(0);
  });

for (let attempt = 0; attempt < 40; attempt++) {
  await new Promise(done => setTimeout(done, 250));
  const response = await fetch(`http://127.0.0.1:${port}/api/state`).then(r => r.json());
  if (response.codeServerConnected === true) break;
}
console.log(`stage host ready on ${port}, data in ${dataDir}`);
