import { ChipRarity } from '../store/gameStore';

// ── Quest chapters ──────────────────────────────────────────────────────────

export const CHAPTER_COLORS: Record<number, string> = {
  1: '#4ade80', 2: '#60a5fa', 3: '#a78bfa', 4: '#ef4444', 5: '#f59e0b', 6: '#00d4aa',
};

// ── Achievement categories ──────────────────────────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  all: 'var(--accent)',
  resources: '#4ade80',
  workers: '#60a5fa',
  crafting: '#f59e0b',
  nodes: '#a78bfa',
  chips: '#fbbf24',
  secret: '#ef4444',
};

// ── Worker class colors ─────────────────────────────────────────────────────

export const CLASS_COLORS: Record<string, string> = {
  Miner: '#fbbf24',
  Guardian: '#4ade80',
  Scout: '#60a5fa',
};

// ── Chip rarity ─────────────────────────────────────────────────────────────

export const RARITY_COLORS: Record<ChipRarity, string> = {
  common: '#9ca3af',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  legendary: '#f59e0b',
};

// ── Item config ─────────────────────────────────────────────────────────────

export const ITEM_LABELS: Record<string, string> = {
  pickaxe_basic: 'Basic Pickaxe', pickaxe_iron: 'Iron Pickaxe', pickaxe_diamond: 'Diamond Pickaxe',
  shield: 'Shield', beacon: 'Beacon',
  data_fragment: 'Data Fragment', rp_shard: 'RP Shard', bad_data: 'Bad Data',
  chip_pack_basic: 'Basic Pack', chip_pack_premium: 'Premium Pack',
  scanner: 'Scanner', signal_booster: 'Signal Booster', overclock_kit: 'Overclock Kit',
  antivirus_module: 'Antivirus Module', memory_allocator: 'Memory Allocator',
  fullstack_pickaxe: 'Fullstack Pickaxe',
  cpu_basic: 'CPU Module', cpu_advanced: 'CPU Module II',
  ram_basic: 'RAM Module', ram_advanced: 'RAM Module II',
};

export const ITEM_COLORS: Record<string, string> = {
  pickaxe_basic: '#9ca3af', pickaxe_iron: '#c0c0c0', pickaxe_diamond: '#60a5fa',
  shield: '#4ade80', beacon: '#00d4aa',
  data_fragment: '#45aaf2', rp_shard: '#a78bfa', bad_data: '#ef4444',
  chip_pack_basic: '#9ca3af', chip_pack_premium: '#f59e0b',
  cpu_basic: '#f59e0b', cpu_advanced: '#f97316',
  ram_basic: '#a78bfa', ram_advanced: '#8b5cf6',
};
