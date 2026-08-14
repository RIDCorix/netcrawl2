/* global console, process */
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.NETCRAWL_MULTI_USER = 'true';
process.env.JWT_SECRET = 'sdk-artifact-lifecycle-secret';
process.env.NETCRAWL_BUNDLED = 'true';

const workspace = resolve(process.env.NETCRAWL_WORKSPACE_DIR || '../netcrawl-workspace');
const expectedVersion = process.env.NETCRAWL_EXPECTED_SDK_VERSION;
const sdkWheel = process.env.NETCRAWL_SDK_WHEEL ? resolve(process.env.NETCRAWL_SDK_WHEEL) : null;
assert.ok(expectedVersion, 'NETCRAWL_EXPECTED_SDK_VERSION is required');

const testDir = mkdtempSync(join(tmpdir(), 'netcrawl-sdk-artifact-'));
const projectDir = join(testDir, 'workspace');
const { mkdirSync } = await import('node:fs');
mkdirSync(projectDir);
copyFileSync(join(workspace, 'pyproject.toml'), join(projectDir, 'pyproject.toml'));
copyFileSync(join(workspace, 'uv.lock'), join(projectDir, 'uv.lock'));

const { startServer } = await import('../packages/server/.test-dist/index.js');
const { server, port } = await startServer({ port: 0, dataDir: join(testDir, 'server-data') });

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code}`))));
  });
}

try {
  await run('uv', ['sync', '--frozen', '--project', projectDir]);
  if (sdkWheel) {
    await run('uv', ['pip', 'install', '--python', join(projectDir, '.venv'), '--reinstall', sdkWheel]);
  }
  await run(
    'uv',
    [
      'run',
      sdkWheel ? '--no-sync' : '--frozen',
      '--project',
      projectDir,
      'python',
      resolve('scripts/test-python-sdk-artifact-lifecycle.py'),
    ],
    {
      env: {
        ...process.env,
        NETCRAWL_TEST_BASE: `http://127.0.0.1:${port}`,
        NETCRAWL_EXPECTED_SDK_VERSION: expectedVersion,
      },
    },
  );
  console.log(`Fresh workspace artifact lifecycle passed for ${expectedVersion}`);
} finally {
  await new Promise(resolvePromise => server.close(resolvePromise));
  rmSync(testDir, { recursive: true, force: true });
}
