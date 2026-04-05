/**
 * Achievement definitions and checker.
 *
 * All public functions accept optional userId for multi-user isolation.
 */

import {
  getAchievementState, getStat, getStatArray, getGameState,
  isAchievementUnlocked, markAchievementUnlocked, awardXp,
  getCurrentUserId,
} from './db.js';
import { broadcast } from './websocket.js';
import { XP_REWARDS } from './levelSystem.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type AchievementCategory = 'resources' | 'workers' | 'crafting' | 'nodes' | 'chips' | 'secret';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  secret: boolean;
  check: () => boolean;
  progress?: () => { current: number; target: number };
}

// ── Definitions ─────────────────────────────────────────────────────────────

export const ACHIEVEMENTS: AchievementDef[] = [
  // Resources
  { id: 'first_data', name: 'First Byte', description: 'Deposit your first data', category: 'resources', secret: false,
    check: () => getStat('total_data_deposited') >= 1 },
  { id: 'data_1000', name: 'Kilobyte Club', description: 'Deposit 1,000 data', category: 'resources', secret: false,
    check: () => getStat('total_data_deposited') >= 1000,
    progress: () => ({ current: getStat('total_data_deposited'), target: 1000 }) },
  { id: 'data_10000', name: 'Megabyte Mogul', description: 'Deposit 10,000 data', category: 'resources', secret: false,
    check: () => getStat('total_data_deposited') >= 10000,
    progress: () => ({ current: getStat('total_data_deposited'), target: 10000 }) },
  { id: 'first_rp', name: 'Eureka', description: 'Earn your first Research Point', category: 'resources', secret: false,
    check: () => getStat('total_rp_deposited') >= 1 },
  { id: 'rp_50', name: 'Researcher', description: 'Earn 50 Research Points', category: 'resources', secret: false,
    check: () => getStat('total_rp_deposited') >= 50,
    progress: () => ({ current: getStat('total_rp_deposited'), target: 50 }) },

  // Workers
  { id: 'first_deploy', name: 'Hello World', description: 'Deploy your first worker', category: 'workers', secret: false,
    check: () => getStat('total_workers_deployed') >= 1 },
  { id: 'deploy_5', name: 'Workforce', description: 'Deploy 5 workers', category: 'workers', secret: false,
    check: () => getStat('total_workers_deployed') >= 5,
    progress: () => ({ current: getStat('total_workers_deployed'), target: 5 }) },
  { id: 'deploy_20', name: 'Swarm Intelligence', description: 'Deploy 20 workers', category: 'workers', secret: false,
    check: () => getStat('total_workers_deployed') >= 20,
    progress: () => ({ current: getStat('total_workers_deployed'), target: 20 }) },
  { id: 'first_mine', name: 'Pickaxe Ready', description: 'Mine a resource node', category: 'workers', secret: false,
    check: () => getStat('total_mines') >= 1 },
  { id: 'mine_50', name: 'Strip Miner', description: 'Mine 50 times', category: 'workers', secret: false,
    check: () => getStat('total_mines') >= 50,
    progress: () => ({ current: getStat('total_mines'), target: 50 }) },
  { id: 'first_repair', name: 'Virus Purge', description: 'Repair an infected node', category: 'workers', secret: false,
    check: () => getStat('total_repairs') >= 1 },

  // Crafting
  { id: 'first_craft', name: 'Tinker', description: 'Craft any item', category: 'crafting', secret: false,
    check: () => getStat('total_crafts') >= 1 },
  { id: 'craft_5', name: 'Artisan', description: 'Craft 5 items', category: 'crafting', secret: false,
    check: () => getStat('total_crafts') >= 5,
    progress: () => ({ current: getStat('total_crafts'), target: 5 }) },
  { id: 'craft_diamond', name: 'Diamond Hands', description: 'Craft a Diamond Pickaxe', category: 'crafting', secret: false,
    check: () => getStatArray('crafted_recipes').includes('pickaxe_diamond') },
  { id: 'craft_all', name: 'Master Crafter', description: 'Craft every recipe at least once', category: 'crafting', secret: true,
    check: () => getStatArray('crafted_recipes').length >= 5,
    progress: () => ({ current: getStatArray('crafted_recipes').length, target: 5 }) },

  // Nodes
  { id: 'first_unlock', name: 'Expanding Horizons', description: 'Unlock a node', category: 'nodes', secret: false,
    check: () => getStat('total_nodes_unlocked') >= 1 },
  { id: 'unlock_all', name: 'Full Map', description: 'Unlock all nodes', category: 'nodes', secret: false,
    check: () => getStat('total_nodes_unlocked') >= 40,
    progress: () => ({ current: getStat('total_nodes_unlocked'), target: 40 }) },
  { id: 'first_upgrade', name: 'Level Up', description: 'Upgrade a node', category: 'nodes', secret: false,
    check: () => getStat('total_upgrades') >= 1 },
  { id: 'max_upgrade', name: 'Overclocked', description: 'Max out a node upgrade', category: 'nodes', secret: false,
    check: () => getStat('max_node_level') >= 3 },

  // Chips
  { id: 'first_pack', name: 'Gacha Beginner', description: 'Open a chip pack', category: 'chips', secret: false,
    check: () => getStat('total_packs_opened') >= 1 },
  { id: 'packs_10', name: 'Pack Rat', description: 'Open 10 chip packs', category: 'chips', secret: false,
    check: () => getStat('total_packs_opened') >= 10,
    progress: () => ({ current: getStat('total_packs_opened'), target: 10 }) },
  { id: 'first_rare', name: 'Blue Gleam', description: 'Obtain a rare chip', category: 'chips', secret: false,
    check: () => getStat('highest_rarity') >= 2 },
  { id: 'first_legendary', name: 'Jackpot', description: 'Obtain a legendary chip', category: 'chips', secret: false,
    check: () => getStat('highest_rarity') >= 3 },
  { id: 'first_install', name: 'Socketed', description: 'Install a chip into a node', category: 'chips', secret: false,
    check: () => getStat('total_chips_installed') >= 1 },

  // Puzzles
  { id: 'first_solve', name: 'Hello, Compute!', description: 'Solve your first compute puzzle', category: 'crafting', secret: false,
    check: () => getStat('total_puzzles_solved') >= 1 },
  { id: 'solve_10', name: 'Problem Solver', description: 'Solve 10 compute puzzles', category: 'crafting', secret: false,
    check: () => getStat('total_puzzles_solved') >= 10,
    progress: () => ({ current: getStat('total_puzzles_solved'), target: 10 }) },
  { id: 'solve_50', name: 'Leetcode Grinder', description: 'Solve 50 compute puzzles', category: 'crafting', secret: false,
    check: () => getStat('total_puzzles_solved') >= 50,
    progress: () => ({ current: getStat('total_puzzles_solved'), target: 50 }) },

  // Secret
  { id: 'spof', name: 'Single Point of Failure', description: 'Lose the game — the Hub was your only lifeline', category: 'secret', secret: true,
    check: () => getStat('total_game_overs') >= 1 },
  { id: 'speedrun', name: 'Speed Run', description: 'Reach 100 total deposits before tick 500', category: 'secret', secret: true,
    check: () => getStat('total_deposits') >= 100 && getGameState().tick < 500 },
  { id: 'full_clear', name: 'Completionist', description: 'Unlock all non-secret achievements', category: 'secret', secret: true,
    check: () => {
      const nonSecret = ACHIEVEMENTS.filter(a => !a.secret);
      return nonSecret.every(a => isAchievementUnlocked(a.id));
    }},
];

