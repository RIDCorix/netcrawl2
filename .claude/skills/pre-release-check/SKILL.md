---
name: pre-release-check
description: Run all pre-release checks before deploying
---

# Pre-Release Checklist

Run the following checks before deploying:

1. **i18n audit** -- all translatable keys must exist in all 3 languages
2. **Server build** -- `pnpm --filter @netcrawl/server build`
3. **UI build** -- `pnpm --filter ui build`

## Commands to run

```bash
# 1. i18n audit
node packages/ui/scripts/audit-i18n.cjs

# 2. Auto-fix missing translations (if audit found issues)
node packages/ui/scripts/fix-i18n.cjs

# 3. Server type check + build
cd packages/server && npx tsc --noEmit

# 4. UI type check
cd packages/ui && npx tsc --noEmit

# 5. Git status -- commit any auto-generated translations
git add -A && git status
```

## Workflow

1. Run `node packages/ui/scripts/audit-i18n.cjs` first.
2. If missing keys are found, run `node packages/ui/scripts/fix-i18n.cjs` to auto-add placeholders.
3. For en.ts placeholders: verify the English text is correct.
4. For zh-TW.ts and ja.ts: search for `[TODO]` entries and either translate them manually or ask Claude to translate them.
5. Run the audit again to verify all keys are present.
6. Run server and UI builds to confirm no TypeScript errors.
7. Commit the changes.

## Content types audited

- **Items**: `item.{type}.name`, `item.{type}.desc` -- from ITEM_LABELS + RECIPES
- **Quests**: `quest.{id}.name`, `quest.{id}.desc` -- from questDefinitions.ts
- **Achievements**: `ach.{id}.name`, `ach.{id}.desc` -- from achievements.ts
- **Chapters**: `chapter.{n}.name` -- from CHAPTER_NAMES
- **Chips**: `chip.{type}.name` -- from upgradeDefinitions.ts CHIP_DEFS
- **Nodes**: `n.{label}` -- from INITIAL_NODES + LAYER_1_INITIAL_NODES
- **UI strings**: cross-language completeness check (en vs zh-TW, en vs ja)
