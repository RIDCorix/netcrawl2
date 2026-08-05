import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../packages/ui/src/components/graph/edges/WorkerEdge.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(source, /repeatCount=["']indefinite["']/, 'movement dots must not wrap back to the path start');
assert.match(source, /begin=["']indefinite["']/, 'movement timing must not inherit the SVG document timeline');
assert.match(source, /\.beginElement\(\)/, 'a newly mounted movement dot must explicitly start its animation');
assert.match(source, /w\.move_id/, 'the movement snapshot must retain the server movement identity');
assert.match(source, /key=\{`\$\{dot\.color\}-\$\{dot\.reverse\}-\$\{dot\.moveId\}`\}/, 'each server movement must give the SVG animation a fresh React identity');

console.log('worker edge animation regression checks passed');
