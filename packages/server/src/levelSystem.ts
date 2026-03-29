/**
 * Player Level System
 *
 * XP is earned from all game actions. Leveling up grants FLOP capacity,
 * worker slots, passive effects, recipe unlocks, and titles.
 *
 * Max level: 30
 */

// ── XP Table ────────────────────────────────────────────────────────────────

/** XP required to reach level N (from level N-1) */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level, 1.6));
}

/** Cumulative XP required to reach level N */
export function cumulativeXpForLevel(level: number): number {
  let total = 0;
  for (let i = 2; i <= level; i++) {
    total += xpForLevel(i);
  }
  return total;
}

export const MAX_LEVEL = 30;

// ── XP Rewards per Action ───────────────────────────────────────────────────

export const XP_REWARDS: Record<string, number> = {
  deploy_worker: 50,
  mine_node: 15,
  deposit_resources: 5,
  unlock_node: 100,
  claim_quest_ch1: 100,
  claim_quest_ch2: 150,
  claim_quest_ch3: 200,
  claim_quest_ch4: 250,
  claim_quest_ch5: 300,
  claim_quest_ch6: 350,
  claim_quest_ch7: 400,
  claim_quest_ch8: 500,
  unlock_achievement: 150,
  solve_puzzle_easy: 30,
  solve_puzzle_medium: 60,
  solve_puzzle_hard: 120,
  complete_api_request: 40,
  craft_item: 50,
  build_structure: 150,
  upgrade_node: 80,
  open_chip_pack: 25,
  install_chip: 20,
  repair_infection: 40,
};

// ── Level Titles ────────────────────────────────────────────────────────────

export interface LevelTitle {
  level: number;
  title: string;
  titleZh: string;
}

export const LEVEL_TITLES: LevelTitle[] = [
  { level: 1,  title: 'Script Kiddie',       titleZh: '腳本小子' },
  { level: 3,  title: 'Junior Dev',           titleZh: '初級開發者' },
  { level: 5,  title: 'Network Technician',   titleZh: '網路技術員' },
  { level: 8,  title: 'Developer',            titleZh: '開發者' },
  { level: 10, title: 'System Admin',         titleZh: '系統管理員' },
  { level: 13, title: 'DevOps',               titleZh: 'DevOps 工程師' },
  { level: 15, title: 'Network Engineer',     titleZh: '網路工程師' },
  { level: 18, title: 'Staff Engineer',       titleZh: '資深工程師' },
  { level: 20, title: 'Senior Architect',     titleZh: '高級架構師' },
  { level: 23, title: 'Principal',            titleZh: '首席工程師' },
  { level: 25, title: 'Distinguished',        titleZh: '傑出工程師' },
  { level: 28, title: 'Fellow',               titleZh: '院士級工程師' },
  { level: 30, title: 'Network Master',       titleZh: '網路大師' },
];

/** Get the current title for a given level */
export function getTitleForLevel(level: number): LevelTitle {
  let best = LEVEL_TITLES[0];
  for (const t of LEVEL_TITLES) {
    if (t.level <= level) best = t;
  }
  return best;
}

// ── Milestone Rewards ───────────────────────────────────────────────────────

export type MilestoneRewardKind =
  | { kind: 'flop_bonus'; value: number }
  | { kind: 'max_workers_bonus'; value: number }
  | { kind: 'passive'; effectId: string; description: string; effect: Record<string, number> }
  | { kind: 'recipe_unlock'; recipeId: string; name: string }
  | { kind: 'items'; items: Array<{ itemType: string; count: number }> };

export interface MilestoneReward {
  level: number;
  rewards: MilestoneRewardKind[];
}

/**
 * Every level grants +3 FLOP.
 * Milestone levels grant additional bonuses.
 */
export const MILESTONE_REWARDS: MilestoneReward[] = [
  {
    level: 3,
    rewards: [
      { kind: 'max_workers_bonus', value: 1 },
    ],
  },
  {
    level: 5,
    rewards: [
      { kind: 'recipe_unlock', recipeId: 'scanner', name: 'Scanner' },
      { kind: 'passive', effectId: 'level_harvest_5', description: '+5% harvest speed (Level 5)', effect: { harvest_speed_mult: 0.05 } },
    ],
  },
  {
    level: 8,
    rewards: [
      { kind: 'max_workers_bonus', value: 1 },
    ],
  },
  {
    level: 10,
    rewards: [
      { kind: 'passive', effectId: 'level_defense_1', description: '+1 global defense (Level 10)', effect: { defense_bonus: 1 } },
      { kind: 'recipe_unlock', recipeId: 'overclock_kit', name: 'Overclock Kit' },
      { kind: 'flop_bonus', value: 20 },
    ],
  },
  {
    level: 13,
    rewards: [
      { kind: 'max_workers_bonus', value: 1 },
    ],
  },
  {
    level: 15,
    rewards: [
      { kind: 'passive', effectId: 'level_unlock_discount', description: '-10% node unlock cost (Level 15)', effect: { unlock_cost_mult: -0.10 } },
      { kind: 'recipe_unlock', recipeId: 'signal_booster', name: 'Signal Booster' },
      { kind: 'flop_bonus', value: 20 },
    ],
  },
  {
    level: 18,
    rewards: [
      { kind: 'max_workers_bonus', value: 1 },
    ],
  },
  {
    level: 20,
    rewards: [
      { kind: 'passive', effectId: 'level_harvest_15', description: '+15% harvest speed (Level 20)', effect: { harvest_speed_mult: 0.15 } },
      { kind: 'recipe_unlock', recipeId: 'antivirus_module', name: 'Antivirus Module' },
      { kind: 'flop_bonus', value: 30 },
    ],
  },
  {
    level: 23,
    rewards: [
      { kind: 'max_workers_bonus', value: 1 },
    ],
  },
  {
    level: 25,
    rewards: [
      { kind: 'passive', effectId: 'level_defense_2', description: '+2 global defense (Level 25)', effect: { defense_bonus: 2 } },
      { kind: 'passive', effectId: 'level_unlock_discount_2', description: '-15% node unlock cost (Level 25)', effect: { unlock_cost_mult: -0.15 } },
      { kind: 'flop_bonus', value: 30 },
    ],
  },
  {
    level: 28,
    rewards: [
      { kind: 'max_workers_bonus', value: 1 },
    ],
  },
  {
    level: 30,
    rewards: [
      { kind: 'passive', effectId: 'level_harvest_25', description: '+25% harvest speed (Level 30)', effect: { harvest_speed_mult: 0.25 } },
      { kind: 'flop_bonus', value: 50 },
      { kind: 'items', items: [{ itemType: 'chip_pack_premium', count: 3 }] },
    ],
  },
];

