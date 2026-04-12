/**
 * Inventory & crafting routes.
 */

import { Router, Request, Response } from 'express';
import { RECIPES } from '../types.js';
import { getGameState, saveGameState } from '../domain/gameState.js';
import { getPlayerInventory, addToPlayerInventory } from '../domain/inventory.js';
import { getUnlockedRecipes } from '../domain/questState.js';
import { incrementStat, addToStatArray } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import { QUESTS } from '../questDefinitions.js';
import { checkCost, deductCost } from '../stateHelpers.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { checkAchievements } from '../achievements.js';
import { checkQuests } from '../quests.js';
import { XP_REWARDS } from '../levelSystem.js';
import { getUserId } from './helpers.js';

export const inventoryRoutes = Router();

inventoryRoutes.get('/inventory', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const inventory = getPlayerInventory(uid);
  res.json({ inventory, recipes: RECIPES });
});

inventoryRoutes.get('/recipes', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const state = getGameState(uid);
  const resources = state.resources as unknown as Record<string, number>;
  const unlockedIds = new Set(getUnlockedRecipes(uid));

  const unlockSources: Record<string, string> = {};
  for (const q of QUESTS) {
    for (const r of q.rewards) {
      if (r.kind === 'recipe_unlock') {
        if (!unlockSources[r.recipeId]) unlockSources[r.recipeId] = q.name;
      }
    }
  }

  const recipesWithState = RECIPES.map(recipe => {
    const affordable = Object.entries(recipe.cost).every(([resource, amount]) => {
      return (resources[resource] || 0) >= (amount as number);
    });
    const unlocked = unlockedIds.has(recipe.id);
    const unlockHint = unlocked ? undefined : unlockSources[recipe.id];
    return { ...recipe, affordable, unlocked, unlockHint };
  });
  res.json({ recipes: recipesWithState });
});

inventoryRoutes.post('/craft', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { recipeId } = req.body;
  const recipe = RECIPES.find(r => r.id === recipeId);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  const unlockedIds = new Set(getUnlockedRecipes(uid));
  if (!unlockedIds.has(recipeId)) {
    return res.status(403).json({ error: 'Recipe is locked', reason: 'recipe_locked' });
  }

  const state = getGameState(uid);
  const resources = state.resources as unknown as Record<string, number>;

  const costError = checkCost(resources, recipe.cost as Record<string, number>);
  if (costError) return res.status(400).json({ error: costError });
  const newResources = deductCost(resources, recipe.cost as Record<string, number>);

  addToPlayerInventory(recipe.output.itemType, recipe.output.count, recipe.output.metadata, uid);
  saveGameState({ ...state, resources: newResources as any }, uid);
  broadcastFullState(uid);

  incrementStat('total_crafts', 1, uid);
  addToStatArray('crafted_recipes', recipe.id, uid);
  awardXp(XP_REWARDS.craft_item, uid);
  checkAchievements(uid);
  checkQuests(uid);

  const inventory = getPlayerInventory(uid);
  const newItem = inventory.find(i => i.itemType === recipe.output.itemType);
  res.json({ ok: true, item: newItem, resources: newResources });
});
