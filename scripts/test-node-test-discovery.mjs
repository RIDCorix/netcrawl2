/* global console, process */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const testDir = mkdtempSync(join(tmpdir(), 'netcrawl-node-test-discovery-'));
try {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  packageJson.scripts['test:future-node-regression'] = 'node future-node-regression.mjs';
  const fixture = join(testDir, 'package.json');
  writeFileSync(fixture, JSON.stringify(packageJson));

  const result = spawnSync(process.execPath, [resolve('scripts/run-node-tests.mjs'), '--list'], {
    env: { ...process.env, NETCRAWL_PACKAGE_JSON: fixture },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const selected = JSON.parse(result.stdout);
  assert.ok(selected.includes('test:future-node-regression'), 'a newly added Node test alias must be selected');
  assert.ok(selected.includes('test:runtime-route-fences'), 'the runtime fence guard must remain selected');
  assert.ok(!selected.includes('test:node'), 'the aggregate must not select itself');
  assert.ok(!selected.includes('test:sdk-python'), 'the dedicated Python job must remain excluded');
  console.log('Node test discovery regression passed');
} finally {
  rmSync(testDir, { recursive: true, force: true });
}
