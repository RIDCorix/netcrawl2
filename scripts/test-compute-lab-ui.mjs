import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../packages/ui/src/components/ComputeLabScreen.tsx', import.meta.url), 'utf8');
const detail = readFileSync(
  new URL('../packages/ui/src/components/nodeDetail/NodeTypeInfo.tsx', import.meta.url),
  'utf8',
);
const app = readFileSync(new URL('../packages/ui/src/App.tsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../packages/ui/src/store/gameStore.ts', import.meta.url), 'utf8');
for (const source of [screen, detail, app]) assert.doesNotMatch(source, /layer\/switch|switchActiveLayer/);
assert.match(detail, /node\.id === 'e_op_add' && node\.data\.unlocked/);
assert.match(screen, /source\?\.id === ADD_NODE_ID.*source\.type === 'compute'.*source\.data\.unlocked === true/);
assert.match(screen, /selectNode\(ADD_NODE_ID\);\s*closeComputeLab\(\)/);
assert.match(screen, /label === 'START'/);
assert.doesNotMatch(screen, /computeLab\.sessions|task\?\.params|Mastered|Resume/);
assert.doesNotMatch(store, /computeLab:/);
assert.match(screen, /role="dialog"/);
assert.match(screen, /aria-modal="true"/);
assert.match(screen, /event\.key === 'Escape'/);
assert.match(screen, /minHeight: 44/);
assert.match(app, /<ComputeLabScreen \/>/);
console.log('compute lab UI contract passed');
