import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTS } from '../packages/server/.test-dist/questDefinitions.js';
import {
  initialChapterZeroLoadState,
  reduceChapterZeroLoad,
  chapterZeroMustBlock,
} from '../packages/ui/.test-contract/chapterZeroLoadState.js';

let loadState = initialChapterZeroLoadState;
assert.equal(chapterZeroMustBlock(loadState), true, 'loading must keep the overlay blocking');
loadState = reduceChapterZeroLoad(loadState, { type: 'failed' });
assert.equal(chapterZeroMustBlock(loadState), true, 'load failure must keep the overlay blocking');
loadState = reduceChapterZeroLoad(loadState, { type: 'retry' });
assert.equal(loadState.status, 'loading');
loadState = reduceChapterZeroLoad(loadState, { type: 'loaded', session: { completed: false } });
assert.equal(chapterZeroMustBlock(loadState), true, 'an incomplete authoritative session remains blocking');
loadState = reduceChapterZeroLoad(loadState, { type: 'loaded', session: { completed: true } });
assert.equal(chapterZeroMustBlock(loadState), false, 'only authoritative completion releases the overlay');

const validWikiIds = new Set(['how-to-read', 'spec-node', 'resource', 'bad_data', 'spec-route', 'pickaxe_basic']);
const chapterOne = QUESTS.filter(quest => quest.chapter === 1);
assert.ok(chapterOne.length > 0);
for (const quest of chapterOne) {
  assert.ok(quest.manualEntryId, `${quest.id} must define a manual deep link`);
  assert.ok(validWikiIds.has(quest.manualEntryId), `${quest.id} links to unknown manual entry ${quest.manualEntryId}`);
}

const sidebar = readFileSync('packages/ui/src/components/ActiveQuestsPanel.tsx', 'utf8');
assert.match(sidebar, /q\.id !== 'q_ch1_challenge'/, 'challenge must be filtered from sidebar only');
const wiki = readFileSync('packages/ui/src/components/WikiDialog.tsx', 'utf8');
assert.match(wiki, /selectedEntryId && !selectedLookup/);
assert.match(wiki, /wiki\.invalid_entry\.action/);

for (const locale of ['en', 'zh-TW', 'ja']) {
  const source = readFileSync(`packages/ui/src/i18n/${locale}.ts`, 'utf8');
  for (const key of [
    'tutorial.chapter_zero.loading',
    'tutorial.chapter_zero.load_error',
    'tutorial.chapter_zero.retry',
    'wiki.invalid_entry.title',
    'wiki.invalid_entry.body',
    'wiki.invalid_entry.action',
  ])
    assert.ok(source.includes(`'${key}'`), `${locale} missing ${key}`);
}

console.log('Onboarding release contract checks passed');
