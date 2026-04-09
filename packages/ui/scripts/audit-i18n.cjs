/**
 * Unified i18n audit script for NetCrawl2.
 *
 * Scans server source files to extract all translatable content IDs,
 * then checks that every required key exists in all 3 language files.
 *
 * Content types:
 *   - Items (ITEM_LABELS + RECIPES)
 *   - Quests (questDefinitions.ts)
 *   - Achievements (achievements.ts)
 *   - Chapters (CHAPTER_NAMES)
 *   - Chips (upgradeDefinitions.ts)
 *   - Nodes (INITIAL_NODES + LAYER_1_INITIAL_NODES)
 *   - UI strings (cross-language completeness)
 *
 * Usage: node packages/ui/scripts/audit-i18n.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

// ── Language files ──────────────────────────────────────────────────────────

const LANG_FILES = [
  { path: 'packages/ui/src/i18n/en.ts', lang: 'en' },
  { path: 'packages/ui/src/i18n/zh-TW.ts', lang: 'zh-TW' },
  { path: 'packages/ui/src/i18n/ja.ts', lang: 'ja' },
];

/** Parse a TS i18n file and extract all keys from the Record<string, string> */
function parseI18nKeys(filePath) {
  const abs = path.join(ROOT, filePath);
  if (!fs.existsSync(abs)) return new Set();
  const content = fs.readFileSync(abs, 'utf-8');
  const keys = new Set();
  // Match lines like:  'some.key': 'value',  or  'some.key': "value",
  const re = /^\s*'([^']+)'\s*:/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

// ── Server source readers ───────────────────────────────────────────────────

