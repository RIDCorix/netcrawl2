import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build, stop } from '../packages/ui/node_modules/esbuild/lib/main.js';

const outDir = new URL('../packages/ui/.test-dist', import.meta.url).pathname;
const outfile = `${outDir}/assignment-transfer.mjs`;
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

try {
  await build({
    entryPoints: [new URL('../packages/ui/src/components/computeLab/stageModel.ts', import.meta.url).pathname],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
  });
  const { assignmentTransferAt } = await import(pathToFileURL(outfile));
  const format = value => JSON.stringify(value);
  const location = (start, end) => ({ lineno: 1, col_offset: start, end_lineno: 1, end_col_offset: end });

  const literalSource = 'a = 1 + 3';
  const literalFrames = [
    {
      sequence: 0,
      kind: 'value',
      source: '1 + 3',
      location: location(4, 9),
      locals: {},
      value: 4,
      detail: { references: [] },
    },
    {
      sequence: 1,
      kind: 'binding',
      source: literalSource,
      location: location(0, literalSource.length),
      locals: { a: 4 },
      changed: ['a'],
      detail: { bindings: { a: 4 } },
    },
  ];
  assert.deepEqual(assignmentTransferAt(literalFrames, 1, literalSource, format), {
    source: literalSource,
    evaluationSource: '1 + 3',
    evaluatedValue: '4',
    references: [],
    targets: [{ name: 'a', value: '4' }],
  });

  const copySource = 'a = b';
  const copyFrames = [
    { sequence: 0, kind: 'step', source: 'before', location: location(0, 1), locals: { b: 7 } },
    {
      sequence: 1,
      kind: 'value',
      source: 'b',
      location: location(4, 5),
      locals: { b: 7 },
      value: 7,
      detail: { references: [{ name: 'b', location: location(4, 5) }] },
    },
    {
      sequence: 2,
      kind: 'binding',
      source: copySource,
      location: location(0, copySource.length),
      locals: { b: 7, a: 7 },
      changed: ['a'],
      detail: { bindings: { a: 7 } },
    },
  ];
  assert.deepEqual(assignmentTransferAt(copyFrames, 2, copySource, format)?.references, [{ name: 'b', value: '7' }]);

  const stringSource = 'a = "b"';
  const stringFrames = [
    { sequence: 0, kind: 'step', source: 'before', location: location(0, 1), locals: { b: 7 } },
    {
      sequence: 1,
      kind: 'value',
      source: '"b"',
      location: location(4, 7),
      locals: { b: 7 },
      value: 'b',
      detail: { references: [] },
    },
    {
      sequence: 2,
      kind: 'binding',
      source: stringSource,
      location: location(0, stringSource.length),
      locals: { b: 7, a: 'b' },
      changed: ['a'],
      detail: { bindings: { a: 'b' } },
    },
  ];
  assert.deepEqual(
    assignmentTransferAt(stringFrames, 2, stringSource, format)?.references,
    [],
    'identifier-looking string content is not semantic evidence of a variable read',
  );

  const unicodeSource = '結果 = 起點';
  const unicodeFrames = [
    { sequence: 0, kind: 'step', source: 'before', location: location(0, 1), locals: { 起點: 9 } },
    {
      sequence: 1,
      kind: 'value',
      source: '起點',
      location: location(9, 15),
      locals: { 起點: 9 },
      value: 9,
      detail: { references: [{ name: '起點', location: location(9, 15) }] },
    },
    {
      sequence: 2,
      kind: 'binding',
      source: unicodeSource,
      location: location(0, 15),
      locals: { 起點: 9, 結果: 9 },
      changed: ['結果'],
      detail: { bindings: { 結果: 9 } },
    },
  ];
  assert.deepEqual(assignmentTransferAt(unicodeFrames, 2, unicodeSource, format)?.references, [
    { name: '起點', value: '9' },
  ]);

  const nestedSource = 'a = (b + 1) * 2';
  const nestedFrames = [
    { sequence: 0, kind: 'step', location: location(0, 1), locals: { b: 7 } },
    {
      sequence: 1,
      kind: 'value',
      source: 'b + 1',
      location: location(5, 10),
      locals: { b: 7 },
      value: 8,
      detail: { references: [{ name: 'b', location: location(5, 6) }] },
    },
    {
      sequence: 2,
      kind: 'value',
      source: '(b + 1) * 2',
      location: location(4, 15),
      locals: { b: 7 },
      value: 16,
      detail: { references: [{ name: 'b', location: location(5, 6) }] },
    },
    {
      sequence: 3,
      kind: 'binding',
      source: nestedSource,
      location: location(0, nestedSource.length),
      locals: { b: 7, a: 16 },
      changed: ['a'],
      detail: { bindings: { a: 16 } },
    },
  ];
  assert.equal(assignmentTransferAt(nestedFrames, 3, nestedSource, format)?.evaluationSource, '(b + 1) * 2');
  assert.equal(
    assignmentTransferAt([{ ...nestedFrames[3], location: undefined }], 0, nestedSource, format),
    null,
    'missing source evidence degrades to the static stage',
  );
} finally {
  stop();
  await rm(outDir, { recursive: true, force: true });
}

console.log('Trace-derived assignment transfer contract passed.');
