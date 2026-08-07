import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ChapterZeroInstructionEditor } from '../packages/ui/src/components/ChapterZeroRepl';

type Renderer = TestRenderer.ReactTestRenderer;

function renderEditor(
  stage: 'direct_commands' | 'code_editor',
  step: number,
  onDirectCommand: (command: string) => void = () => undefined,
  onCodeRun: (startup: string, loop: string) => void = () => undefined,
): Renderer {
  let renderer: Renderer | undefined;
  act(() => {
    renderer = TestRenderer.create(
      <ChapterZeroInstructionEditor
        stage={stage}
        step={step}
        dialogueIndex={0}
        running={false}
        onDirectCommand={onDirectCommand}
        onCodeRun={onCodeRun}
      />,
    );
  });
  return renderer!;
}

async function fillAndRun(renderer: Renderer, values: string[]) {
  const textareas = renderer.root.findAllByType('textarea');
  assert.equal(textareas.length, values.length);
  act(() => values.forEach((value, index) => textareas[index].props.onChange({ target: { value } })));
  await act(async () => renderer.root.findByType('button').props.onClick());
}

const directCommands: string[] = [];
const firstMove = renderEditor('direct_commands', 0, command => directCommands.push(command));
assert.equal(firstMove.root.findAllByProps({ 'data-code-range': 'class' }).length, 1);
assert.equal(firstMove.root.findAllByProps({ 'data-code-range': 'startup' }).length, 1);
assert.equal(firstMove.root.findAllByProps({ 'data-code-range': 'loop' }).length, 0);
await fillAndRun(firstMove, ['        self.move(self.edge)']);
assert.deepEqual(directCommands, ['self.move(self.edge)']);

const lockedRuns: Array<[string, string]> = [];
const startupCheckpoint = renderEditor('code_editor', 0, undefined, (startup, loop) =>
  lockedRuns.push([startup, loop]),
);
await fillAndRun(startupCheckpoint, ['        self.move(self.edge)\n        self.deposit()']);
assert.deepEqual(lockedRuns, [['self.move(self.edge)\nself.deposit()', 'pass']]);

const unlockedRuns: Array<[string, string]> = [];
const loopCheckpoint = renderEditor('code_editor', 1, undefined, (startup, loop) => unlockedRuns.push([startup, loop]));
await fillAndRun(loopCheckpoint, [
  '        pass',
  '        self.move(self.edge)\n        self.collect()\n        self.move(self.edge)\n        self.deposit()',
]);
assert.deepEqual(unlockedRuns, [
  ['pass', 'self.move(self.edge)\nself.collect()\nself.move(self.edge)\nself.deposit()'],
]);

console.log('Chapter Zero editor interactions passed');
