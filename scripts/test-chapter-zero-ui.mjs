import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync('packages/ui/src/components/chapter0/ChapterZeroCodeEditor.tsx', 'utf8');
const repl = readFileSync('packages/ui/src/components/ChapterZeroRepl.tsx', 'utf8');
const styles = readFileSync('packages/ui/src/styles.css', 'utf8');
const nodeWrapper = readFileSync('packages/ui/src/components/graph/NodeWrapper.tsx', 'utf8');
const zhTW = readFileSync('packages/ui/src/i18n/zh-TW.ts', 'utf8');

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
assert.doesNotMatch(
  styles,
  /\.chapter0-coldopen-fading\s*\{[^}]*opacity:\s*0/s,
  'cold-open fade must not make the opaque overlay transparent',
);
assert.match(
  styles,
  /\.chapter0-coldopen-fading\s*>\s*\*\s*\{[^}]*opacity:\s*0/s,
  'cold-open fade must target scene content only',
);
assert.match(
  styles,
  /\.chapter0-voicearrival\.chapter0-screen-fading\s*\{[^}]*opacity:\s*1/s,
  'voice-arrival fade must keep its black overlay opaque',
);
assert.match(
  styles,
  /\.chapter0-voicearrival\.chapter0-screen-fading\s*>\s*\*\s*\{[^}]*opacity:\s*0/s,
  'voice-arrival fade must target scene content only',
);
assert.match(
  nodeWrapper,
  /data-tutorial-target=\{nodeId\}/,
  'map nodes must expose a stable tutorial target marker',
);
assert.match(
  styles,
  /\.chapter0-target-hub[\s\S]*\[data-tutorial-target='hub'\]/,
  'deploy tutorial must style the stable Hub target marker',
);
assert.match(
  styles,
  /\.chapter0-target-hub \.react-flow__renderer\s*\{[^}]*z-index:\s*91/s,
  'deploy tutorial must lift the React Flow renderer above the dimmer',
);
const deployCopy = zhTW.slice(
  zhTW.indexOf("'tutorial.chapter_zero.deploy.hub_prompt'"),
  zhTW.indexOf("'tutorial.chapter_zero.deploy.edge_selecting'"),
);
assert.match(deployCopy, /高亮的基地/,'zh-TW deploy prompt must use the localized map term');
assert.doesNotMatch(deployCopy, /Hub/, 'zh-TW deploy copy must not use the English Hub label');

console.log('Chapter Zero UI structure, highlight, transition, and playback contracts passed');
