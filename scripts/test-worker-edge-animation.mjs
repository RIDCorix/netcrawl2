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
assert.match(source, /key=\{`\$\{dot\.workerId\}-\$\{dot\.moveId\}`\}/, 'each worker movement must give the SVG animation a collision-free React identity');
assert.doesNotMatch(source, /new Set<|seen\.has|seen\.add/, 'same-class workers on the same edge must not be merged');
assert.match(source, /next\.push\(\{[\s\S]*workerId: w\.id,[\s\S]*moveId: String\(w\.move_id \?\? w\.id\)/, 'every qualifying worker must create its own dot snapshot, including matching move ids');
assert.match(source, /next\.sort\(\(a, b\) => a\.workerId\.localeCompare\(b\.workerId\) \|\| a\.moveId\.localeCompare\(b\.moveId\)\)/, 'worker array reordering must not reorder surviving dots');
assert.match(source, /sameTrafficSnapshot\(prev, next\) \? prev : next/, 'an unchanged worker snapshot must not reset traffic-dot state');
assert.match(source, /useGameStore\.subscribe\(\(state, previousState\) => \{[\s\S]*state\.workers !== previousState\.workers/, 'worker changes must update dots immediately without polling');
assert.doesNotMatch(source, /setInterval\(/, 'traffic dots must not wait for a polling interval to update');

console.log('worker edge animation regression checks passed');