export const RARITY_ORDINAL: Record<string, number> = {
  common: 0, uncommon: 1, rare: 2, legendary: 3,
};

// ── Checker ─────────────────────────────────────────────────────────────────

/** Check all achievements, return newly unlocked ones, broadcast each. */
export function checkAchievements(userId?: string): AchievementDef[] {
  const effectiveUserId = userId || getCurrentUserId() || undefined;
  const newlyUnlocked: AchievementDef[] = [];

  for (const ach of ACHIEVEMENTS) {
    if (isAchievementUnlocked(ach.id, effectiveUserId)) continue;
    try {
      if (ach.check()) {
        markAchievementUnlocked(ach.id, effectiveUserId);
        awardXp(XP_REWARDS.unlock_achievement, effectiveUserId);
        newlyUnlocked.push(ach);
        broadcast({
          type: 'ACHIEVEMENT_UNLOCKED',
          payload: {
            id: ach.id,
            name: ach.name,
            description: ach.description,
            category: ach.category,
            secret: ach.secret,
          },
        }, effectiveUserId);
        console.log(`[Achievement] Unlocked: ${ach.name}`);
      }
    } catch {}
  }

  return newlyUnlocked;
}

/** Get full achievement list for API response. */
export function getAchievementList(userId?: string) {
  const effectiveUserId = userId || getCurrentUserId() || undefined;
  return ACHIEVEMENTS.map(a => {
    const unlocked = isAchievementUnlocked(a.id, effectiveUserId);
    return {
      id: a.id,
      name: a.secret && !unlocked ? '???' : a.name,
      description: a.secret && !unlocked ? 'Hidden achievement' : a.description,
      category: a.category,
      secret: a.secret,
      unlocked,
      unlockedAt: unlocked ? getAchievementState(effectiveUserId).unlocked[a.id] : null,
      progress: a.progress ? a.progress() : null,
    };
  });
}

/** Summary for broadcast payloads. */
export function getAchievementSummary(userId?: string) {
  const effectiveUserId = userId || getCurrentUserId() || undefined;
  const state = getAchievementState(effectiveUserId);
  return {
    unlocked: state.unlocked,
    stats: state.stats,
    totalUnlocked: Object.keys(state.unlocked).length,
    totalAchievements: ACHIEVEMENTS.length,
  };
}
