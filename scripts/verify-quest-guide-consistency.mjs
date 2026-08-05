import { readFileSync } from 'node:fs';

const definitions = readFileSync('packages/server/src/questDefinitions.ts', 'utf8');
const english = readFileSync('packages/server/src/questGuides.ts', 'utf8');
const traditionalChinese = readFileSync('packages/ui/src/i18n/guides/zh-TW.ts', 'utf8');

const checks = [
  ['Conditions objective', definitions, /total_bad_data_discarded'[\s\S]{0,80}target: 100/],
  ['Conditions data objective', definitions, /total_data_deposited'[\s\S]{0,80}target: 10000/],
  ['Operators objective', definitions, /q_operators[\s\S]{0,600}total_puzzles_solved'[\s\S]{0,80}target: 1/],
  ['While Loop objective', definitions, /q_while_loop[\s\S]{0,500}total_data_deposited'[\s\S]{0,80}target: 100000/],
  ['English Conditions guide', english, /Discard \*\*100 bad data\*\*[\s\S]{0,80}Deposit \*\*10 kB data\*\*/],
  ['English Operators guide', english, /Operator Academy[\s\S]{0,200}1 compute puzzle/],
  ['English While Loop guide', english, /Deposit \*\*100 kB data total\*\*/],
  [
    'Traditional Chinese Conditions guide',
    traditionalChinese,
    /丟棄 \*\*100 個 bad data\*\*[\s\S]{0,80}\*\*10 kB data\*\*/,
  ],
  [
    'Traditional Chinese Operators guide',
    traditionalChinese,
    /Operator Academy[\s\S]{0,200}\*\*1 個 compute puzzle\*\*/,
  ],
  ['Traditional Chinese While Loop guide', traditionalChinese, /\*\*100 kB data\*\*/],
];

const failures = checks.filter(([, source, pattern]) => !pattern.test(source));
if (failures.length) {
  for (const [name] of failures) console.error(`Quest guide drift: ${name}`);
  process.exit(1);
}
console.log(`Quest guide consistency: ${checks.length} checks passed`);
