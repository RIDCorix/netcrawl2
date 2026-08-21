import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../packages/ui/src/components/ComputeLabScreen.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../packages/ui/src/styles.css', import.meta.url), 'utf8');
const locales = ['en', 'ja', 'zh-TW'].map(locale =>
  readFileSync(new URL(`../packages/ui/src/i18n/${locale}.ts`, import.meta.url), 'utf8'),
);

assert.match(screen, /role="dialog"/);
assert.match(screen, /aria-modal="true"/);
assert.match(screen, /compute-lab\/tasks/);
assert.match(screen, /data-testid="compute-lab-local-first"/);
assert.match(screen, /`problems\/\$\{sourceNode\.id\}\.py`/);
assert.match(screen, /readOnly value=\{localProblemPath\}/);
assert.match(screen, /uv run python \$\{localProblemPath\}/);
assert.match(screen, /compute_lab\.local_first\.limitation/);
assert.match(screen, /compute_lab\.local_first\.retry/);
assert.match(screen, /compute_lab\.local_first\.trace_view_only/);
assert.doesNotMatch(screen, /<textarea/);
assert.doesNotMatch(screen, /<EditorBridgePanel/);
assert.match(styles, /\.compute-lab-local-first/);
assert.match(styles, /var\(--bg-primary\)/);
assert.match(styles, /var\(--border-bright\)/);
assert.match(styles, /border-left: 2px solid var\(--accent\)/);
for (const locale of locales)
  for (const key of ['local_first.title', 'local_first.instructions', 'local_first.path', 'local_first.limitation', 'local_first.retry', 'local_first.trace_view_only'])
    assert.match(locale, new RegExp(`'compute_lab\\.${key.replace('.', '\\.')}':`));
console.log('Compute Lab local-first UI contract passed');
