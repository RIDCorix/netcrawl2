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
  value: async (url: string, options?: RequestInit) => {
    if (url === '/api/compute-lab/runs') {
      return new Response(JSON.stringify({ ok: true, runId: 'run-1', status: 'queued' }), { status: 202 });
    }
    assert.equal(url, '/api/compute-lab/tasks');
    const nodeId = JSON.parse(String(options?.body)).nodeId;
    return new Response(
      JSON.stringify({
        taskId: `${nodeId}-task`,
        params: { a: 3, b: 4 },
        difficulty: 'easy',
        functionSignature: 'class ProblemSolver:\n    def solution(self, a, b):',
        starterSource:
          'class ProblemSolver:\n    def solution(self, a, b):\n        合計 = a + b\n        return (\n            合計 +\n            b\n        )\n',
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
    {
      id: 'e_op_other',
      type: 'compute',
      position: { x: 100, y: 0 },
      data: { label: 'OTHER', unlocked: true },
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
      nodeId: 'e_op_add',
      taskId: 'e_op_add-task',
      revision: 0,
      status: 'trace_ready',
      returnValue: 7,
      frames: [
        { sequence: 0, phase: 'line', line: 2, locals: { a: 3 }, changed: ['a'] },
        {
          sequence: 1,
          phase: 'eval',
          line: 3,
          locals: { a: 3, b: 4 },
          expression: {
            node_type: 'BinOp',
            source: 'a + b',
            location: { lineno: 3, col_offset: 17, end_lineno: 3, end_col_offset: 22 },
            value: 7,
          },
        },
        {
          sequence: 2,
          phase: 'eval',
          line: 5,
          locals: { a: 3, b: 4, 合計: 7 },
          expression: {
            node_type: 'BinOp',
            source: '合計 +\n            b',
            location: { lineno: 5, col_offset: 12, end_lineno: 6, end_col_offset: 13 },
            value: 11,
          },
        },
        {
          sequence: 3,
          phase: 'control',
          line: 3,
          locals: { a: 3, b: 4, left: 3, right: 4 },
          control: {
            node_type: 'For',
            event: 'iteration',
            iteration: 1,
            target: 'left, right',
            targetBindings: { left: 3, right: 4 },
            location: { lineno: 3, col_offset: 8, end_lineno: 3, end_col_offset: 20 },
          },
        },
        {
          sequence: 4,
          phase: 'eval',
          line: 3,
          locals: { a: 3, b: 4 },
          expression: {
            node_type: 'UnregisteredExpr',
            source: 'a + b',
            location: { lineno: 3, col_offset: 17, end_lineno: 3, end_col_offset: 22 },
            value: 7,
          },
        },
        { sequence: 5, phase: 'return', line: 7, locals: { result: 7 }, value: 7 },
        {
          sequence: 6,
          phase: 'error',
          error: { kind: 'invalid_trace_frame', message: 'internal protocol detail' },
        },
      ],
    },
  });
});

// A reconnect GET can return an older running snapshot after the terminal WebSocket
// message. The reducer must preserve the newer trace rather than regress the UI.
useGameStore.getState().upsertComputeLabRun({
  id: 'run-1',
  nodeId: 'e_op_add',
  taskId: 'e_op_add-task',
  revision: 0,
  status: 'running',
  frames: [{ sequence: 0, phase: 'line', line: 2, locals: { a: 3 }, changed: ['a'] }],
});
assert.equal(useGameStore.getState().computeLabRuns['run-1'].status, 'trace_ready');
assert.equal(useGameStore.getState().computeLabRuns['run-1'].frames.length, 7);
useGameStore.getState().upsertComputeLabRun({
  id: 'run-1',
  nodeId: 'e_op_other',
  taskId: 'other-task',
  revision: 0,
  status: 'trace_ready',
  frames: [{ sequence: 0, phase: 'return', value: 999 }],
});
assert.equal(
  useGameStore.getState().computeLabRuns['run-1'].nodeId,
  'e_op_add',
  'a reused run id cannot replace a replay from another node/task identity',
);

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
assert.equal(
  text(renderer!.root.findByType('mark').children),
  'a + b',
  'UTF-8 byte columns highlight the exact expression',
);
await act(async () => {
  renderer!.root.findByProps({ type: 'range' }).props.onChange({ target: { value: '2' } });
});
assert.equal(
  text(renderer!.root.findByType('mark').children),
  '合計 +\n            b',
  'multiline source ranges retain and highlight every selected line',
);
await act(async () => {
  renderer!.root.findByProps({ type: 'range' }).props.onChange({ target: { value: '3' } });
});
assert.match(text(renderer!.toJSON()), /Control flow · For · iteration/);
assert.match(text(renderer!.toJSON()), /iteration 1/);
assert.match(text(renderer!.toJSON()), /target bindings → left: 3, right: 4/);
await act(async () => {
  renderer!.root.findByProps({ type: 'range' }).props.onChange({ target: { value: '4' } });
});
assert.equal(renderer!.root.findAllByProps({ 'data-testid': 'compute-lab-generic-expression' }).length, 1);
assert.match(text(renderer!.toJSON()), /Expression \(generic view\) · UnregisteredExpr/);
assert.match(text(renderer!.toJSON()), /3:17–3:22/);
await act(async () => {
  renderer!.root.findByProps({ type: 'range' }).props.onChange({ target: { value: '5' } });
});
assert.match(text(renderer!.toJSON()), /RETURN/);
assert.match(text(renderer!.toJSON()), /return: 7/);
await act(async () => {
  renderer!.root
    .findByType('textarea')
    .props.onChange({ target: { value: 'class ProblemSolver:\n    def solution(self, a, b):\n        return 0\n' } });
});
const submit = renderer!.root.findAllByType('button').find(button => button.children.includes('SUBMIT LAST RUN'))!;
assert.equal(submit.props.disabled, true, 'editing after a trace must disable submit');
assert.equal(renderer!.root.findAllByProps({ 'data-testid': 'compute-lab-stale-trace' }).length, 1);
assert.equal(useGameStore.getState().computeLabRuns['run-1'].frames.length, 7, 'WS snapshot is stored by run id');
renderer!.unmount();

