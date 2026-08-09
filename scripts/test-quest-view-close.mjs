import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gameStore = readFileSync('packages/ui/src/store/gameStore.ts', 'utf8');

assert.match(
  gameStore,
  /toggleQuests:\s*\(\)\s*=>\s*set\(state\s*=>\s*\(?\s*state\.questsOpen\s*\?\s*\{\s*questsOpen:\s*false,\s*selectedQuestId:\s*null\s*\}/s,
  'closing Quest View must atomically clear its selected quest modal state',
);

console.log('Quest View close contract: passed');
