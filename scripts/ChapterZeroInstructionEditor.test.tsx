import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ChapterZeroInstructionEditor, DIRECT_MOVE_NARRATOR_KEYS } from '../packages/ui/src/components/ChapterZeroRepl';
import { CodespaceSkeleton } from '../packages/ui/src/components/guide/CodespaceSkeleton';
import { CodeServerCredentialStatus } from '../packages/ui/src/components/CodeServerCredentialStatus';

type Renderer = TestRenderer.ReactTestRenderer;

for (const variant of [
  'codespace-create',
  'codespace-editor',
  'codespace-terminal',
  'codespace-run',
  'codespace-stop',
] as const) {
  let skeleton: Renderer | undefined;
  act(() => {
    skeleton = TestRenderer.create(<CodespaceSkeleton variant={variant} />);
  });
  assert.equal(typeof skeleton!.root.findByProps({ className: 'codespace-skeleton' }).props['aria-label'], 'string');
  assert.equal(skeleton!.root.findByProps({ className: 'codespace-skeleton-target-label' }).children.length > 0, true);
}

let unavailableRetries = 0;
let sessionReloads = 0;
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    location: {
      reload: () => {
        sessionReloads += 1;
      },
    },
  },
});
let credentialState: Renderer | undefined;
act(() => {
  credentialState = TestRenderer.create(
    <CodeServerCredentialStatus loading={true} error={null} retry={() => undefined} />,
  );
});
assert.equal(credentialState!.root.findByProps({ 'data-code-server-credential-state': 'loading' }).type, 'p');
assert.equal(credentialState!.root.findAllByType('button').length, 0);
act(() =>
  credentialState!.update(
    <CodeServerCredentialStatus loading={false} error="session_expired" retry={() => undefined} />,
  ),
);
assert.equal(credentialState!.root.findByProps({ 'data-code-server-credential-state': 'session_expired' }).type, 'div');
assert.equal(credentialState!.root.findAllByType('button').length, 1);
act(() => credentialState!.root.findByType('button').props.onClick());
assert.equal(sessionReloads, 1);
act(() =>
  credentialState!.update(
    <CodeServerCredentialStatus
      loading={false}
      error="unavailable"
      retry={() => {
        unavailableRetries += 1;
      }}
    />,
  ),
);
act(() => credentialState!.root.findByType('button').props.onClick());
assert.equal(unavailableRetries, 1);

let blockedSkeleton: Renderer | undefined;
act(() => {
  blockedSkeleton = TestRenderer.create(
    <CodespaceSkeleton
      variant="codespace-editor"
      connection={{ serverUrl: 'https://game.example', apiKey: '', requiresApiKey: true }}
    />,
  );
});
assert.equal(
  blockedSkeleton!.toJSON(),
  null,
  'cloud setup must not render executable placeholders before credentials are ready',
);

function renderEditor(
  stage: 'direct_commands' | 'code_editor',
  step: number,
  dialogueIndex = 0,
  dialogueDone = true,
  onDirectCommand: (command: string) => void = () => undefined,
  onCodeRun: (startup: string, loop: string) => void = () => undefined,
): Renderer {
  let renderer: Renderer | undefined;
  act(() => {
    renderer = TestRenderer.create(
      <ChapterZeroInstructionEditor
        stage={stage}
        step={step}
        dialogueIndex={dialogueIndex}
        dialogueDone={dialogueDone}
        running={false}
        onDirectCommand={onDirectCommand}
        onCodeRun={onCodeRun}
      />,
    );
  });
  return renderer!;
}

function activeRange(renderer: Renderer, range: string) {
  return renderer.root
    .findAllByProps({ 'data-code-range': range })
    .some(node => String(node.props.className).includes('chapter0-code-range-active'));
}

async function fillAndRun(renderer: Renderer, values: string[]) {
  const textareas = renderer.root.findAllByType('textarea');
  assert.equal(textareas.length, values.length);
  act(() => values.forEach((value, index) => textareas[index].props.onChange({ target: { value } })));
  await act(async () => renderer.root.findByType('button').props.onClick());
}