/** Get milestone reward for a specific level (if any) */
export function getMilestoneForLevel(level: number): MilestoneReward | undefined {
  return MILESTONE_REWARDS.find(m => m.level === level);
}

/** Get all milestones up to (and including) a given level */
export function getMilestonesUpToLevel(level: number): MilestoneReward[] {
  return MILESTONE_REWARDS.filter(m => m.level <= level);
}

// ── Level State ─────────────────────────────────────────────────────────────

export interface LevelState {
  level: number;
  xp: number;              // current XP within this level
  totalXp: number;         // lifetime XP earned
  maxWorkersBonus: number;  // extra worker slots from leveling
  flopBonus: number;        // extra FLOP from leveling
  claimedMilestones: number[]; // levels whose milestones have been applied
}

export const INITIAL_LEVEL_STATE: LevelState = {
  level: 1,
  xp: 0,
  totalXp: 0,
  maxWorkersBonus: 0,
  flopBonus: 0,
  claimedMilestones: [],
};

// ── Level Calculation ───────────────────────────────────────────────────────

export interface LevelUpResult {
  newState: LevelState;
  levelsGained: number;
  newMilestones: MilestoneReward[];
}

/**
 * Grant XP and calculate level ups.
 * Returns the new state plus any milestones that need to be applied.
 */
export function grantXp(state: LevelState, amount: number): LevelUpResult {
  let { level, xp, totalXp, maxWorkersBonus, flopBonus, claimedMilestones } = { ...state };
  claimedMilestones = [...claimedMilestones];

  xp += amount;
  totalXp += amount;
  let levelsGained = 0;
  const newMilestones: MilestoneReward[] = [];

  // Level up loop
  while (level < MAX_LEVEL) {
    const needed = xpForLevel(level + 1);
    if (xp < needed) break;
    xp -= needed;
    level++;
    levelsGained++;

    // Base reward: +3 FLOP per level
    flopBonus += 3;

    // Check milestone
    const milestone = getMilestoneForLevel(level);
    if (milestone && !claimedMilestones.includes(level)) {
      claimedMilestones.push(level);
      newMilestones.push(milestone);

      // Apply numeric bonuses immediately
      for (const reward of milestone.rewards) {
        if (reward.kind === 'flop_bonus') flopBonus += reward.value;
        if (reward.kind === 'max_workers_bonus') maxWorkersBonus += reward.value;
      }
    }
  }

  // Cap XP at max level
  if (level >= MAX_LEVEL) {
    xp = 0;
  }

  return {
    newState: { level, xp, totalXp, maxWorkersBonus, flopBonus, claimedMilestones },
    levelsGained,
    newMilestones,
  };
}

// ── Summary for UI ──────────────────────────────────────────────────────────

export interface LevelSummary {
  level: number;
  xp: number;
  xpToNext: number;
  totalXp: number;
  title: string;
  titleZh: string;
  maxLevel: number;
  maxWorkersBonus: number;
  flopBonus: number;
  milestones: Array<{
    level: number;
    rewards: MilestoneRewardKind[];
    claimed: boolean;
  }>;
}

export function getLevelSummary(state: LevelState): LevelSummary {
  const title = getTitleForLevel(state.level);
  return {
    level: state.level,
    xp: state.xp,
    xpToNext: state.level >= MAX_LEVEL ? 0 : xpForLevel(state.level + 1),
    totalXp: state.totalXp,
    title: title.title,
    titleZh: title.titleZh,
    maxLevel: MAX_LEVEL,
    maxWorkersBonus: state.maxWorkersBonus,
    flopBonus: state.flopBonus,
    milestones: MILESTONE_REWARDS.map(m => ({
      level: m.level,
      rewards: m.rewards,
      claimed: state.claimedMilestones.includes(m.level),
    })),
  };
}
