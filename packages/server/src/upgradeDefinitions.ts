/**
 * Static definitions for node upgrades, chip catalog, and chip packs.
 * All balance tuning goes here.
 */

import { RecipeCost } from './db.js';

// ── Node Upgrades ───────────────────────────────────────────────────────────

export interface UpgradeEffect {
  rateBonus?: number;      // +N to resource rate
  chipSlots?: number;      // set chip slots to this value
  autoCollect?: boolean;   // auto-deposit drops
  defenseBonus?: number;   // reduces infection spread chance
  moveSpeedMult?: number;  // workers pass through faster
}

export interface UpgradeLevel {
  level: number;
  name: string;
  description: string;
  cost: RecipeCost;
  effects: UpgradeEffect;
}

// Keyed by node type, then by resource subtype for resource nodes
export const NODE_UPGRADE_DEFS: Record<string, UpgradeLevel[]> = {
  'resource:data': [
    { level: 1, name: 'Cache Expander', description: '+1 data production rate', cost: { data: 300, rp: 2 }, effects: { rateBonus: 1 } },
    { level: 2, name: 'Data Cluster', description: '+1 chip slot', cost: { data: 1000, rp: 8 }, effects: { chipSlots: 2 } },
    { level: 3, name: 'Auto Sync', description: 'Drops auto-deposit to hub', cost: { data: 5000, rp: 25 }, effects: { autoCollect: true } },
  ],
  'relay': [
    { level: 1, name: 'Signal Amp', description: '+1 chip slot', cost: { data: 500 }, effects: { chipSlots: 1 } },
    { level: 2, name: 'Fast Lane', description: 'Workers pass through 30% faster', cost: { data: 1500, rp: 5 }, effects: { moveSpeedMult: 0.7 } },
  ],
  'hub': [
    { level: 1, name: 'Expansion Bay', description: '+1 chip slot (total 2)', cost: { data: 2000, rp: 10 }, effects: { chipSlots: 2 } },
    { level: 2, name: 'Command Center', description: '+2 chip slots (total 4), +1 defense', cost: { data: 8000, rp: 30 }, effects: { chipSlots: 4, defenseBonus: 1 } },
  ],
};

/** Get the upgrade key for a node */
export function getUpgradeKey(nodeType: string, resourceSubtype?: string): string {
  if (nodeType === 'resource' && resourceSubtype) return `resource:${resourceSubtype}`;
  return nodeType;
}

// ── Chip Catalog ────────────────────────────────────────────────────────────

export type ChipRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface ChipDef {
  chipType: string;
  name: string;
  description: string;
  rarity: ChipRarity;
  effect: { type: string; value: number };
}

export const CHIP_DEFS: ChipDef[] = [
  // Common
  { chipType: 'harvest_speed_1', name: 'Speed Chip I', description: '+20% harvest speed', rarity: 'common', effect: { type: 'harvest_speed_mult', value: 1.2 } },
  { chipType: 'defense_1', name: 'Firewall Chip I', description: '+1 infection resistance', rarity: 'common', effect: { type: 'defense', value: 1 } },
  { chipType: 'move_speed_1', name: 'Router Chip I', description: '-20% travel time', rarity: 'common', effect: { type: 'move_speed_mult', value: 0.8 } },

  // Uncommon
  { chipType: 'harvest_speed_2', name: 'Speed Chip II', description: '+40% harvest speed', rarity: 'uncommon', effect: { type: 'harvest_speed_mult', value: 1.4 } },
  { chipType: 'production_rate_1', name: 'Yield Chip I', description: '+1 resource rate', rarity: 'uncommon', effect: { type: 'production_rate', value: 1 } },
  { chipType: 'capacity_1', name: 'Buffer Chip', description: '+10 worker carry capacity', rarity: 'uncommon', effect: { type: 'capacity_bonus', value: 10 } },

  // Rare
  { chipType: 'defense_2', name: 'Firewall Chip II', description: '+3 infection resistance', rarity: 'rare', effect: { type: 'defense', value: 3 } },
  { chipType: 'production_rate_2', name: 'Yield Chip II', description: '+2 resource rate', rarity: 'rare', effect: { type: 'production_rate', value: 2 } },
  { chipType: 'harvest_speed_3', name: 'Speed Chip III', description: '+60% harvest speed', rarity: 'rare', effect: { type: 'harvest_speed_mult', value: 1.6 } },

  // Legendary
  { chipType: 'auto_repair', name: 'Nanite Core', description: 'Auto-repairs infection in 30s', rarity: 'legendary', effect: { type: 'auto_repair', value: 30 } },
  { chipType: 'overclock', name: 'Overclock Module', description: '+100% harvest speed', rarity: 'legendary', effect: { type: 'harvest_speed_mult', value: 2.0 } },
];