assert.deepEqual(DIRECT_MOVE_NARRATOR_KEYS, [
  'tutorial.chapter_zero.code_editor.intro_L1',
  'tutorial.chapter_zero.code_editor.intro_L2',
  'tutorial.chapter_zero.code_editor.intro_L3',
  'tutorial.chapter_zero.code_editor.intro_L4',
  'tutorial.chapter_zero.direct_commands.hint_move_L3',
]);
for (const [index, range] of ['class', 'identity', 'edge', 'startup', 'startup'].entries()) {
  const explaining = renderEditor('direct_commands', 0, index, false);
  assert.equal(activeRange(explaining, range), true, `dialogue ${index} must highlight ${range}`);
  assert.equal(explaining.root.findByType('button').props.disabled, true, `dialogue ${index} must gate Run`);
}

const directCommands: string[] = [];
const firstMove = renderEditor('direct_commands', 0, 4, true, command => directCommands.push(command));
assert.equal(firstMove.root.findAllByProps({ 'data-code-range': 'class' }).length, 1);
assert.equal(firstMove.root.findAllByProps({ 'data-code-range': 'startup' }).length, 1);
assert.equal(firstMove.root.findAllByProps({ 'data-code-range': 'loop' }).length, 0);
assert.equal(activeRange(firstMove, 'startup'), true);
assert.equal(firstMove.root.findByType('button').props.disabled, false);
await fillAndRun(firstMove, ['        self.move(self.edge)']);
assert.deepEqual(directCommands, ['self.move(self.edge)']);

const collect = renderEditor('direct_commands', 1, 1, true);
assert.equal(activeRange(collect, 'startup'), true);
assert.equal(collect.root.findByType('button').props.disabled, false);

const lockedRuns: Array<[string, string]> = [];
const startupCheckpoint = renderEditor('code_editor', 0, 0, true, undefined, (startup, loop) =>
  lockedRuns.push([startup, loop]),
);
assert.equal(activeRange(startupCheckpoint, 'startup'), true);
await fillAndRun(startupCheckpoint, ['        self.move(self.edge)\n        self.deposit()']);
assert.deepEqual(lockedRuns, [['self.move(self.edge)\nself.deposit()', 'pass']]);

const unlockedRuns: Array<[string, string]> = [];
const loopCheckpoint = renderEditor('code_editor', 1, 1, true, undefined, (startup, loop) =>
  unlockedRuns.push([startup, loop]),
);
assert.equal(activeRange(loopCheckpoint, 'loop'), true);
await fillAndRun(loopCheckpoint, [
  '        pass',
  '        self.move(self.edge)\n        self.collect()\n        self.move(self.edge)\n        self.deposit()',
]);
assert.deepEqual(unlockedRuns, [
  ['pass', 'self.move(self.edge)\nself.collect()\nself.move(self.edge)\nself.deposit()'],
]);

// Transitioning from the startup checkpoint into the mining-loop step clears
// the old startup program in the same editor instance.
let transitionedRuns: Array<[string, string]> = [];
let transitioned: Renderer | undefined;
act(() => {
  transitioned = TestRenderer.create(
    <ChapterZeroInstructionEditor
      stage="code_editor"
      step={0}
      dialogueIndex={0}
      dialogueDone={true}
      running={false}
      onDirectCommand={() => undefined}
      onCodeRun={(startup, loop) => transitionedRuns.push([startup, loop])}
    />,
  );
});
const startupEditor = transitioned!;
act(() => {
  const startupTextarea = startupEditor.root.findAllByType('textarea')[0];
  startupTextarea.props.onChange({ target: { value: '        self.move(self.edge)\n        self.deposit()' } });
  startupEditor.update(
    <ChapterZeroInstructionEditor
      stage="code_editor"
      step={1}
      dialogueIndex={1}
      dialogueDone={true}
      running={false}
      onDirectCommand={() => undefined}
      onCodeRun={(startup, loop) => transitionedRuns.push([startup, loop])}
    />,
  );
});
await act(async () => Promise.resolve());
assert.equal(startupEditor.root.findAllByType('textarea')[0].props.value, '        pass');

console.log('Chapter Zero editor dialogue and interactions passed');
