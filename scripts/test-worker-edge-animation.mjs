import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../packages/ui/src/components/graph/edges/WorkerEdge.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(source, /repeatCount=["']indefinite["']/, 'movement dots must not wrap back to the path start');
assert.match(source, /begin=["']indefinite["']/, 'movement timing must not inherit the SVG document timeline');
assert.match(source, /\.beginElement\(\)/, 'a newly mounted movement dot must explicitly start its animation');
assert.match(source, /drop-shadow\(0 0 6px/, 'moving workers must retain their active glow');
assert.match(source, /calcMode=["']spline["']/, 'movement speed must use easing rather than linear interpolation');
assert.match(source, /keySplines=["']0\.42 0 0\.58 1;0 0 1 1["']/, 'movement easing must preserve the established ease-in-out curve');
assert.match(source, /w\.move_id/, 'the movement snapshot must retain the server movement identity');
assert.match(source, /workerId/, 'the movement snapshot must retain the worker identity');
assert.match(source, /w\.id === workerId[\s\S]*w\.status === 'moving'[\s\S]*String\(w\.move_id \?\? w\.id\) === moveId/, 'a stale edge snapshot must stop rendering as soon as its exact movement ends');
assert.match(source, /key=\{`\$\{dot\.color\}-\$\{dot\.reverse\}-\$\{dot\.moveId\}`\}/, 'each server movement must give the SVG animation a fresh React identity');

console.log('worker edge animation regression checks passed');