// ── Chip Packs ──────────────────────────────────────────────────────────────

export interface ChipPackDef {
  packType: string;
  name: string;
  description: string;
  cost: RecipeCost;
  chipCount: number;
  rarityWeights: Record<ChipRarity, number>;
}

export const CHIP_PACK_DEFS: ChipPackDef[] = [
  {
    packType: 'chip_pack_basic',
    name: 'Basic Chip Pack',
    description: '3 random chips. Mostly common.',
    cost: { data: 500 },
    chipCount: 3,
    rarityWeights: { common: 60, uncommon: 25, rare: 12, legendary: 3 },
  },
  {
    packType: 'chip_pack_premium',
    name: 'Premium Chip Pack',
    description: '5 random chips. Better odds for rare+.',
    cost: { data: 2000, rp: 5 },
    chipCount: 5,
    rarityWeights: { common: 35, uncommon: 35, rare: 22, legendary: 8 },
  },
];

// ── Rarity helpers ──────────────────────────────────────────────────────────

export const RARITY_COLORS: Record<ChipRarity, string> = {
  common: '#9ca3af',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  legendary: '#f59e0b',
};

/** Weighted random rarity selection */
export function rollRarity(weights: Record<ChipRarity, number>): ChipRarity {
  const entries = Object.entries(weights) as [ChipRarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [rarity, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'common';
}

/** Roll a random chip from the catalog */
export function rollChip(weights: Record<ChipRarity, number>): ChipDef {
  const rarity = rollRarity(weights);
  const pool = CHIP_DEFS.filter(c => c.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Base chip slots per node type ───────────────────────────────────────────

export const BASE_CHIP_SLOTS: Record<string, number> = {
  hub: 1,
  resource: 1,
  relay: 0,
  locked: 0,
  infected: 0,
};

// ── Node XP System ─────────────────────────────────────────────────────────
// Each node gains XP through interactions specific to its type.
// When nodeXp >= nodeXpToNext, the upgrade button unlocks (still costs resources).

/**
 * XP required for a node to be ready for upgrade to the given level.
 * Scales per level so later upgrades need more usage.
 */
export const NODE_XP_THRESHOLDS: Record<string, number[]> = {
  // [xpForLv1, xpForLv2, xpForLv3]
  'resource:data': [100, 300, 800],
  'relay':         [80, 250],
  'hub':           [150, 500],
};

/** XP granted per action, keyed by node type */
export const NODE_XP_PER_ACTION: Record<string, Record<string, number>> = {
  'resource:data': {
    mine: 8,        // worker mines this node
    harvest: 3,     // manual gather from UI
  },
  'relay': {
    pass_through: 5,  // worker moves through this relay
  },
  'hub': {
    deposit: 4,       // worker deposits resources here
  },
  'compute': {
    solve_puzzle: 15,  // worker solves a puzzle here
  },
  'cache': {
    cache_hit: 3,      // cache get/set used
  },
  'api': {
    complete_request: 10, // API request completed
  },
};

/** Get XP threshold for a node at a given upgrade level */
export function getNodeXpThreshold(upgradeKey: string, targetLevel: number): number {
  const thresholds = NODE_XP_THRESHOLDS[upgradeKey];
  if (!thresholds || targetLevel < 1 || targetLevel > thresholds.length) return 0;
  return thresholds[targetLevel - 1];
}

/** Get XP per action for a node type + action */
export function getNodeXpForAction(upgradeKey: string, action: string): number {
  return NODE_XP_PER_ACTION[upgradeKey]?.[action] || NODE_XP_PER_ACTION[upgradeKey.split(':')[0]]?.[action] || 0;
}
