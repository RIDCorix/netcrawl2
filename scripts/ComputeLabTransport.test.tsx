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
          'class ProblemSolver:\n    def solution(self, a, b):\n        合計 = a + b\n        for left, right in [(a, b)]:\n            合計 = (\n                合計 +\n                b\n            )\n        return 合計\n',
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

function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object' && 'children' in node) return text((node as { children: unknown }).children);
  return '';
}

// R-21 #10: a run that broke opens on the step that broke — the last one naming
// the player's own code — not on the terminal marker, whose only content is a
// status message the outcome panel already states in words.
await act(async () => {
  applyGameMessage({
    type: 'COMPUTE_LAB_RUN',
    payload: {
      id: 'run-1',
      nodeId: 'e_op_add',
      taskId: 'e_op_add-task',
      revision: 0,
      status: 'runtime',
      frames: [
        {
          sequence: 0,
          kind: 'unwind',
          line: 3,
          source: '合計 = a + b',
          location: { lineno: 3, col_offset: 8, end_lineno: 3, end_col_offset: 22 },
          locals: { a: 3, b: 4 },
          detail: { error: 'unsupported operand type' },
        },
        { sequence: 1, kind: 'error', line: 3, error: { message: 'unsupported operand type', kind: 'TypeError' } },
      ],
    },
  });
});
assert.match(text(renderer!.toJSON()), /Your program broke part way through/);
assert.match(text(renderer!.toJSON()), /Error reached 合計 = a \+ b/);
assert.match(text(renderer!.toJSON()), /unsupported operand type/);
assert.doesNotMatch(
  text(renderer!.toJSON()),
  /Stopped here/,
  '#10: the view lands on the failing step, not on the contentless terminal marker',
);

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
        {
          sequence: 0,
          kind: 'binding',
          line: 3,
          source: '合計 = a + b',
          location: { lineno: 3, col_offset: 8, end_lineno: 3, end_col_offset: 22 },
          locals: { a: 3 },
          changed: ['a'],
          detail: { bindings: { 合計: 7 } },
        },
        {
          sequence: 1,
          kind: 'value',
          line: 3,
          source: 'a + b',
          location: { lineno: 3, col_offset: 17, end_lineno: 3, end_col_offset: 22 },
          locals: { a: 3, b: 4 },
          value: 7,
        },
        {
          sequence: 2,
          kind: 'value',
          line: 6,
          source: '合計 +\n                b',
          location: { lineno: 6, col_offset: 16, end_lineno: 7, end_col_offset: 17 },
          locals: { a: 3, b: 4, 合計: 7 },
          value: 11,
        },
        {
          sequence: 3,
          kind: 'repetition',
          line: 4,
          source: 'for left, right in [(a, b)]',
          location: { lineno: 4, col_offset: 8, end_lineno: 4, end_col_offset: 35 },
          locals: { a: 3, b: 4, left: 3, right: 4 },
          detail: { iteration: 1, bindings: { left: 3, right: 4 } },
        },
        // A kind this build has never heard of. It must render through exactly the
        // same card as every kind above, or a construct nobody anticipated becomes
        // invisible instead of merely unlabelled.
        {
          sequence: 4,
          kind: 'transacted',
          line: 3,
          source: 'a + b',
          location: { lineno: 3, col_offset: 17, end_lineno: 3, end_col_offset: 22 },
          locals: { a: 3, b: 4 },
          value: 7,
          detail: { ledger: 'unfamiliar' },
        },
        {
          sequence: 5,
          kind: 'result',
          line: 9,
          source: 'return 合計',
          location: { lineno: 9, col_offset: 8, end_lineno: 9, end_col_offset: 21 },
          locals: { 合計: 7 },
          value: 7,
        },
        {
          sequence: 6,
          kind: 'error',
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
  frames: [{ sequence: 0, kind: 'binding', line: 3, locals: { a: 3 }, changed: ['a'] }],
});
assert.equal(useGameStore.getState().computeLabRuns['run-1'].status, 'trace_ready');
assert.equal(useGameStore.getState().computeLabRuns['run-1'].frames.length, 7);
useGameStore.getState().upsertComputeLabRun({
  id: 'run-1',
  nodeId: 'e_op_other',
  taskId: 'other-task',
  revision: 0,
  status: 'trace_ready',
  frames: [{ sequence: 0, kind: 'result', value: 999 }],
});
assert.equal(
  useGameStore.getState().computeLabRuns['run-1'].nodeId,
  'e_op_add',
  'a reused run id cannot replace a replay from another node/task identity',
);


