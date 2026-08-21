import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ComputeLabScreen } from '../packages/ui/src/components/ComputeLabScreen';
import { useGameStore } from '../packages/ui/src/store/gameStore';

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { addEventListener: () => undefined, removeEventListener: () => undefined },
});
Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: null } });
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async () =>
    new Response(JSON.stringify({ taskId: 'task', params: { a: 3, b: 4 }, difficulty: 'easy' }), { status: 200 }),
});

useGameStore.setState({
  computeLabOpen: true,
  computeLabSourceNodeId: 'e_op_add',
  computeLabRuns: {},
  connected: true,
  nodes: [{ id: 'e_op_add', type: 'compute', position: { x: 0, y: 0 }, data: { label: 'ADD', unlocked: true } }],
});

let renderer;
await act(async () => {
  renderer = TestRenderer.create(<ComputeLabScreen />);
  await Promise.resolve();
});

assert.equal(renderer.root.findAllByType('textarea').length, 0);
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /uv run python/);
assert.match(JSON.stringify(renderer.toJSON()), /Open the problem to bind its exact workspace path/);
assert.match(JSON.stringify(renderer.toJSON()), /YOUR SOLUTION/);
assert.match(JSON.stringify(renderer.toJSON()), /RUN SOLUTION/);
assert.match(JSON.stringify(renderer.toJSON()), /EXECUTION TRACE/);
assert.match(JSON.stringify(renderer.toJSON()), /INSTALL EXTENSION/);
assert.match(JSON.stringify(renderer.toJSON()), /PAIR AN EDITOR/);
const runButton = renderer.root.findByProps({ 'data-testid': 'compute-lab-run-solution' });
assert.equal(runButton.props.disabled, true, 'run is unavailable until an exact editor binding exists');
console.log('Compute Lab mission → solution → results mounted flow passed');
