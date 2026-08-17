import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('packages/ui/src/components/ComputeLabScreen.tsx', 'utf8');

assert.match(source, /localStorage\.setItem/);
assert.match(source, /run\.revision !== revision/);
assert.match(source, /disabled=\{!run \|\| run\.status !== 'trace_ready' \|\| stale \|\| cooldownRemaining > 0\}/);
// R-21 #15: SUBMIT consumes the task either way, so its price is on screen
// before it is pressed, and the cooldown it starts is visible while it runs.
assert.match(source, /compute_lab\.submit_cost/);
assert.match(source, /compute_lab\.cooldown_remaining/);
assert.match(source, /setCooldownUntil\(Date\.now\(\) \+ task\.cost\.cooldownSeconds \* 1000\)/);
assert.match(source, /event\.key === 'Escape'/);
assert.match(source, /querySelectorAll<HTMLElement>\('button:not\(\[disabled\]\), textarea:not\(\[disabled\]\)'\)/);
assert.match(source, /setFrameIndex\(current => Math\.max\(0, current - 1\)\)/);
assert.match(source, /setFrameIndex\(Math\.max\(0, \(run\?\.frames\.length \|\| 1\) - 1\)\)/);
console.log('Compute Lab draft, stale-submit, replay, and focus contracts passed');