// R-21 #1: a finished run opens on the frame the player came for — the return —
// not on step 1, and says in words that it finished.
// `result` is now a call returning, not only the program ending: a helper's
// return uses the same word, so it must read correctly at any depth.
assert.match(text(renderer!.toJSON()), /Came back with/);
assert.match(text(renderer!.toJSON()), /return 合計/);
assert.match(text(renderer!.toJSON()), /Your program finished and returned a value/);
assert.match(text(renderer!.toJSON()), /Check the returned value/);
assert.equal(renderer!.root.findAllByProps({ 'data-testid': 'compute-lab-outcome' }).length, 1);
assert.doesNotMatch(text(renderer!.toJSON()), /trace_ready/, 'a terminal state is never shown as its raw status word');

const showFrame = async (index: number) => {
  await act(async () => {
    renderer!.root.findByProps({ type: 'range' }).props.onChange({ target: { value: String(index) } });
  });
};

await showFrame(0);
assert.match(text(renderer!.toJSON()), /Set 合計 = a \+ b/);
assert.match(text(renderer!.toJSON()), /Now holding/);
// R-33 #18/#19: a local is a box of name, value and type, and the one that
// changed at this step is the one — and the only one — marked as changed.
const boxes = renderer!.root.findAllByProps({ 'data-testid': 'compute-lab-variable' });
assert.equal(text(boxes[0].children), 'a3changed at this step');
assert.equal(
  boxes.filter(box => box.props['data-state'] === 'changed').length,
  1,
  '#19: only the variable that changed carries the changed mark',
);

await showFrame(1);
assert.match(text(renderer!.toJSON()), /Worked out a \+ b/);
assert.equal(
  text(renderer!.root.findByType('mark').children),
  'a + b',
  'UTF-8 byte columns highlight the exact expression',
);

await showFrame(2);
assert.equal(
  text(renderer!.root.findByType('mark').children),
  '合計 +\n                b',
  'multiline source ranges retain and highlight every selected line',
);

await showFrame(3);
assert.match(text(renderer!.toJSON()), /Repeated for left, right in \[\(a, b\)\]/);
assert.match(text(renderer!.toJSON()), /Repeat number/);
assert.match(text(renderer!.toJSON()), /Now holding/);
assert.match(text(renderer!.toJSON()), /'left': 3/, 'a value is spelled the way the player wrote it, not the way JSON did');

// R-21 #14, as a code property: an unfamiliar kind renders through the same card,
// with the same source, range, value and detail. Only the word is less specific.
await showFrame(4);
const unfamiliar = text(renderer!.toJSON());
assert.equal(renderer!.root.findAllByProps({ 'data-testid': 'compute-lab-step' }).length, 1);
assert.match(unfamiliar, /Ran a \+ b/);
assert.match(unfamiliar, /ledger/);
assert.equal(text(renderer!.root.findByType('mark').children), 'a + b');
assert.doesNotMatch(unfamiliar, /transacted/, 'a kind name is never shown to the player');

for (const parserWord of ['BinOp', 'BoolOp', 'Compare', 'Subscript', 'node_type', 'col_offset', 'end_lineno']) {
  for (const index of [0, 1, 2, 3, 4, 5]) {
    await showFrame(index);
    assert.doesNotMatch(
      text(renderer!.toJSON()),
      new RegExp(parserWord),
      `R-21 #3: ${parserWord} must never appear in the trace panel`,
    );
  }
}

await showFrame(5);
assert.match(text(renderer!.toJSON()), /Came back with return 合計/);
assert.match(text(renderer!.toJSON()), /→ 7/);
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
  expectedOutcome: RegExp,
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
  assert.match(text(renderer!.toJSON()), expectedOutcome, `${language} terminal state is explained in words`);
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
  /繰り返した for left, right in \[\(a, b\)\].*繰り返し回数.*現在の値/s,
  /プログラムは最後まで実行され、値を返しました。/,
  /SDK を更新/,
);
await assertMountedLocale(
  'zh-TW',
  '執行',
  /重複 for left, right in \[\(a, b\)\].*重複次數.*目前的值/s,
  /你的程式跑完了，並回傳了一個值。/,
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
