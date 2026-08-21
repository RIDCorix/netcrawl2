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
  value: async () => new Response(JSON.stringify({ taskId: 'task', params: { a: 3, b: 4 }, difficulty: 'easy' }), { status: 200 }),
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

const localPath = renderer.root.findByProps({ id: 'compute-lab-local-path' });
assert.equal(localPath.props.value, 'problems/e_op_add.py');
assert.equal(localPath.props.readOnly, true);
assert.equal(renderer.root.findAllByType('textarea').length, 0);
assert.match(JSON.stringify(renderer.toJSON()), /uv run python problems\/e_op_add\.py/);
assert.match(JSON.stringify(renderer.toJSON()), /cannot inspect this workspace yet/);
console.log('Compute Lab local-first mounted flow passed');
