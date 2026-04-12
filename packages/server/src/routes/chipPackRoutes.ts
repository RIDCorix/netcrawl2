/**
 * Chip pack & achievement routes.
 */

import { Router, Request, Response } from 'express';
import type { Chip } from '../types.js';
import { getGameState, saveGameState } from '../domain/gameState.js';
import { getPlayerInventory, addToPlayerInventory, removeFromPlayerInventory } from '../domain/inventory.js';
import { getPlayerChips, addPlayerChip } from '../domain/chips.js';
import { incrementStat, setStatMax } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import { CHIP_PACK_DEFS, rollChip } from '../upgradeDefinitions.js';
import { checkCost, deductCost } from '../stateHelpers.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { checkAchievements, getAchievementList, RARITY_ORDINAL } from '../achievements.js';
import { checkQuests } from '../quests.js';
import { XP_REWARDS } from '../levelSystem.js';
import { getUserId } from './helpers.js';

export const chipPackRoutes = Router();

chipPackRoutes.post('/chip-pack/buy', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { packType } = req.body;
  const packDef = CHIP_PACK_DEFS.find(p => p.packType === packType);
  if (!packDef) return res.status(400).json({ error: 'Unknown pack type' });

  const state = getGameState(uid);
  const resources = state.resources as unknown as Record<string, number>;

  const costError = checkCost(resources, packDef.cost as Record<string, number>);
  if (costError) return res.status(400).json({ error: costError });
  const newResources = deductCost(resources, packDef.cost as Record<string, number>);

  addToPlayerInventory(packType, 1, undefined, uid);
  saveGameState({ ...state, resources: newResources as any }, uid);
  broadcastFullState(uid);
  res.json({ ok: true });
});

chipPackRoutes.post('/chip-pack/open', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { packType } = req.body;
  const packDef = CHIP_PACK_DEFS.find(p => p.packType === packType);
  if (!packDef) return res.status(400).json({ error: 'Unknown pack type' });

  if (!removeFromPlayerInventory(packType, 1, uid)) {
    return res.status(400).json({ error: 'No pack in inventory' });
  }

  const newChips: Chip[] = [];
  for (let i = 0; i < packDef.chipCount; i++) {
    const def = rollChip(packDef.rarityWeights);
    const chip: Chip = {
      id: `chip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${i}`,
      chipType: def.chipType,
      name: def.name,
      rarity: def.rarity,
      effect: { ...def.effect },
    };
    addPlayerChip(chip, uid);
    newChips.push(chip);
  }

  broadcastFullState(uid);
  incrementStat('total_packs_opened', 1, uid);
  awardXp(XP_REWARDS.open_chip_pack, uid);
  for (const c of newChips) {
    setStatMax('highest_rarity', RARITY_ORDINAL[c.rarity] ?? 0, uid);
  }
  checkAchievements(uid);
  checkQuests(uid);
  res.json({ ok: true, chips: newChips });
});

chipPackRoutes.get('/chip-packs', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const state = getGameState(uid);
  const resources = state.resources as unknown as Record<string, number>;

  const packs = CHIP_PACK_DEFS.map(p => ({
    ...p,
    affordable: Object.entries(p.cost).every(([k, v]) => (resources[k] || 0) >= (v as number)),
    owned: (getPlayerInventory(uid).find(i => i.itemType === p.packType)?.count) || 0,
  }));

  res.json({ packs, playerChips: getPlayerChips(uid) });
});

chipPackRoutes.get('/achievements', (req: Request, res: Response) => {
  const uid = getUserId(req);
  res.json({ achievements: getAchievementList(uid) });
});
