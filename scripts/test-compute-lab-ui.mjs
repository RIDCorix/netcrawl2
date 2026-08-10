import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../packages/ui/src/components/ComputeLabScreen.tsx', import.meta.url), 'utf8');
const detail = readFileSync(
  new URL('../packages/ui/src/components/nodeDetail/NodeTypeInfo.tsx', import.meta.url),
  'utf8',
);
const app = readFileSync(new URL('../packages/ui/src/App.tsx', import.meta.url), 'utf8');
for (const source of [screen, detail, app]) {
  assert.doesNotMatch(source, /layer\/switch|switchActiveLayer/, 'Compute Lab must not use the layer-switch path');
}
assert.match(detail, /e_op_add/, 'only the ADD operator gets the vertical-slice entry point');
assert.match(screen, /role="dialog"/);
assert.match(screen, /aria-modal="true"/);
assert.match(screen, /event\.key === 'Escape'/);
assert.match(screen, /minHeight: 44/);
assert.match(screen, /compute-lab-chain/);
assert.match(app, /<ComputeLabScreen \/>/);
console.log('compute lab UI contract passed');
