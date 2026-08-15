import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ComputeLabScreen } from '../packages/ui/src/components/ComputeLabScreen';
import { applyGameMessage } from '../packages/ui/src/hooks/useGameState';
import { useGameStore } from '../packages/ui/src/store/gameStore';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    location: { protocol: 'http:', host: 'localhost:5173' },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
});
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { activeElement: null },
});
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async (url: string) => {
    if (url === '/api/compute-lab/runs') {
      return new Response(JSON.stringify({ ok: true, runId: 'run-1', status: 'queued' }), { status: 202 });
    }
    assert.equal(url, '/api/compute-lab/tasks');
    return new Response(
      JSON.stringify({
        taskId: 'task-1',
        params: { a: 3, b: 4 },
        difficulty: 'easy',
        functionSignature: 'class ProblemSolver:\n    def solution(self, a, b):',
        starterSource: 'class ProblemSolver:\n    def solution(self, a, b):\n        return a + b\n',
      }),
      { status: 200 },
    );
  },
});

useGameStore.setState({
  computeLabOpen: true,
  computeLabSourceNodeId: 'e_op_add',
  computeLabRuns: {},
  codeServerConnected: true,
  connected: true,
  nodes: [
    {
      id: 'e_op_add',
      type: 'compute',
      position: { x: 0, y: 0 },
      data: { label: 'ADD', unlocked: true },
    },
  ],
});

let renderer: TestRenderer.ReactTestRenderer | undefined;
await act(async () => {
  renderer = TestRenderer.create(<ComputeLabScreen />);
  await Promise.resolve();
});

await act(async () => {
  const runButton = renderer!.root.findAllByType('button').find(button => button.children.includes('RUN'))!;
  runButton.props.onClick();
  await Promise.resolve();
});

await act(async () => {
  applyGameMessage({
    type: 'COMPUTE_LAB_RUN',
    payload: {
      id: 'run-1',
      revision: 0,
      status: 'trace_ready',
      returnValue: 7,
      frames: [
        { sequence: 0, phase: 'line', line: 2, locals: { a: 3 }, changed: ['a'] },
        { sequence: 1, phase: 'eval', line: 3, locals: { a: 3, b: 4 }, expression: { source: 'a + b', value: 7 } },
        { sequence: 2, phase: 'return', line: 4, locals: { result: 7 }, value: 7 },
      ],
    },
  });
});

// A reconnect GET can return an older running snapshot after the terminal WebSocket
// message. The reducer must preserve the newer trace rather than regress the UI.
useGameStore.getState().upsertComputeLabRun({
  id: 'run-1',
  revision: 0,
  status: 'running',
  frames: [{ sequence: 0, phase: 'line', line: 2, locals: { a: 3 }, changed: ['a'] }],
});
assert.equal(useGameStore.getState().computeLabRuns['run-1'].status, 'trace_ready');
assert.equal(useGameStore.getState().computeLabRuns['run-1'].frames.length, 3);

function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object' && 'children' in node) return text((node as { children: unknown }).children);
  return '';
}

assert.match(text(renderer!.toJSON()), /LINE/);
assert.match(text(renderer!.toJSON()), /a: 3/);
await act(async () => {
  const next = renderer!.root.findAllByType('button').find(button => button.children.includes('›'))!;
  next.props.onClick();
});
assert.match(text(renderer!.toJSON()), /EVAL/);
assert.match(text(renderer!.toJSON()), /a \+ b/);
await act(async () => {
  renderer!.root.findByProps({ type: 'range' }).props.onChange({ target: { value: '2' } });
});
assert.match(text(renderer!.toJSON()), /RETURN/);
assert.match(text(renderer!.toJSON()), /return: 7/);
await act(async () => {
  renderer!.root.findByType('textarea').props.onChange({ target: { value: 'class ProblemSolver:\n    def solution(self, a, b):\n        return 0\n' } });
});
const submit = renderer!.root.findAllByType('button').find(button => button.children.includes('SUBMIT LAST RUN'))!;
assert.equal(submit.props.disabled, true, 'editing after a trace must disable submit');
assert.equal(useGameStore.getState().computeLabRuns['run-1'].frames.length, 3, 'WS snapshot is stored by run id');
renderer!.unmount();

// An intentionally empty draft is still a saved player choice. Reopening must
// not replace it with the task's starter source.
storage.set('netcrawl-compute-lab:e_op_add', '');
await act(async () => {
  renderer = TestRenderer.create(<ComputeLabScreen />);
  await Promise.resolve();
});
assert.equal(renderer!.root.findByType('textarea').props.value, '', 'an empty saved draft survives reopening');
renderer!.unmount();
console.log('Compute Lab WebSocket transport and mounted replay controls passed');
