import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../packages/ui/src/components/ComputeLabScreen.tsx', import.meta.url), 'utf8');
const detail = readFileSync(
  new URL('../packages/ui/src/components/nodeDetail/NodeTypeInfo.tsx', import.meta.url),
  'utf8',
);
const app = readFileSync(new URL('../packages/ui/src/App.tsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../packages/ui/src/store/gameStore.ts', import.meta.url), 'utf8');
const locales = ['en', 'ja', 'zh-TW'].map(locale =>
  readFileSync(new URL(`../packages/ui/src/i18n/${locale}.ts`, import.meta.url), 'utf8'),
);
for (const source of [screen, detail, app]) assert.doesNotMatch(source, /layer\/switch|switchActiveLayer/);
assert.match(detail, /node\.id === 'e_op_add' && node\.data\.unlocked/);
assert.match(screen, /source\?\.id === ADD_NODE_ID.*source\.type === 'compute'.*source\.data\.unlocked === true/);
assert.match(screen, /<GraphCanvas nodes=\{labNodes\} edges=\{labEdges\} onNodeClick=\{onNodeClick\}/);
assert.match(screen, /LAB_NODES/);
assert.match(screen, /label: t\(node\.labelKey\)/);
assert.match(screen, /unlocked: true/);
assert.match(screen, /selectedNode\.id === 'lab_start'/);
assert.match(screen, /selectNode\(ADD_NODE_ID\);\s*closeComputeLab\(\)/);
assert.doesNotMatch(screen, /compute-lab-chain|compute-lab-arrow|\[zoom, setZoom\]/);
assert.match(screen, /setSelectedNodeId\(node\.id\)/);
assert.match(screen, /aria-live="polite"/);
assert.doesNotMatch(screen, /computeLab\.sessions|task\?\.params|Mastered|Resume/);
assert.doesNotMatch(store, /computeLab:/);
assert.match(screen, /role="dialog"/);
assert.match(screen, /aria-modal="true"/);
assert.match(screen, /event\.key === 'Escape'/);
assert.match(screen, /minHeight: 44/);
assert.match(app, /<ComputeLabScreen \/>/);
for (const key of ['start', 'operator', 'input_a', 'input_b', 'result']) {
  for (const locale of locales) assert.match(locale, new RegExp(`compute_lab\\.node\\.${key}`));
}
console.log('compute lab UI contract passed');
