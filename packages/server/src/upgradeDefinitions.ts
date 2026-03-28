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
  'resource:ore': [
    { level: 1, name: 'Reinforced Drill', description: '+2 ore production rate', cost: { ore: 50, energy: 30 }, effects: { rateBonus: 2 } },
    { level: 2, name: 'Deep Shaft', description: '+1 chip slot', cost: { ore: 100, energy: 60, data: 20 }, effects: { chipSlots: 2 } },
    { level: 3, name: 'Auto Extractor', description: 'Drops auto-deposit to hub', cost: { ore: 200, energy: 100, data: 50 }, effects: { autoCollect: true } },
  ],
  'resource:energy': [
    { level: 1, name: 'Capacitor Array', description: '+3 energy production rate', cost: { energy: 40, ore: 20 }, effects: { rateBonus: 3 } },
    { level: 2, name: 'Power Grid', description: '+1 chip slot', cost: { energy: 80, ore: 50 }, effects: { chipSlots: 2 } },
    { level: 3, name: 'Auto Siphon', description: 'Drops auto-deposit to hub', cost: { energy: 150, ore: 80, data: 30 }, effects: { autoCollect: true } },
  ],
  'resource:data': [
    { level: 1, name: 'Cache Expander', description: '+1 data production rate', cost: { data: 30, energy: 20 }, effects: { rateBonus: 1 } },
    { level: 2, name: 'Data Cluster', description: '+1 chip slot', cost: { data: 60, energy: 40 }, effects: { chipSlots: 2 } },
    { level: 3, name: 'Auto Sync', description: 'Drops auto-deposit to hub', cost: { data: 120, energy: 80, ore: 40 }, effects: { autoCollect: true } },
  ],
  'relay': [
    { level: 1, name: 'Signal Amp', description: '+1 chip slot', cost: { energy: 30 }, effects: { chipSlots: 1 } },
    { level: 2, name: 'Fast Lane', description: 'Workers pass through 30% faster', cost: { energy: 60, ore: 30 }, effects: { moveSpeedMult: 0.7 } },
  ],
  'hub': [
    { level: 1, name: 'Expansion Bay', description: '+1 chip slot (total 2)', cost: { energy: 50, ore: 50, data: 50 }, effects: { chipSlots: 2 } },
    { level: 2, name: 'Command Center', description: '+2 chip slots (total 4), +1 defense', cost: { energy: 150, ore: 150, data: 150 }, effects: { chipSlots: 4, defenseBonus: 1 } },
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
    cost: { ore: 30, energy: 20 },
    chipCount: 3,
    rarityWeights: { common: 60, uncommon: 25, rare: 12, legendary: 3 },
  },
  {
    packType: 'chip_pack_premium',
    name: 'Premium Chip Pack',
    description: '5 random chips. Better odds for rare+.',
    cost: { ore: 80, energy: 50, data: 30 },
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
