/**
 * Scans ITEM_LABELS and RECIPES from the server/UI to find all registered
 * item types, then checks each i18n file for missing keys.
 *
 * Usage: node packages/ui/scripts/gen-item-i18n-keys.cjs
 */

const ALL_ITEM_TYPES = [
  'pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond',
  'shield', 'beacon',
  'data_fragment', 'rp_shard', 'bad_data',
  'chip_pack_basic', 'chip_pack_premium',
  'scanner', 'signal_booster', 'overclock_kit',
  'antivirus_module', 'memory_allocator', 'fullstack_pickaxe',
  'cpu_basic', 'cpu_advanced',
  'ram_basic', 'ram_advanced',
];

const REQUIRED_SUFFIXES = ['.name', '.desc'];

const LANG_FILES = [
  { path: 'packages/ui/src/i18n/en.ts', lang: 'en' },
  { path: 'packages/ui/src/i18n/zh-TW.ts', lang: 'zh-TW' },
  { path: 'packages/ui/src/i18n/ja.ts', lang: 'ja' },
];

const fs = require('fs');
const path = require('path');

let totalMissing = 0;

for (const { path: filePath, lang } of LANG_FILES) {
  const absPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    console.log(`⚠ File not found: ${filePath}`);
    continue;
  }
  const content = fs.readFileSync(absPath, 'utf-8');
  const missing = [];

  for (const type of ALL_ITEM_TYPES) {
    for (const suffix of REQUIRED_SUFFIXES) {
      const key = `item.${type}${suffix}`;
      if (!content.includes(`'${key}'`)) {
        missing.push(key);
      }
    }
  }

  if (missing.length > 0) {
    console.log(`\n❌ ${lang} (${filePath}) — ${missing.length} missing keys:`);
    for (const key of missing) {
      console.log(`  '${key}': '',`);
    }
    totalMissing += missing.length;
  } else {
    console.log(`✅ ${lang} — all item keys present`);
  }
}

if (totalMissing > 0) {
  console.log(`\n⚠ Total missing: ${totalMissing} keys`);
  process.exit(1);
} else {
  console.log('\n✅ All item i18n keys present in all languages');
}
