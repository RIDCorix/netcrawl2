import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('packages/ui/src/components/ComputeLabScreen.tsx', 'utf8');

assert.match(source, /data-testid="compute-lab-local-first"/);
assert.match(source, /import \{ EditorBridgePanel \}/);
assert.match(source, /<EditorBridgePanel/);
assert.match(source, /`problems\/\$\{sourceNode\.id\}\.py`/);
assert.match(source, /uv run python \$\{localProblemPath\}/);
assert.match(source, /compute_lab\.local_first\.limitation/);
assert.match(source, /compute_lab\.local_first\.retry/);
assert.match(source, /input:not\(\[disabled\]\), \[role="slider"\]/);
assert.doesNotMatch(source, /<textarea/);
console.log('Compute Lab local-first interaction contract passed');
