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
let sessionMode = 'disconnected';
let problemBound = false;
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async input => {
    const url = String(input);
    if (url.includes('/api/editor/sessions'))
      return new Response(
        JSON.stringify({
          sessions:
            sessionMode === 'paired'
              ? [{ id: 'editor-1', label: 'Desktop VS Code', kind: 'desktop', workspaceFolders: ['game'] }]
              : [],
        }),
        { status: 200 },
      );
    if (url.includes('/api/editor/problem-status'))
      return new Response(JSON.stringify({ bound: problemBound, relativePath: 'netcrawl/problems/e_op_add/task.py' }), {
        status: 200,
      });
    return new Response(JSON.stringify({ taskId: 'task', params: { a: 3, b: 4 }, difficulty: 'easy' }), {
      status: 200,
    });
  },
});

useGameStore.setState({
  computeLabOpen: true,
  computeLabSourceNodeId: 'e_op_add',
  computeLabRuns: {},
  connected: true,
  codeServerConnected: false,
  nodes: [{ id: 'e_op_add', type: 'compute', position: { x: 0, y: 0 }, data: { label: 'ADD', unlocked: true } }],
});

let renderer;
await act(async () => {
  renderer = TestRenderer.create(<ComputeLabScreen />);
  await Promise.resolve();
});

assert.equal(renderer.root.findAllByType('textarea').length, 0);
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /uv run python/);
assert.match(JSON.stringify(renderer.toJSON()), /EXECUTION TRACE/);
assert.match(JSON.stringify(renderer.toJSON()), /INSTALL EXTENSION/);
assert.match(JSON.stringify(renderer.toJSON()), /PAIR CODE SERVER/);
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /paired editor is online/);
assert.equal(renderer.root.findAllByProps({ 'data-testid': 'compute-lab-run-solution' }).length, 0);

renderer.unmount();
sessionMode = 'paired';
problemBound = true;
await act(async () => {
  renderer = TestRenderer.create(<ComputeLabScreen />);
  await Promise.resolve();
  await Promise.resolve();
});
assert.match(JSON.stringify(renderer.toJSON()), /PAIR CODE SERVER/);
assert.match(JSON.stringify(renderer.toJSON()), /paired editor is online/);
assert.equal(
  renderer.root.findAllByProps({ 'data-testid': 'compute-lab-run-solution' }).length,
  0,
  'an online paired editor cannot imply that the Code Server execution lease is live',
);
renderer.unmount();

useGameStore.setState({ codeServerConnected: true });
problemBound = false;
await act(async () => {
  renderer = TestRenderer.create(<ComputeLabScreen />);
  await Promise.resolve();
  await Promise.resolve();
});
assert.match(JSON.stringify(renderer.toJSON()), /netcrawl\/problems\/e_op_add\/task\.py/);
assert.match(JSON.stringify(renderer.toJSON()), /OPEN REQUIRED/);
assert.match(JSON.stringify(renderer.toJSON()), /YOUR SOLUTION/);
assert.match(JSON.stringify(renderer.toJSON()), /RUN SOLUTION/);
const runButton = renderer.root.findByProps({ 'data-testid': 'compute-lab-run-solution' });
assert.equal(runButton.props.disabled, true, 'run is unavailable until an exact editor binding exists');
renderer.unmount();
console.log('Compute Lab disconnected, paired-offline, and paired-but-unopened flows passed');
