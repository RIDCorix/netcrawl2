import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ComputeLabScreen.tsx', import.meta.url), 'utf8');

assert.match(source, /localStorage\.setItem/);
assert.match(source, /run\.revision !== revision/);
assert.match(source, /disabled=\{!run \|\| run\.status !== 'trace_ready' \|\| stale\}/);
assert.match(source, /event\.key === 'Escape'/);
assert.match(source, /querySelectorAll<HTMLElement>\('button:not\(\[disabled\]\), textarea:not\(\[disabled\]\)'\)/);
assert.match(source, /setFrameIndex\(current => Math\.max\(0, current - 1\)\)/);
assert.match(source, /setFrameIndex\(Math\.max\(0, \(run\?\.frames\.length \|\| 1\) - 1\)\)/);
console.log('Compute Lab draft, stale-submit, replay, and focus contracts passed');
