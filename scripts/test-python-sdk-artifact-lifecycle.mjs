/* global console, process */
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
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

const failures = [];

/**
 * Test a real artifact, whichever one is real right now.
 *
 * The workspace fixture's lock pins whatever SDK release it was built against,
 * so in the steady state this exercises the published wheel — the point of the
 * test. Between a version bump here and its publish there is no such release,
 * and asserting against one would make every bump a red build until an external
 * job caught up. In that window, build the wheel this tree produces and test
 * that instead: it is the artifact about to be published.
 */
function installedSdkVersion() {
  const probe = spawnSync(
    'uv',
    ['run', '--frozen', '--project', projectDir, 'python', '-c', 'import importlib.metadata as m; print(m.version("netcrawl-sdk"))'],
    { encoding: 'utf8' },
  );
  return probe.status === 0 ? probe.stdout.trim() : null;
}

try {
  await run('uv', ['sync', '--frozen', '--project', projectDir]);
  let wheel = sdkWheel;
  if (!wheel && installedSdkVersion() !== expectedVersion) {
    const distDir = resolve('packages/sdk-python/dist');
    await run('uv', ['build', '--wheel', '--project', 'packages/sdk-python', '-o', distDir]);
    const built = readdirSync(distDir).find(name => name === `netcrawl_sdk-${expectedVersion}-py3-none-any.whl`);
    assert.ok(built, `uv build did not produce a ${expectedVersion} wheel`);
    wheel = join(distDir, built);
    console.log(`netcrawl-sdk ${expectedVersion} is not published yet; testing the wheel this tree builds`);
  }
  if (wheel) {
    await run('uv', ['pip', 'install', '--python', join(projectDir, '.venv'), '--reinstall', wheel]);
  }
  await run(
    'uv',
    [
      'run',
      wheel ? '--no-sync' : '--frozen',
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
} catch (error) {
  failures.push(error);
} finally {
  try {
    await new Promise(resolvePromise => server.close(resolvePromise));
  } catch (error) {
    failures.push(error);
  }
  for (const path of [testDir, join(process.cwd(), 'packages/server/.test-dist')]) {
    try {
      rmSync(path, { recursive: true, force: true });
    } catch (error) {
      failures.push(error);
    }
  }
  for (const failure of failures) console.error(failure);
  process.exit(failures.length === 0 ? 0 : 1);
}
