import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync('packages/ui/src/components/chapter0/ChapterZeroCodeEditor.tsx', 'utf8');
const repl = readFileSync('packages/ui/src/components/ChapterZeroRepl.tsx', 'utf8');
const styles = readFileSync('packages/ui/src/styles.css', 'utf8');

assert.equal(
  (editor.match(/className="chapter0-editor-document"/g) ?? []).length,
  1,
  'editor must render one document',
);
for (const range of ['class', 'identity', 'edge', 'startup', 'loop']) {
  assert.ok(
    editor.includes(`range="${range}"`) || editor.includes(`data-code-range="${range}"`),
    `${range} must have a selectable code range`,
  );
}
assert.match(editor, /\{loopUnlocked && \(/, 'on_loop must remain absent before its checkpoint');
assert.match(editor, /MethodBody value=\{startup\}/, 'startup body must be editable inside the document');
assert.match(editor, /MethodBody value=\{loop\}/, 'loop body must be editable inside the document');

assert.match(repl, /for \(const tick of result\.ticks\)/, 'code-run ticks must be replayed in order');
assert.match(repl, /for \(const statement of tick\.statements\)/, 'statements must be replayed in order');
assert.match(repl, /setVisualWorkerAt\(/, 'playback must drive the visible worker position');
assert.ok(
  repl.indexOf('commitSession(result.session)') > repl.indexOf('for (const tick of result.ticks)'),
  'authoritative state must commit after playback',
);

assert.match(styles, /\.chapter0-screen-fading\s*\{[^}]*opacity:\s*0/s, 'screen fade-out must be defined');
assert.match(styles, /\.chapter0-stage-fade\s*\{[^}]*animation:/s, 'screen fade-in must be defined');
assert.match(styles, /prefers-reduced-motion:\s*reduce/, 'reduced motion must be supported');

console.log('Chapter Zero UI structure, highlight, transition, and playback contracts passed');
