import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../packages/ui/src/components/ComputeLabScreen.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../packages/server/src/routes/computeLabRoutes.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../packages/sdk-python/netcrawl/compute_lab_runner.py', import.meta.url), 'utf8');

assert.match(screen, /role="dialog"/);
assert.match(screen, /aria-modal="true"/);
assert.match(screen, /textarea/);
assert.match(screen, /compute-lab\/tasks/);
assert.match(screen, /compute-lab\/runs/);
assert.match(screen, /SUBMIT LAST RUN|compute_lab\.submit/);
assert.match(screen, /type="range"/);
assert.doesNotMatch(screen, /GraphCanvas|LAB_NODES|NodeDetailPanel|worker\.goto/);
assert.match(server, /compute-lab\/tasks/);
assert.match(server, /compute-lab\/submissions/);
assert.match(server, /getActivePuzzleParams/);
assert.match(runner, /sys\.settrace/);
assert.match(runner, /InstrumentExpressions/);
assert.match(runner, /attribute access is not allowed/);
console.log('focused Compute Lab contract passed');
