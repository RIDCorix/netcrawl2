import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../packages/ui/src/components/ComputeLabScreen.tsx', import.meta.url), 'utf8');
const bridge = readFileSync(
  new URL('../packages/ui/src/components/computeLab/EditorBridgePanel.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(new URL('../packages/ui/src/styles.css', import.meta.url), 'utf8');
const locales = ['en', 'ja', 'zh-TW'].map(locale =>
  readFileSync(new URL(`../packages/ui/src/i18n/${locale}.ts`, import.meta.url), 'utf8'),
);

assert.match(screen, /role="dialog"/);
assert.match(screen, /aria-modal="true"/);
assert.match(screen, /compute-lab\/tasks/);
assert.match(screen, /compute-lab-mission/);
assert.match(screen, /compute-lab-solution/);
assert.match(bridge, /data-testid="compute-lab-run-solution"/);
assert.match(screen, /import \{ EditorBridgePanel \}/);
assert.match(screen, /<EditorBridgePanel/);
assert.match(bridge, /problem-status/);
assert.doesNotMatch(screen, /uv run python/);
assert.match(screen, /compute_lab\.trace/);
assert.match(screen, /compute-lab-play/);
assert.match(screen, /compute-lab-pace/);
assert.match(screen, /<LoopTracks/);
assert.match(screen, /<VariableBoxes/);
assert.doesNotMatch(screen, /<textarea/);
assert.match(styles, /\.compute-lab-workspace/);
assert.match(styles, /\.compute-lab-solution/);
assert.match(styles, /\.compute-lab-editor-details/);
assert.match(styles, /var\(--bg-primary\)/);
assert.match(styles, /var\(--border-bright\)/);
assert.match(styles, /border-left: 2px solid var\(--accent\)/);
for (const locale of locales)
  for (const key of [
    'mission.title',
    'solution.title',
    'solution.run',
    'editor.connection',
    'editor.running',
    'outcome_elapsed',
  ])
    assert.match(locale, new RegExp(`'compute_lab\\.${key.replace('.', '\\.')}':`));
console.log('Compute Lab mission, solution, and preserved visualization contract passed');