function readServerFile(relativePath) {
  const abs = path.join(ROOT, relativePath);
  if (!fs.existsSync(abs)) {
    console.log(`  [warn] File not found: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(abs, 'utf-8');
}

// ── Content extractors ──────────────────────────────────────────────────────

function extractItemTypes() {
  // Hardcoded list matching ITEM_LABELS + RECIPES + unique equipment
  // We parse from RECIPES in db.ts and ITEM_LABELS in colors.ts
  const types = new Set();

  // From colors.ts ITEM_LABELS
  const colorsContent = readServerFile('packages/ui/src/constants/colors.ts');
  const labelRe = /(\w+)\s*:/g;
  const labelBlock = colorsContent.match(/ITEM_LABELS[^{]*\{([^}]+)\}/s);
  if (labelBlock) {
    let m;
    while ((m = labelRe.exec(labelBlock[1])) !== null) {
      types.add(m[1]);
    }
  }

  // From db.ts RECIPES
  const dbContent = readServerFile('packages/server/src/db.ts');
  const recipeIdRe = /id:\s*'(\w+)'/g;
  const recipesBlock = dbContent.match(/RECIPES:\s*Recipe\[\]\s*=\s*\[([\s\S]*?)^\];/m);
  if (recipesBlock) {
    let m;
    while ((m = recipeIdRe.exec(recipesBlock[1])) !== null) {
      types.add(m[1]);
    }
  }

  // Unique equipment from questDefinitions
  const questContent = readServerFile('packages/server/src/questDefinitions.ts');
  const uniqueRe = /itemType:\s*'(\w+)'/g;
  let m;
  while ((m = uniqueRe.exec(questContent)) !== null) {
    types.add(m[1]);
  }

  // Drop item types
  types.add('data_fragment');
  types.add('rp_shard');
  types.add('bad_data');

  return Array.from(types).sort();
}

function extractQuestIds() {
  const content = readServerFile('packages/server/src/questDefinitions.ts');
  const ids = [];
  const re = /id:\s*'(q_\w+)'/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    ids.push(m[1]);
  }
  return [...new Set(ids)].sort();
}

function extractAchievementIds() {
  const content = readServerFile('packages/server/src/achievements.ts');
  const ids = [];
  const re = /id:\s*'(\w+)'/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    ids.push(m[1]);
  }
  return [...new Set(ids)].sort();
}

function extractChapterNumbers() {
  const content = readServerFile('packages/server/src/questDefinitions.ts');
  const nums = new Set();
  const re = /CHAPTER_NAMES[^{]*\{([^}]+)\}/s;
  const block = content.match(re);
  if (block) {
    const numRe = /(\d+)\s*:/g;
    let m;
    while ((m = numRe.exec(block[1])) !== null) {
      nums.add(parseInt(m[1]));
    }
  }
  return Array.from(nums).sort((a, b) => a - b);
}

function extractChipTypes() {
  const content = readServerFile('packages/server/src/upgradeDefinitions.ts');
  const types = [];
  const re = /chipType:\s*'(\w+)'/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    types.push(m[1]);
  }
  return [...new Set(types)].sort();
}

function extractNodeLabels() {
  const labels = new Set();

  // From db.ts INITIAL_NODES — look for label in helper calls and inline data
  const dbContent = readServerFile('packages/server/src/db.ts');
  // Helper calls: R('Label', ...), C('Label', ...), Y('Label', ...), E('Label', ...), P('Label', ...), MC('Label', ...), AU('Label', ...)
  const helperRe = /(?:R|C|Y|E|P|MC|AU)\s*\(\s*'([^']+)'/g;
  let m;
  while ((m = helperRe.exec(dbContent)) !== null) {
    labels.add(m[1]);
  }
  // Hub inline
  const hubRe = /label:\s*'([^']+)'/g;
  while ((m = hubRe.exec(dbContent)) !== null) {
    labels.add(m[1]);
  }

  // From layerDefinitions.ts
  const layerContent = readServerFile('packages/server/src/layerDefinitions.ts');
  const layerHelperRe = /(?:R1|C1|Y1|P1|A1|E1)\s*\(\s*'([^']+)'/g;
  while ((m = layerHelperRe.exec(layerContent)) !== null) {
    labels.add(m[1]);
  }
  const layerLabelRe = /label:\s*'([^']+)'/g;
  while ((m = layerLabelRe.exec(layerContent)) !== null) {
    labels.add(m[1]);
  }

  return Array.from(labels).sort();
}

// ── Main audit ──────────────────────────────────────────────────────────────

function main() {
  console.log('=== NetCrawl i18n Audit ===\n');

  // Parse all language files
  const langKeys = {};
  for (const { path: fp, lang } of LANG_FILES) {
    langKeys[lang] = parseI18nKeys(fp);
    console.log(`  ${lang}: ${langKeys[lang].size} keys`);
  }
  console.log('');

  // Build expected keys per content type
  const contentTypes = [];

  // 1. Items
  const itemTypes = extractItemTypes();
  const itemKeys = [];
  for (const t of itemTypes) {
    itemKeys.push(`item.${t}.name`);
    itemKeys.push(`item.${t}.desc`);
  }
  contentTypes.push({ name: 'Items', keys: itemKeys, count: itemTypes.length });

  // 2. Quests
  const questIds = extractQuestIds();
  const questKeys = [];
  for (const id of questIds) {
    questKeys.push(`quest.${id}.name`);
    questKeys.push(`quest.${id}.desc`);
  }
  contentTypes.push({ name: 'Quests', keys: questKeys, count: questIds.length });

  // 3. Achievements (keyed as ach.{id}.name / ach.{id}.desc in i18n)
  const achIds = extractAchievementIds();
  const achKeys = [];
  for (const id of achIds) {
    achKeys.push(`ach.${id}.name`);
    achKeys.push(`ach.${id}.desc`);
  }
  contentTypes.push({ name: 'Achievements', keys: achKeys, count: achIds.length });

  // 4. Chapters
  const chapterNums = extractChapterNumbers();
  const chapterKeys = [];
  for (const n of chapterNums) {
    chapterKeys.push(`chapter.${n}.name`);
  }
  contentTypes.push({ name: 'Chapters', keys: chapterKeys, count: chapterNums.length });

  // 5. Chips
  const chipTypes = extractChipTypes();
  const chipKeys = [];
  for (const t of chipTypes) {
    chipKeys.push(`chip.${t}.name`);
  }
  contentTypes.push({ name: 'Chips', keys: chipKeys, count: chipTypes.length });

  // 6. Nodes
  const nodeLabels = extractNodeLabels();
  const nodeKeys = [];
  for (const label of nodeLabels) {
    nodeKeys.push(`n.${label}`);
  }
  contentTypes.push({ name: 'Nodes', keys: nodeKeys, count: nodeLabels.length });

  // Audit each content type per language
  let totalMissing = 0;
  const missingByLang = {};
  for (const { lang } of LANG_FILES) missingByLang[lang] = [];

  for (const ct of contentTypes) {
    console.log(`--- ${ct.name} (${ct.count} entries, ${ct.keys.length} keys) ---`);

    for (const { lang } of LANG_FILES) {
      const keys = langKeys[lang];
      const missing = ct.keys.filter(k => !keys.has(k));
      if (missing.length > 0) {
        console.log(`  ${lang}: ${missing.length} missing`);
        for (const k of missing) {
          console.log(`    - '${k}'`);
          missingByLang[lang].push(k);
        }
        totalMissing += missing.length;
      } else {
        console.log(`  ${lang}: OK`);
      }
    }
    console.log('');
  }

  // 7. UI string completeness — check that every key in en.ts exists in other languages
  console.log('--- UI String Completeness ---');
  const enKeys = langKeys['en'];
  for (const { lang } of LANG_FILES) {
    if (lang === 'en') continue;
    const keys = langKeys[lang];
    const missing = [];
    for (const k of enKeys) {
      if (!keys.has(k)) {
        missing.push(k);
      }
    }
    if (missing.length > 0) {
      console.log(`  ${lang}: ${missing.length} keys missing vs en.ts`);
      // Only print first 20 to avoid noise
      const show = missing.slice(0, 20);
      for (const k of show) {
        console.log(`    - '${k}'`);
        missingByLang[lang].push(k);
      }
      if (missing.length > 20) {
        console.log(`    ... and ${missing.length - 20} more`);
        // Still add to total
        for (const k of missing.slice(20)) {
          missingByLang[lang].push(k);
        }
      }
      totalMissing += missing.length;
    } else {
      console.log(`  ${lang}: OK`);
    }
  }
  console.log('');

  // Summary
  console.log('=== Summary ===');
  for (const { lang } of LANG_FILES) {
    const unique = [...new Set(missingByLang[lang])];
    console.log(`  ${lang}: ${unique.length} missing keys`);
  }
  console.log(`  Total: ${totalMissing} missing key-language pairs`);

  if (totalMissing > 0) {
    console.log('\nRun `node packages/ui/scripts/fix-i18n.cjs` to auto-add placeholders.');
    process.exit(1);
  } else {
    console.log('\nAll i18n keys present in all languages!');
  }
}

main();
