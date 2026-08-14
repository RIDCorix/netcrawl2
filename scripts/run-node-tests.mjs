/* global console, process */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const excludedTests = new Map([
  ['test:node', 'This aggregate would recursively invoke itself.'],
  ['test:sdk-python', 'The pure Python suite runs in the dedicated Python CI job.'],
]);

const packageJsonPath = resolve(process.env.NETCRAWL_PACKAGE_JSON || 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const tests = Object.keys(packageJson.scripts || {}).filter(
  name => name.startsWith('test:') && !excludedTests.has(name),
);
if (tests.length === 0) {
  throw new Error('No Node test scripts were discovered in package.json');
}

if (process.argv.includes('--list')) {
  console.log(JSON.stringify(tests));
  process.exit(0);
}

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
