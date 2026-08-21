import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('packages/ui/src/components/ComputeLabScreen.tsx', 'utf8');
const bridge = readFileSync('packages/ui/src/components/computeLab/EditorBridgePanel.tsx', 'utf8');

assert.match(source, /compute-lab-mission/);
assert.match(source, /compute-lab-solution/);
assert.match(bridge, /data-testid="compute-lab-run-solution"/);
assert.match(source, /import \{ EditorBridgePanel \}/);
assert.match(source, /<EditorBridgePanel/);
assert.match(bridge, /problem-status/);
assert.match(source, /input:not\(\[disabled\]\), \[role="slider"\]/);
assert.match(source, /compute-lab-play/);
assert.match(source, /compute-lab-pace/);
assert.doesNotMatch(source, /uv run python/);
assert.doesNotMatch(source, /<textarea/);
console.log('Compute Lab UI-run and trace interaction contract passed');
