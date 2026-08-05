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
const wikiContent = readFileSync('packages/ui/src/wiki/content.ts', 'utf8');
assert.match(wikiContent, /id: 'pickaxe_basic'[\s\S]{0,500}unlock: \{ unlockedRecipe: 'pickaxe_basic' \}/);
const questDialog = readFileSync('packages/ui/src/components/QuestGuideDialog.tsx', 'utf8');
assert.match(questDialog, /quest\.\$\{quest\.id\}\.name/);
assert.match(questDialog, /quest\.\$\{quest\.id\}\.objective\.\$\{obj\.id\}/);
assert.match(questDialog, /translated === key \? fallback : translated/, 'missing keys must never render literally');
assert.match(questDialog, /openWikiPreview\(quest\.manualEntryId\)/);
assert.match(wiki, /previewEntryId === selectedEntryId \|\| unlockedFn/);
assert.match(wiki, /previewEntryId === selectedEntryId\) return/, 'preview must not mark seen or grant rewards');

for (const locale of ['en', 'zh-TW', 'ja']) {
  const source = readFileSync(`packages/ui/src/i18n/${locale}.ts`, 'utf8');
  for (const quest of chapterOne) {
    assert.ok(source.includes(`'quest.${quest.id}.name'`), `${locale} missing quest.${quest.id}.name`);
    for (const objective of quest.objectives) {
      const key = `quest.${quest.id}.objective.${objective.id}`;
      assert.ok(source.includes(`'${key}'`), `${locale} missing ${key}`);
    }
  }
  for (const key of [
    'tutorial.chapter_zero.loading',
    'tutorial.chapter_zero.load_error',
    'tutorial.chapter_zero.retry',
    'wiki.invalid_entry.title',
    'wiki.invalid_entry.body',
    'wiki.invalid_entry.action',
    'quest.q_craft_first.objective.o1',
    'tutorial.chapter_zero.worker_ready',
  ])
    assert.ok(source.includes(`'${key}'`), `${locale} missing ${key}`);
  const guidePath = locale === 'en' ? 'packages/server/src/questGuides.ts' : `packages/ui/src/i18n/guides/${locale}.ts`;
  assert.ok(readFileSync(guidePath, 'utf8').includes('q_craft_first'), `${locale} missing localized First Craft guide`);
}

console.log('Onboarding release contract checks passed');
