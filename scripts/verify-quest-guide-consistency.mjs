import { readFileSync } from 'node:fs';

const definitions = readFileSync('packages/server/src/questDefinitions.ts', 'utf8');
const english = readFileSync('packages/server/src/questGuides.ts', 'utf8');
const traditionalChinese = readFileSync('packages/ui/src/i18n/guides/zh-TW.ts', 'utf8');
const uiEnglish = readFileSync('packages/ui/src/i18n/en.ts', 'utf8');
const uiJapanese = readFileSync('packages/ui/src/i18n/ja.ts', 'utf8');
const uiTraditionalChinese = readFileSync('packages/ui/src/i18n/zh-TW.ts', 'utf8');

const checks = [
  ['Conditions objective', definitions, /total_bad_data_discarded'[\s\S]{0,80}target: 100/],
  ['Conditions data objective', definitions, /total_data_deposited'[\s\S]{0,80}target: 1000\b/],
  ['Operators objective', definitions, /q_operators[\s\S]{0,600}total_puzzles_solved'[\s\S]{0,80}target: 1/],
  ['While Loop objective', definitions, /q_while_loop[\s\S]{0,500}total_data_deposited'[\s\S]{0,80}target: 2000\b/],
  ['English Conditions guide', english, /Discard \*\*100 bad data\*\*[\s\S]{0,80}Deposit \*\*1 kB data\*\*/],
  ['English Operators guide', english, /Operator Academy[\s\S]{0,200}1 compute puzzle/],
  ['English While Loop guide', english, /Deposit \*\*2 kB data total\*\*/],
  [
    'Traditional Chinese Conditions guide',
    traditionalChinese,
    /丟棄 \*\*100 個 bad data\*\*[\s\S]{0,80}\*\*1 kB data\*\*/,
  ],
  [
    'Traditional Chinese Operators guide',
    traditionalChinese,
    /Operator Academy[\s\S]{0,200}\*\*1 個 compute puzzle\*\*/,
  ],
  ['Traditional Chinese While Loop guide', traditionalChinese, /\*\*2 kB data\*\*/],
  ['Chapter 0 gate', definitions, /q_setup[\s\S]{0,400}prerequisites: \[\]/],
  ['First Craft exact recipe', definitions, /q_craft_first[\s\S]{0,500}stat_array_includes[\s\S]{0,100}pickaxe_basic/],
  ['Dot Notation removed from quest graph', definitions, /id: 'q_method_call'[\s\S]{0,1200}id: 'q_conditions'/],
  ['English new unlock label', uiEnglish, /'ui\.new_unlock': 'NEW!'/],
  ['Japanese new unlock label', uiJapanese, /'ui\.new_unlock': '新規!'/],
  ['Traditional Chinese new unlock label', uiTraditionalChinese, /'ui\.new_unlock': '新解鎖!'/],
];

const failures = checks.filter(([, source, pattern]) => !pattern.test(source));
if (failures.length) {
  for (const [name] of failures) console.error(`Quest guide drift: ${name}`);
  process.exit(1);
}
console.log(`Quest guide consistency: ${checks.length} checks passed`);
