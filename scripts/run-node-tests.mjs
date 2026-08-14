/* global console, process */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tests = [
  'test:quest-guides',
  'test:deploy-equipment',
  'test:deploy-route',
  'test:runtime-route-fences',
  'test:worker-edge-animation',
  'test:mine-contention',
  'test:sdk-js',
  'test:quest-view-close',
  'test:sdk-python-artifact',
];

const pyproject = readFileSync('packages/sdk-python/pyproject.toml', 'utf8');
const sdkVersion = pyproject.match(/^version = "([^"]+)"$/m)?.[1];
if (!sdkVersion) {
  throw new Error('Could not read the Python SDK version from pyproject.toml');
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
for (const test of tests) {
  const result = spawnSync(pnpm, [test], {
    env: {
      ...process.env,
      ...(test === 'test:sdk-python-artifact'
        ? { NETCRAWL_EXPECTED_SDK_VERSION: sdkVersion }
        : {}),
    },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
