/**
 * Auto-fix missing i18n keys for NetCrawl2.
 *
 * For en.ts: uses the English name from server source as the value.
 * For zh-TW.ts / ja.ts: prefixes with [TODO] so translators know what to fill in.
 *
 * Usage: node packages/ui/scripts/fix-i18n.cjs
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

function readFile(relativePath) {
  const abs = path.join(ROOT, relativePath);
  if (!fs.existsSync(abs)) return '';
  return fs.readFileSync(abs, 'utf-8');
}

function parseI18nKeys(filePath) {
  const content = readFile(filePath);
  const keys = new Set();
  const re = /^\s*'([^']+)'\s*:/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

// ── Build English values lookup from server sources ─────────────────────────

function buildEnglishValues() {
  const values = {};

  // Quests
  const questContent = readFile('packages/server/src/questDefinitions.ts');
  const questRe = /\{\s*id:\s*'(q_\w+)'[^}]*?name:\s*'([^']+)'[^}]*?description:\s*'([^']*(?:\\.[^']*)*)'/gs;
  let m;
  while ((m = questRe.exec(questContent)) !== null) {
    values[`quest.${m[1]}.name`] = m[2];
    values[`quest.${m[1]}.desc`] = m[3].replace(/\\'/g, "'");
  }

  // Achievements
  const achContent = readFile('packages/server/src/achievements.ts');
  const achRe = /id:\s*'(\w+)',\s*name:\s*'([^']+)',\s*description:\s*'([^']*(?:\\.[^']*)*)'/g;
  while ((m = achRe.exec(achContent)) !== null) {
    values[`ach.${m[1]}.name`] = m[2];
    values[`ach.${m[1]}.desc`] = m[3].replace(/\\'/g, "'");
  }

  // Chapters
  const chapterRe = /CHAPTER_NAMES[^{]*\{([^}]+)\}/s;
  const chBlock = questContent.match(chapterRe);
  if (chBlock) {
    const lineRe = /(\d+)\s*:\s*'([^']+)'/g;
    while ((m = lineRe.exec(chBlock[1])) !== null) {
      values[`chapter.${m[1]}.name`] = m[2];
    }
  }

  // Chips
  const chipContent = readFile('packages/server/src/upgradeDefinitions.ts');
  const chipRe = /chipType:\s*'(\w+)',\s*name:\s*'([^']+)',\s*description:\s*'([^']+)'/g;
  while ((m = chipRe.exec(chipContent)) !== null) {
    values[`chip.${m[1]}.name`] = m[2];
    values[`chip.${m[1]}.desc`] = m[3];
  }

  // Items — from RECIPES in db.ts
  const dbContent = readFile('packages/server/src/db.ts');
  const recipeRe = /id:\s*'(\w+)',\s*\n\s*name:\s*'([^']+)',\s*\n\s*description:\s*'([^']+)'/g;
  while ((m = recipeRe.exec(dbContent)) !== null) {
    values[`item.${m[1]}.name`] = m[2];
    values[`item.${m[1]}.desc`] = m[3];
  }

  // Items — from ITEM_LABELS in colors.ts
  const colorsContent = readFile('packages/ui/src/constants/colors.ts');
  const labelBlock = colorsContent.match(/ITEM_LABELS[^{]*\{([^}]+)\}/s);
  if (labelBlock) {
    const labelRe = /(\w+)\s*:\s*'([^']+)'/g;
    while ((m = labelRe.exec(labelBlock[1])) !== null) {
      if (!values[`item.${m[1]}.name`]) values[`item.${m[1]}.name`] = m[2];
      if (!values[`item.${m[1]}.desc`]) values[`item.${m[1]}.desc`] = m[2]; // fallback
    }
  }

  // Items — unique equipment from quest rewards
  const uniqueRe = /kind:\s*'unique_equipment',\s*itemType:\s*'(\w+)',\s*name:\s*'([^']+)',\s*description:\s*'([^']+)'/g;
  while ((m = uniqueRe.exec(questContent)) !== null) {
    if (!values[`item.${m[1]}.name`]) values[`item.${m[1]}.name`] = m[2];
    if (!values[`item.${m[1]}.desc`]) values[`item.${m[1]}.desc`] = m[3];
  }

  // Drop items
  if (!values['item.data_fragment.name']) values['item.data_fragment.name'] = 'Data Fragment';
  if (!values['item.data_fragment.desc']) values['item.data_fragment.desc'] = 'Raw data mined from resource nodes. Deposit at Hub.';
  if (!values['item.rp_shard.name']) values['item.rp_shard.name'] = 'RP Shard';
  if (!values['item.rp_shard.desc']) values['item.rp_shard.desc'] = 'Research points from compute nodes. Deposit at Hub.';
  if (!values['item.bad_data.name']) values['item.bad_data.name'] = 'Bad Data';
  if (!values['item.bad_data.desc']) values['item.bad_data.desc'] = 'Corrupted data. Depositing SUBTRACTS resources! Discard it.';

  // Nodes — just use the label as the value
  const nodeLabels = new Set();
  // db.ts helpers
  const helperRe = /(?:^|\W)(?:R|C|Y|E|P|MC|AU)\s*\(\s*'([^']+)'/gm;
  while ((m = helperRe.exec(dbContent)) !== null) nodeLabels.add(m[1]);
  const hubRe = /label:\s*'([^']+)'/g;
  while ((m = hubRe.exec(dbContent)) !== null) nodeLabels.add(m[1]);
  // layerDefinitions.ts
  const layerContent = readFile('packages/server/src/layerDefinitions.ts');
  const layerHelperRe = /(?:R1|C1|Y1|P1|A1|E1)\s*\(\s*'([^']+)'/g;
  while ((m = layerHelperRe.exec(layerContent)) !== null) nodeLabels.add(m[1]);
  const layerLabelRe = /label:\s*'([^']+)'/g;
  while ((m = layerLabelRe.exec(layerContent)) !== null) nodeLabels.add(m[1]);
  for (const label of nodeLabels) {
    values[`n.${label}`] = label;
  }

  return values;
}

// ── Insert missing keys into a file ─────────────────────────────────────────

function insertMissingKeys(filePath, missingKeys, englishValues, lang) {
  const abs = path.join(ROOT, filePath);
  let content = fs.readFileSync(abs, 'utf-8');

  // Group missing keys by prefix for readability
  const entries = [];
  for (const key of missingKeys) {
    let value = englishValues[key] || key.split('.').pop() || key;
    // Escape single quotes in value
    value = value.replace(/'/g, "\\'");
    if (lang !== 'en') {
      value = `[TODO] ${value}`;
    }
    entries.push(`  '${key}': '${value}',`);
  }

  if (entries.length === 0) return 0;

  // Insert before the closing }
  const insertText = '\n  // === Auto-generated placeholders ===\n' + entries.join('\n') + '\n';

  // Find the last } that closes the export
  const lastBrace = content.lastIndexOf('}');
  if (lastBrace === -1) {
    console.log(`  [error] Could not find closing brace in ${filePath}`);
    return 0;
  }

  content = content.slice(0, lastBrace) + insertText + content.slice(lastBrace);
  fs.writeFileSync(abs, content, 'utf-8');
  return entries.length;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== NetCrawl i18n Auto-Fix ===\n');

  const englishValues = buildEnglishValues();

  // Parse en.ts to get the master key set
  const enKeys = parseI18nKeys(LANG_FILES[0].path);

  let totalFixed = 0;

  for (const { path: fp, lang } of LANG_FILES) {
    const existingKeys = parseI18nKeys(fp);

    // For en.ts: check against all expected keys from server sources
    // For others: check against en.ts keys
    let expectedKeys;
    if (lang === 'en') {
      expectedKeys = new Set(Object.keys(englishValues));
    } else {
      // Use en.ts keys as the expected set (union of en keys + server-derived keys)
      expectedKeys = new Set([...enKeys, ...Object.keys(englishValues)]);
    }

    const missing = [];
    for (const key of expectedKeys) {
      if (!existingKeys.has(key)) {
        missing.push(key);
      }
    }
    missing.sort();

    if (missing.length > 0) {
      const count = insertMissingKeys(fp, missing, englishValues, lang);
      console.log(`  ${lang}: added ${count} placeholder keys`);
      totalFixed += count;
    } else {
      console.log(`  ${lang}: no missing keys`);
    }
  }

  console.log(`\nTotal: ${totalFixed} placeholders added.`);
  if (totalFixed > 0) {
    console.log('Search for [TODO] in zh-TW.ts and ja.ts to find entries that need translation.');
  }
}

main();