// Closing one node and opening another must not replay or submit the first
// node's trace, even when both drafts happen to use the same revision number.
await act(async () => {
  useGameStore.getState().openComputeLab('e_op_other');
  renderer = TestRenderer.create(<ComputeLabScreen />);
  await Promise.resolve();
});
assert.doesNotMatch(text(renderer!.toJSON()), /a: 3/);
assert.match(text(renderer!.toJSON()), /Run your function to inspect every execution step/);
assert.equal(
  renderer!.root.findAllByType('button').find(button => button.children.includes('SUBMIT LAST RUN'))!.props.disabled,
  true,
);
renderer!.unmount();

async function assertMountedLocale(
  language: 'ja' | 'zh-TW',
  runLabel: string,
  expectedControl: RegExp,
  expectedProtocolError: RegExp,
) {
  storage.delete('netcrawl-compute-lab:e_op_add');
  storage.delete('netcrawl-compute-lab:e_op_add:revision');
  useGameStore.setState(state => ({
    computeLabOpen: true,
    computeLabSourceNodeId: 'e_op_add',
    settings: { ...state.settings, language },
  }));
  await act(async () => {
    renderer = TestRenderer.create(<ComputeLabScreen />);
    await Promise.resolve();
  });
  await act(async () => {
    renderer!.root
      .findAllByType('button')
      .find(button => button.children.includes(runLabel))!
      .props.onClick();
    await Promise.resolve();
  });
  await act(async () => {
    renderer!.root.findByProps({ type: 'range' }).props.onChange({ target: { value: '3' } });
  });
  assert.match(text(renderer!.toJSON()), expectedControl, `${language} control copy is mounted and translated`);
  await act(async () => {
    renderer!.root.findByProps({ type: 'range' }).props.onChange({ target: { value: '6' } });
  });
  assert.match(
    text(renderer!.toJSON()),
    expectedProtocolError,
    `${language} protocol failure is actionable and localized`,
  );
  assert.doesNotMatch(text(renderer!.toJSON()), /internal protocol detail/);
  renderer!.unmount();
}

await assertMountedLocale(
  'ja',
  '実行',
  /制御フロー · For · 反復.*反復 1.*ターゲットの値 → left: 3, right: 4/s,
  /SDK を更新/,
);
await assertMountedLocale(
  'zh-TW',
  '執行',
  /控制流程 · For · 迭代.*第 1 次迭代.*目標綁定 → left: 3, right: 4/s,
  /請更新 SDK/,
);

// An intentionally empty draft is still a saved player choice. Reopening must
// not replace it with the task's starter source.
storage.set('netcrawl-compute-lab:e_op_add', '');
storage.set('netcrawl-compute-lab:e_op_add:revision', '4');
useGameStore.setState(state => ({
  computeLabOpen: true,
  computeLabSourceNodeId: 'e_op_add',
  settings: { ...state.settings, language: 'en' },
}));
await act(async () => {
  renderer = TestRenderer.create(<ComputeLabScreen />);
  await Promise.resolve();
});
assert.equal(renderer!.root.findByType('textarea').props.value, '', 'an empty saved draft survives reopening');
renderer!.unmount();
console.log('Compute Lab WebSocket transport and mounted replay controls passed');
