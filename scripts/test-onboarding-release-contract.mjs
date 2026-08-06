import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translateWithFallback } from '../packages/ui/src/i18n/translateWithFallback.ts';
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
loadState = reduceChapterZeroLoad(loadState, { type: 'loaded', session: { stage: 'cold_open' } });
assert.equal(chapterZeroMustBlock(loadState), true, 'an incomplete authoritative session remains blocking');
loadState = reduceChapterZeroLoad(loadState, { type: 'loaded', session: { stage: 'complete' } });
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
const activeQuests = readFileSync('packages/ui/src/components/ActiveQuestsPanel.tsx', 'utf8');
const questTree = readFileSync('packages/ui/src/components/QuestTree.tsx', 'utf8');
assert.match(questDialog, /quest\.\$\{quest\.id\}\.name/);
assert.match(questDialog, /quest\.\$\{quest\.id\}\.objective\.\$\{obj\.id\}/);
assert.match(questDialog, /translateWithFallback/);
assert.match(activeQuests, /translateWithFallback\(t, `quest\.\$\{q\.id\}\.name`, q\.name\)/);
assert.match(activeQuests, /`quest\.\$\{q\.id\}\.objective\.\$\{obj\.id\}`/);
assert.match(questTree, /translateWithFallback\(t, `quest\.\$\{q\.id\}\.name`, q\.name\)/);
assert.match(questTree, /translateWithFallback\(t, `quest\.\$\{quest\.id\}\.name`, quest\.name\)/);
assert.match(questTree, /translateWithFallback\(t, `quest\.\$\{quest\.id\}\.desc`, quest\.description\)/);
assert.match(questTree, /`quest\.\$\{quest\.id\}\.objective\.\$\{obj\.id\}`/);
const translationFallback = readFileSync('packages/ui/src/i18n/translateWithFallback.ts', 'utf8');
assert.match(
  translationFallback,
  /translated === key \? fallback : translated/,
  'missing keys must never render literally',
);
for (const status of ['available', 'completed']) {
  const copy = {
    'quest.q_craft_first.name': `${status} localized name`,
    'quest.q_craft_first.objective.o1': `${status} localized objective`,
  };
  const translate = key => copy[key] ?? key;
  assert.equal(
    translateWithFallback(translate, 'quest.q_craft_first.name', 'First Craft'),
    copy['quest.q_craft_first.name'],
  );
  assert.equal(
    translateWithFallback(translate, 'quest.q_craft_first.objective.o1', 'Craft a Basic Pickaxe'),
    copy['quest.q_craft_first.objective.o1'],
  );
}
assert.equal(
  translateWithFallback(key => key, 'quest.unknown.name', 'Server fallback'),
  'Server fallback',
);
assert.match(questDialog, /openWikiPreview\(quest\.manualEntryId\)/);
assert.match(wiki, /previewEntryId === selectedEntryId \|\| unlockedFn/);
assert.match(wiki, /previewEntryId === selectedEntryId\) return/, 'preview must not mark seen or grant rewards');

for (const locale of ['en', 'zh-TW', 'ja']) {
  const source = readFileSync(`packages/ui/src/i18n/${locale}.ts`, 'utf8');
  for (const quest of chapterOne) {
    assert.ok(source.includes(`'quest.${quest.id}.name'`), `${locale} missing quest.${quest.id}.name`);
    assert.ok(source.includes(`'quest.${quest.id}.desc'`), `${locale} missing quest.${quest.id}.desc`);
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

// ── Chapter Zero v3 stage/machine surface ──────────────────────────────────
const chapterZeroRepl = readFileSync('packages/ui/src/components/ChapterZeroRepl.tsx', 'utf8');
assert.match(chapterZeroRepl, /'\/api\/tutorial\/chapter-zero\/command'/);
assert.match(chapterZeroRepl, /'\/api\/tutorial\/chapter-zero\/stage'/);
assert.match(chapterZeroRepl, /action: 'advance'/);
assert.match(chapterZeroRepl, /action: 'code-run'/);
const chapterZeroGraph = readFileSync('packages/ui/src/components/chapter0/ChapterZeroGraph.tsx', 'utf8');
assert.match(chapterZeroGraph, /from '\.\.\/graph\/nodes\/HubNode'/);
assert.match(chapterZeroGraph, /from '\.\.\/graph\/nodes\/ResourceNode'/);
assert.match(chapterZeroGraph, /from '\.\.\/graph\/nodes\/SimpleNodes'/);
assert.doesNotMatch(chapterZeroGraph, /useGameStore/, 'tutorial graph must not subscribe to the game store');
const dialogueHook = readFileSync('packages/ui/src/components/chapter0/useChapterZeroDialogue.ts', 'utf8');
assert.match(dialogueHook, /export function useChapterZeroDialogue/);
assert.doesNotMatch(dialogueHook, /setInterval\(/, 'no auto-advance interval');
const codeEditor = readFileSync('packages/ui/src/components/chapter0/ChapterZeroCodeEditor.tsx', 'utf8');
assert.match(codeEditor, /on_startup/);
assert.match(codeEditor, /on_loop/);

// Plain global styles.css must not use CSS-Modules `:global(...)` — silently drops the rule.
const chapterStyles = readFileSync('packages/ui/src/styles.css', 'utf8');
assert.doesNotMatch(chapterStyles, /:global\(/, 'plain styles.css cannot use CSS-Modules `:global(...)` selectors');

for (const locale of ['en', 'zh-TW', 'ja']) {
  const source = readFileSync(`packages/ui/src/i18n/${locale}.ts`, 'utf8');
  for (const key of [
    'tutorial.chapter_zero.cold_open.L1',
    'tutorial.chapter_zero.cold_open.L2',
    'tutorial.chapter_zero.cold_open.L3',
    'tutorial.chapter_zero.voice_arrival.L1',
    'tutorial.chapter_zero.voice_arrival.pickup_cta',
    'tutorial.chapter_zero.choice_intro.prompt',
    'tutorial.chapter_zero.choice_intro.choice_cold',
    'tutorial.chapter_zero.choice_intro.choice_confused',
    'tutorial.chapter_zero.choice_intro.choice_curious',
    'tutorial.chapter_zero.choice_intro.ack_1',
    'tutorial.chapter_zero.direct_commands.hint_move_L1',
    'tutorial.chapter_zero.direct_commands.hint_move_L3',
    'tutorial.chapter_zero.direct_commands.hint_collect_L1',
    'tutorial.chapter_zero.code_editor.intro_L1',
    'tutorial.chapter_zero.code_editor.outro_L1',
    'tutorial.chapter_zero.code_editor.fail_stuck_at_mine',
    'tutorial.chapter_zero.code_editor.fail_no_deposit',
    'tutorial.chapter_zero.code_editor.fail_syntax',
    'tutorial.chapter_zero.code_editor.fail_unknown_ref',
  ])
    assert.ok(source.includes(`'${key}'`), `${locale} missing ${key}`);
}

console.log('Onboarding release contract checks passed');
