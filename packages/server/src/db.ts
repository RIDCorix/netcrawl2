/**
 * Lightweight JSON-based persistence store.
 * Stores all game state in a single JSON file.
 * No native bindings needed.
 */

import path from 'path';
import fs from 'fs';
import { INITIAL_LEVEL_STATE, type LevelState, grantXp, getLevelSummary, type LevelSummary, type LevelUpResult } from './levelSystem.js';

const DATA_PATH = path.join(process.cwd(), 'data', 'netcrawl-state.json');

// Ensure data directory exists
const dataDir = path.dirname(DATA_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Resources {
  data: number;       // primary currency (bytes), mined from resource nodes
  rp: number;         // research points, from compute nodes
  credits: number;    // premium currency, from API nodes / quests
}

/** FLOP capacity — not a currency, but a limit on what can be built/deployed */
export interface FlopState {
  total: number;      // max FLOP (upgraded via Hub/Relay)
  used: number;       // currently allocated
}

export const FLOP_COSTS = {
  worker: 8,
  cache: 20,
  api: 25,
} as const;

export const INITIAL_FLOP: FlopState = { total: 50, used: 0 };

// === Drop System ===
export interface Drop {
  id: string;           // uuid
  type: 'data_fragment' | 'rp_shard';
  amount: number;
}

// === Player Inventory ===
export interface InventoryItem {
  id: string;
  itemType: 'pickaxe_basic' | 'pickaxe_iron' | 'pickaxe_diamond' | 'shield' | 'beacon' | 'data_fragment' | 'rp_shard' | 'chip_pack_basic' | 'chip_pack_premium' | 'scanner' | 'signal_booster' | 'overclock_kit' | 'antivirus_module' | 'memory_allocator' | 'fullstack_pickaxe';
  count: number;
  metadata?: {
    efficiency?: number;
  };
}

// === Chip System ===
export interface Chip {
  id: string;
  chipType: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  effect: { type: string; value: number };
}

export interface GameStateRow {
  nodes: any[];
  edges: any[];
  resources: Resources;
  flop: FlopState;
  tick: number;
  gameOver: boolean;
  playerInventory: InventoryItem[];
  playerChips: Chip[];
}

export interface WorkerRow {
  id: string;
  node_id: string;
  class_name: string;
  commit_hash: string;
  status: 'deploying' | 'running' | 'suspending' | 'suspended' | 'crashed' | 'error' | 'idle' | 'moving' | 'harvesting' | 'dead';
  current_node: string;
  carrying: Partial<Resources>;
  pid: number | null;
  deployed_at: string;
  holding: Drop | null;
  equippedPickaxe: { itemType: string; efficiency: number } | null;
}

export interface WorkerLogRow {
  id: number;
  worker_id: string;
  message: string;
  created_at: string;
}

// === Crafting Recipes ===
export interface RecipeCost {
  data?: number;
  rp?: number;
  credits?: number;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  output: { itemType: string; count: number; metadata?: { efficiency?: number } };
  cost: RecipeCost;
}

export const RECIPES: Recipe[] = [
  {
    id: 'pickaxe_basic',
    name: 'Basic Pickaxe',
    description: 'Standard mining tool. efficiency 1.0×',
    output: { itemType: 'pickaxe_basic', count: 1, metadata: { efficiency: 1.0 } },
    cost: { data: 200 },
  },
  {
    id: 'pickaxe_iron',
    name: 'Iron Pickaxe',
    description: 'Stronger pick. efficiency 1.5×. Yields 1-2 drops.',
    output: { itemType: 'pickaxe_iron', count: 1, metadata: { efficiency: 1.5 } },
    cost: { data: 500, rp: 5 },
  },
  {
    id: 'pickaxe_diamond',
    name: 'Diamond Pickaxe',
    description: 'Finest tool. efficiency 2.5×. Yields 2-3 drops.',
    output: { itemType: 'pickaxe_diamond', count: 1, metadata: { efficiency: 2.5 } },
    cost: { data: 2000, rp: 20 },
  },
  {
    id: 'shield',
    name: 'Shield',
    description: 'Protects worker from infection damage.',
    output: { itemType: 'shield', count: 1 },
    cost: { data: 300, rp: 3 },
  },
  {
    id: 'beacon',
    name: 'Beacon',
    description: 'Increases scan radius for workers.',
    output: { itemType: 'beacon', count: 1 },
    cost: { data: 500, rp: 8 },
  },
];

// === Quest System ===
export interface QuestState {
  questStatus: Record<string, 'locked' | 'available' | 'completed' | 'claimed'>;
  activePassives: Record<string, { description: string; effect: Record<string, number> }>;
  unlockedRecipes: string[];
  claimedAt: Record<string, string>;
}

// === Achievement System ===
export interface AchievementState {
  unlocked: Record<string, string>; // id -> ISO timestamp
  stats: Record<string, number>;
  statArrays: Record<string, string[]>;
}

interface Store {
  game_state: GameStateRow;
  workers: Record<string, WorkerRow>;
  worker_logs: WorkerLogRow[];
  next_log_id: number;
  achievement_state: AchievementState;
  quest_state: QuestState;
  level_state: import('./levelSystem.js').LevelState;
}

// ── Initial data ──────────────────────────────────────────────────────────────

// Helper to create typed node data
const R = (label: string, rate: number, cost: Record<string, number>) =>
  ({ label, resource: 'data' as const, rate, unlocked: false, unlockCost: cost, mineable: true, drops: [] as any[], mineCount: 0, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] });
const C = (label: string, diff: 'easy' | 'medium' | 'hard', cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, difficulty: diff, rewardResource: 'rp' as const, solveCount: 0, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] });
const Y = (label: string, cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] });
const E = (label: string, cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] });

export const INITIAL_NODES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Core
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'hub', type: 'hub', position: { x: 0, y: 0 }, data: { label: 'Hub', unlocked: true, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] } },

  // ═══════════════════════════════════════════════════════════════════════════
  // NORTH — Mining District (easy start, main data income)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'n_relay1', type: 'relay',    position: { x: 0,    y: -300 },  data: Y('Relay N1', { data: 50 }) },
  { id: 'n_mine1',  type: 'resource', position: { x: -250, y: -500 },  data: R('Data Mine Alpha', 50, { data: 100 }) },
  { id: 'n_mine2',  type: 'resource', position: { x: 250,  y: -500 },  data: R('Data Mine Beta', 40, { data: 150 }) },
  { id: 'n_relay2', type: 'relay',    position: { x: 0,    y: -700 },  data: Y('Relay N2', { data: 200 }) },
  { id: 'n_mine3',  type: 'resource', position: { x: -300, y: -900 },  data: R('Data Mine Gamma', 60, { data: 400 }) },
  { id: 'n_mine4',  type: 'resource', position: { x: 300,  y: -900 },  data: R('Data Mine Delta', 55, { data: 500 }) },
  { id: 'n_empty1', type: 'empty',    position: { x: 0,    y: -1000 }, data: E('Open Slot', { data: 800, rp: 3 }) },
  { id: 'n_deep1',  type: 'resource', position: { x: 0,    y: -1300 }, data: R('Deep Core Alpha', 100, { data: 2000, rp: 5 }) },
  { id: 'n_deep2',  type: 'resource', position: { x: -350, y: -1200 }, data: R('Deep Core Beta', 80, { data: 1500, rp: 3 }) },

  // ═══════════════════════════════════════════════════════════════════════════
  // NORTHEAST — Compute Cluster (research / RP income)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'ne_relay1', type: 'relay',    position: { x: 400,  y: -200 },  data: Y('Relay NE1', { data: 120 }) },
  { id: 'ne_comp1',  type: 'compute',  position: { x: 650,  y: -350 },  data: C('Compute C1', 'easy', { data: 300 }) },
  { id: 'ne_mine1',  type: 'resource', position: { x: 700,  y: -100 },  data: R('Data Silo East', 35, { data: 250 }) },
  { id: 'ne_relay2', type: 'relay',    position: { x: 950,  y: -250 },  data: Y('Relay NE2', { data: 600 }) },
  { id: 'ne_comp2',  type: 'compute',  position: { x: 1200, y: -400 },  data: C('Compute C2', 'medium', { data: 1000, rp: 5 }) },
  { id: 'ne_comp3',  type: 'compute',  position: { x: 1200, y: -100 },  data: C('Compute C3', 'medium', { data: 1200, rp: 8 }) },
  { id: 'ne_empty1', type: 'empty',    position: { x: 950,  y: -550 },  data: E('Open Slot', { data: 1500, rp: 5 }) },
  { id: 'ne_comp4',  type: 'compute',  position: { x: 1500, y: -250 },  data: C('Compute C4', 'hard', { data: 3000, rp: 15 }) },

  // ═══════════════════════════════════════════════════════════════════════════
  // EAST — Trade Route (mid-game expansion)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'e_relay1', type: 'relay',    position: { x: 450,  y: 100 },   data: Y('Relay E1', { data: 180 }) },
  { id: 'e_mine1',  type: 'resource', position: { x: 700,  y: 200 },   data: R('Data Mine Echo', 45, { data: 350 }) },
  { id: 'e_mine2',  type: 'resource', position: { x: 700,  y: -50 },   data: R('Data Vein East', 30, { data: 300 }) },
  { id: 'e_relay2', type: 'relay',    position: { x: 1000, y: 100 },   data: Y('Relay E2', { data: 800 }) },
  { id: 'e_empty1', type: 'empty',    position: { x: 1000, y: 350 },   data: E('Open Slot', { data: 2000, rp: 8 }) },
  { id: 'e_mine3',  type: 'resource', position: { x: 1300, y: 0 },     data: R('Data Mine Foxtrot', 70, { data: 1200 }) },
  { id: 'e_mine4',  type: 'resource', position: { x: 1300, y: 250 },   data: R('Data Mine Golf', 65, { data: 1000 }) },
  { id: 'e_empty2', type: 'empty',    position: { x: 1550, y: 120 },   data: E('Open Slot', { data: 3000, rp: 12 }) },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOUTHEAST — Deep Territory (late game, high yield)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'se_relay1', type: 'relay',    position: { x: 350,  y: 400 },   data: Y('Relay SE1', { data: 250 }) },
  { id: 'se_mine1',  type: 'resource', position: { x: 600,  y: 550 },   data: R('Data Mine Hotel', 50, { data: 500 }) },
  { id: 'se_comp1',  type: 'compute',  position: { x: 350,  y: 700 },   data: C('Compute C5', 'easy', { data: 600 }) },
  { id: 'se_relay2', type: 'relay',    position: { x: 650,  y: 850 },   data: Y('Relay SE2', { data: 1200 }) },
  { id: 'se_mine2',  type: 'resource', position: { x: 900,  y: 700 },   data: R('Data Mine India', 85, { data: 1800 }) },
  { id: 'se_empty1', type: 'empty',    position: { x: 900,  y: 1000 },  data: E('Open Slot', { data: 2500, rp: 10 }) },
  { id: 'se_locked1',type: 'locked',   position: { x: 400,  y: 1050 },  data: Y('Encrypted Vault', { data: 5000, rp: 20 }) },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOUTH — Relay Backbone (connects west and east)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 's_relay1', type: 'relay',    position: { x: -100, y: 350 },    data: Y('Relay S1', { data: 80 }) },
  { id: 's_comp1',  type: 'compute',  position: { x: 100,  y: 550 },    data: C('Compute Alpha', 'easy', { data: 400 }) },
  { id: 's_mine1',  type: 'resource', position: { x: -200, y: 600 },    data: R('Data Mine Juliet', 40, { data: 350 }) },
  { id: 's_relay2', type: 'relay',    position: { x: 0,    y: 800 },    data: Y('Relay S2', { data: 700 }) },
  { id: 's_mine2',  type: 'resource', position: { x: -250, y: 950 },    data: R('Data Mine Kilo', 75, { data: 1500 }) },
  { id: 's_mine3',  type: 'resource', position: { x: 250,  y: 950 },    data: R('Data Mine Lima', 70, { data: 1400 }) },
  { id: 's_empty1', type: 'empty',    position: { x: 0,    y: 1100 },   data: E('Open Slot', { data: 2000, rp: 8 }) },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOUTHWEST — Defense Perimeter (infected zone nearby)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'sw_relay1', type: 'relay',    position: { x: -400, y: 300 },   data: Y('Relay SW1', { data: 150 }) },
  { id: 'sw_mine1',  type: 'resource', position: { x: -600, y: 200 },   data: R('Data Mine Mike', 45, { data: 400 }) },
  { id: 'sw_mine2',  type: 'resource', position: { x: -650, y: 450 },   data: R('Data Mine November', 55, { data: 600 }) },
  { id: 'sw_relay2', type: 'relay',    position: { x: -400, y: 600 },   data: Y('Relay SW2', { data: 900 }) },
  { id: 'sw_comp1',  type: 'compute',  position: { x: -650, y: 700 },   data: C('Compute C6', 'medium', { data: 1200, rp: 5 }) },
  { id: 'sw_empty1', type: 'empty',    position: { x: -900, y: 500 },   data: E('Open Slot', { data: 1800, rp: 7 }) },
  { id: 'sw_locked1',type: 'locked',   position: { x: -900, y: 300 },   data: Y('Quarantine Zone', { data: 4000, rp: 15 }) },

  // ═══════════════════════════════════════════════════════════════════════════
  // WEST — Relay Network (connectivity backbone)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'w_relay1', type: 'relay',    position: { x: -400, y: -100 },   data: Y('Relay W1', { data: 100 }) },
  { id: 'w_mine1',  type: 'resource', position: { x: -650, y: -200 },   data: R('Data Mine Oscar', 35, { data: 250 }) },
  { id: 'w_relay2', type: 'relay',    position: { x: -650, y: 50 },     data: Y('Relay W2', { data: 500 }) },
  { id: 'w_empty1', type: 'empty',    position: { x: -900, y: -100 },   data: E('Open Slot', { data: 1000, rp: 5 }) },
  { id: 'w_mine2',  type: 'resource', position: { x: -900, y: 100 },    data: R('Data Mine Papa', 60, { data: 800 }) },

  // ═══════════════════════════════════════════════════════════════════════════
  // NORTHWEST — Research Outpost (high RP, hard compute)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'nw_relay1', type: 'relay',    position: { x: -350, y: -400 },  data: Y('Relay NW1', { data: 200 }) },
  { id: 'nw_mine1',  type: 'resource', position: { x: -600, y: -500 },  data: R('Data Mine Quebec', 45, { data: 500 }) },
  { id: 'nw_comp1',  type: 'compute',  position: { x: -350, y: -700 },  data: C('Research Lab', 'hard', { data: 2000, rp: 10 }) },
  { id: 'nw_relay2', type: 'relay',    position: { x: -600, y: -800 },  data: Y('Relay NW2', { data: 1500 }) },
  { id: 'nw_comp2',  type: 'compute',  position: { x: -850, y: -650 },  data: C('Deep Research Lab', 'hard', { data: 4000, rp: 20 }) },
  { id: 'nw_empty1', type: 'empty',    position: { x: -850, y: -900 },  data: E('Open Slot', { data: 3000, rp: 15 }) },
  { id: 'nw_locked1',type: 'locked',   position: { x: -600, y: -1100 }, data: Y('Observatory', { data: 8000, rp: 30 }) },
];

export const INITIAL_EDGES = [
  // ── Hub spokes ──
  { id: 'e1',  source: 'hub',       target: 'n_relay1' },
  { id: 'e2',  source: 'hub',       target: 'ne_relay1' },
  { id: 'e3',  source: 'hub',       target: 'e_relay1' },
  { id: 'e4',  source: 'hub',       target: 'se_relay1' },
  { id: 'e5',  source: 'hub',       target: 's_relay1' },
  { id: 'e6',  source: 'hub',       target: 'sw_relay1' },
  { id: 'e7',  source: 'hub',       target: 'w_relay1' },
  { id: 'e8',  source: 'hub',       target: 'nw_relay1' },

  // ── North Mining District ──
  { id: 'e10', source: 'n_relay1',  target: 'n_mine1' },
  { id: 'e11', source: 'n_relay1',  target: 'n_mine2' },
  { id: 'e12', source: 'n_relay1',  target: 'n_relay2' },
  { id: 'e13', source: 'n_relay2',  target: 'n_mine3' },
  { id: 'e14', source: 'n_relay2',  target: 'n_mine4' },
  { id: 'e15', source: 'n_relay2',  target: 'n_empty1' },
  { id: 'e16', source: 'n_empty1',  target: 'n_deep1' },
  { id: 'e17', source: 'n_mine3',   target: 'n_deep2' },

  // ── Northeast Compute Cluster ──
  { id: 'e20', source: 'ne_relay1', target: 'ne_comp1' },
  { id: 'e21', source: 'ne_relay1', target: 'ne_mine1' },
  { id: 'e22', source: 'ne_comp1',  target: 'ne_relay2' },
  { id: 'e23', source: 'ne_relay2', target: 'ne_comp2' },
  { id: 'e24', source: 'ne_relay2', target: 'ne_comp3' },
  { id: 'e25', source: 'ne_relay2', target: 'ne_empty1' },
  { id: 'e26', source: 'ne_comp2',  target: 'ne_comp4' },
  { id: 'e27', source: 'ne_comp3',  target: 'ne_comp4' },

  // ── East Trade Route ──
  { id: 'e30', source: 'e_relay1',  target: 'e_mine1' },
  { id: 'e31', source: 'e_relay1',  target: 'e_mine2' },
  { id: 'e32', source: 'e_mine1',   target: 'e_relay2' },
  { id: 'e33', source: 'e_relay2',  target: 'e_empty1' },
  { id: 'e34', source: 'e_relay2',  target: 'e_mine3' },
  { id: 'e35', source: 'e_relay2',  target: 'e_mine4' },
  { id: 'e36', source: 'e_mine3',   target: 'e_empty2' },

  // ── Southeast Deep Territory ──
  { id: 'e40', source: 'se_relay1', target: 'se_mine1' },
  { id: 'e41', source: 'se_relay1', target: 'se_comp1' },
  { id: 'e42', source: 'se_mine1',  target: 'se_relay2' },
  { id: 'e43', source: 'se_relay2', target: 'se_mine2' },
  { id: 'e44', source: 'se_relay2', target: 'se_empty1' },
  { id: 'e45', source: 'se_comp1',  target: 'se_locked1' },

  // ── South Backbone ──
  { id: 'e50', source: 's_relay1',  target: 's_comp1' },
  { id: 'e51', source: 's_relay1',  target: 's_mine1' },
  { id: 'e52', source: 's_comp1',   target: 's_relay2' },
  { id: 'e53', source: 's_relay2',  target: 's_mine2' },
  { id: 'e54', source: 's_relay2',  target: 's_mine3' },
  { id: 'e55', source: 's_relay2',  target: 's_empty1' },

  // ── Southwest Defense ──
  { id: 'e60', source: 'sw_relay1', target: 'sw_mine1' },
  { id: 'e61', source: 'sw_relay1', target: 'sw_mine2' },
  { id: 'e62', source: 'sw_mine2',  target: 'sw_relay2' },
  { id: 'e63', source: 'sw_relay2', target: 'sw_comp1' },
  { id: 'e64', source: 'sw_mine1',  target: 'sw_empty1' },
  { id: 'e65', source: 'sw_mine1',  target: 'sw_locked1' },

  // ── West Relay Network ──
  { id: 'e70', source: 'w_relay1',  target: 'w_mine1' },
  { id: 'e71', source: 'w_relay1',  target: 'w_relay2' },
  { id: 'e72', source: 'w_relay2',  target: 'w_empty1' },
  { id: 'e73', source: 'w_relay2',  target: 'w_mine2' },

  // ── Northwest Research ──
  { id: 'e80', source: 'nw_relay1', target: 'nw_mine1' },
  { id: 'e81', source: 'nw_relay1', target: 'nw_comp1' },
  { id: 'e82', source: 'nw_comp1',  target: 'nw_relay2' },
  { id: 'e83', source: 'nw_relay2', target: 'nw_comp2' },
  { id: 'e84', source: 'nw_relay2', target: 'nw_empty1' },
  { id: 'e85', source: 'nw_relay2', target: 'nw_locked1' },

  // ── Cross-region links (redundant paths) ──
  { id: 'e90', source: 's_relay1',  target: 'sw_relay1' },   // South ↔ Southwest
  { id: 'e91', source: 's_relay1',  target: 'se_relay1' },   // South ↔ Southeast
  { id: 'e92', source: 'w_relay1',  target: 'nw_relay1' },   // West ↔ Northwest
  { id: 'e93', source: 'n_relay1',  target: 'nw_relay1' },   // North ↔ Northwest
  { id: 'e94', source: 'ne_relay1', target: 'e_relay1' },    // Northeast ↔ East
  { id: 'e95', source: 'e_relay1',  target: 'se_relay1' },   // East ↔ Southeast
  { id: 'e96', source: 'w_relay1',  target: 'sw_relay1' },   // West ↔ Southwest
];

export const INITIAL_RESOURCES: Resources = { data: 500, rp: 0, credits: 0 };

export const INITIAL_PLAYER_INVENTORY: InventoryItem[] = [
  { id: 'starter-pick', itemType: 'pickaxe_basic', count: 1, metadata: { efficiency: 1.0 } },
];

const INITIAL_STORE: Store = {
  game_state: {
    nodes: INITIAL_NODES,
    edges: INITIAL_EDGES,
    resources: INITIAL_RESOURCES,
    flop: INITIAL_FLOP,
    tick: 0,
    gameOver: false,
    playerInventory: INITIAL_PLAYER_INVENTORY,
    playerChips: [],
  },
  workers: {},
  worker_logs: [],
  next_log_id: 1,
  achievement_state: { unlocked: {}, stats: {}, statArrays: {} },
  quest_state: { questStatus: {}, activePassives: {}, unlockedRecipes: [], claimedAt: {} },
  level_state: { ...INITIAL_LEVEL_STATE },
};

// ── Store management ──────────────────────────────────────────────────────────

let store: Store;

export function initDb() {
  if (fs.existsSync(DATA_PATH)) {
    try {
      store = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')) as Store;
      // Ensure all fields exist (migration safety)
      if (!store.workers) store.workers = {};
      if (!store.worker_logs) store.worker_logs = [];
      if (!store.next_log_id) store.next_log_id = 1;
      if (!store.game_state.playerInventory) {
        store.game_state.playerInventory = JSON.parse(JSON.stringify(INITIAL_PLAYER_INVENTORY));
      }
      // Migrate existing nodes to add mineable/drops
      store.game_state.nodes = store.game_state.nodes.map((n: any) => {
        const init = INITIAL_NODES.find(in_ => in_.id === n.id);
        if (init && (init.data as any).mineable && !n.data.mineable) {
          return {
            ...n,
            data: {
              ...n.data,
              mineable: true,
              drops: n.data.drops || [],
              mineCount: n.data.mineCount || 0,
            },
          };
        }
        return n;
      });
      // Migrate workers to add holding/equippedPickaxe
      for (const w of Object.values(store.workers)) {
        if (w.holding === undefined) (w as any).holding = null;
        if (w.equippedPickaxe === undefined) (w as any).equippedPickaxe = null;
      }
      // Migrate: add chip/upgrade fields to nodes
      store.game_state.nodes = store.game_state.nodes.map((n: any) => ({
        ...n,
        data: {
          ...n.data,
          upgradeLevel: n.data.upgradeLevel ?? 0,
          chipSlots: n.data.chipSlots ?? (n.type === 'hub' || n.type === 'resource' ? 1 : 0),
          installedChips: n.data.installedChips ?? [],
        },
      }));
      // Migrate: add playerChips
      if (!store.game_state.playerChips) {
        (store.game_state as any).playerChips = [];
      }
      // Migrate: add achievement_state
      if (!store.achievement_state) {
        store.achievement_state = { unlocked: {}, stats: {}, statArrays: {} };
      }
      // Migrate: add quest_state
      if (!store.quest_state) {
        store.quest_state = { questStatus: {}, activePassives: {}, unlockedRecipes: [], claimedAt: {} };
      }
      // Migrate: add level_state
      if (!store.level_state) {
        store.level_state = { ...INITIAL_LEVEL_STATE };
      }
    } catch {
      console.warn('[DB] Could not parse state file, starting fresh');
      store = JSON.parse(JSON.stringify(INITIAL_STORE));
    }
  } else {
    store = JSON.parse(JSON.stringify(INITIAL_STORE));
  }

  // Persist every 5 seconds
  setInterval(persist, 5000);
}

function persist() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('[DB] Persist failed:', err);
  }
}

// ── Game state ────────────────────────────────────────────────────────────────

export function getGameState(): GameStateRow {
  return store.game_state;
}

export function saveGameState(state: GameStateRow) {
  store.game_state = state;
}

export function resetGameState() {
  store = JSON.parse(JSON.stringify(INITIAL_STORE));
  persist();
}

// ── Player Inventory ──────────────────────────────────────────────────────────

export function getPlayerInventory(): InventoryItem[] {
  return store.game_state.playerInventory || [];
}

export function addToPlayerInventory(itemType: string, count: number, metadata?: { efficiency?: number }) {
  const inv = store.game_state.playerInventory || [];
  const existing = inv.find(i => i.itemType === itemType);
  if (existing) {
    existing.count += count;
  } else {
    inv.push({
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      itemType: itemType as InventoryItem['itemType'],
      count,
      metadata,
    });
  }
  store.game_state.playerInventory = inv;
}

export function removeFromPlayerInventory(itemType: string, count: number): boolean {
  const inv = store.game_state.playerInventory || [];
  const existing = inv.find(i => i.itemType === itemType);
  if (!existing || existing.count < count) return false;
  existing.count -= count;
  if (existing.count === 0) {
    store.game_state.playerInventory = inv.filter(i => i.itemType !== itemType);
  }
  return true;
}

export function getItemEfficiency(itemType: string): number {
  const effMap: Record<string, number> = {
    pickaxe_basic: 1.0,
    pickaxe_iron: 1.5,
    pickaxe_diamond: 2.5,
  };
  return effMap[itemType] ?? 1.0;
}

// ── Workers ───────────────────────────────────────────────────────────────────

export function getWorkers(): WorkerRow[] {
  return Object.values(store.workers);
}

export function getWorker(id: string): WorkerRow | null {
  return store.workers[id] || null;
}

export function upsertWorker(worker: WorkerRow) {
  store.workers[worker.id] = {
    ...worker,
    deployed_at: store.workers[worker.id]?.deployed_at || new Date().toISOString(),
  };
}

export function deleteWorker(id: string) {
  delete store.workers[id];
}

// ── Worker logs ───────────────────────────────────────────────────────────────

export function addWorkerLog(workerId: string, message: string) {
  store.worker_logs.push({
    id: store.next_log_id++,
    worker_id: workerId,
    message,
    created_at: new Date().toISOString(),
  });
  // Keep last 1000 logs
  if (store.worker_logs.length > 1000) {
    store.worker_logs = store.worker_logs.slice(-1000);
  }
}

export function getWorkerLogs(workerId: string): WorkerLogRow[] {
  return store.worker_logs
    .filter(l => l.worker_id === workerId)
    .slice(-100)
    .reverse();
}

// ── Player Chips ─────────────────────────────────────────────────────────────

export function getPlayerChips(): Chip[] {
  return store.game_state.playerChips || [];
}

export function addPlayerChip(chip: Chip) {
  if (!store.game_state.playerChips) store.game_state.playerChips = [];
  store.game_state.playerChips.push(chip);
}

export function removePlayerChip(chipId: string): Chip | null {
  const chips = store.game_state.playerChips || [];
  const idx = chips.findIndex(c => c.id === chipId);
  if (idx === -1) return null;
  const [removed] = chips.splice(idx, 1);
  return removed;
}

/** Get aggregated chip effects for a node */
export function getNodeChipEffects(nodeId: string): Record<string, number> {
  const state = store.game_state;
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return {};

  // installedChips stores full Chip objects on the node
  const effects: Record<string, number> = {};
  const allInstalledChips: Chip[] = [];

  for (const n of state.nodes) {
    if (n.id === nodeId && Array.isArray(n.data.installedChips)) {
      for (const item of n.data.installedChips) {
        if (typeof item === 'object' && item.effect) {
          allInstalledChips.push(item as Chip);
        }
      }
    }
  }

  for (const chip of allInstalledChips) {
    const { type, value } = chip.effect;
    if (type.endsWith('_mult')) {
      // Multiplicative — chain multiply
      effects[type] = (effects[type] || 1) * value;
    } else {
      // Additive
      effects[type] = (effects[type] || 0) + value;
    }
  }

  return effects;
}

// ── Achievement Helpers ──────────────────────────────────────────────────────

export function getAchievementState(): AchievementState {
  return store.achievement_state;
}

export function incrementStat(key: string, amount: number = 1): number {
  const s = store.achievement_state.stats;
  s[key] = (s[key] || 0) + amount;
  return s[key];
}

export function setStatMax(key: string, value: number): number {
  const s = store.achievement_state.stats;
  s[key] = Math.max(s[key] || 0, value);
  return s[key];
}

export function getStat(key: string): number {
  return store.achievement_state.stats[key] || 0;
}

export function addToStatArray(key: string, value: string): string[] {
  const a = store.achievement_state.statArrays;
  if (!a[key]) a[key] = [];
  if (!a[key].includes(value)) a[key].push(value);
  return a[key];
}

export function getStatArray(key: string): string[] {
  return store.achievement_state.statArrays[key] || [];
}

export function markAchievementUnlocked(id: string): void {
  store.achievement_state.unlocked[id] = new Date().toISOString();
}

export function isAchievementUnlocked(id: string): boolean {
  return !!store.achievement_state.unlocked[id];
}

// ── Quest Helpers ────────────────────────────────────────────────────────────

export function getQuestState(): QuestState {
  return store.quest_state;
}

export function getQuestStatus(questId: string): QuestState['questStatus'][string] | undefined {
  return store.quest_state.questStatus[questId];
}

export function setQuestStatus(questId: string, status: 'locked' | 'available' | 'completed' | 'claimed') {
  store.quest_state.questStatus[questId] = status;
  if (status === 'claimed') {
    store.quest_state.claimedAt[questId] = new Date().toISOString();
  }
}

export function addActivePassive(id: string, description: string, effect: Record<string, number>) {
  store.quest_state.activePassives[id] = { description, effect };
}

export function getActivePassives(): Record<string, { description: string; effect: Record<string, number> }> {
  return store.quest_state.activePassives || {};
}

export function addUnlockedRecipe(recipeId: string) {
  if (!store.quest_state.unlockedRecipes.includes(recipeId)) {
    store.quest_state.unlockedRecipes.push(recipeId);
  }
}

export function getUnlockedRecipes(): string[] {
  return store.quest_state.unlockedRecipes || [];
}

// ── Cache Node Storage ──────────────────────────────────────────────────────
// Per cache-node in-memory KV store. Key: nodeId, Value: Map<string, { value, ttl }>

interface CacheEntry {
  value: any;
  storedAt: number;
  ttl: number; // ms, 0 = no expiry
}

const cacheStores = new Map<string, Map<string, CacheEntry>>();

const CACHE_CAPACITY: Record<number, number> = { 0: 0, 1: 10, 2: 30, 3: 100 };
const CACHE_RANGE: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3 };

export function getCacheStore(nodeId: string): Map<string, CacheEntry> {
  if (!cacheStores.has(nodeId)) cacheStores.set(nodeId, new Map());
  return cacheStores.get(nodeId)!;
}

export function cacheGet(nodeId: string, key: string): any | undefined {
  const store = getCacheStore(nodeId);
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.ttl > 0 && Date.now() - entry.storedAt > entry.ttl) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(nodeId: string, key: string, value: any, ttl: number = 0): boolean {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node || node.type !== 'cache') return false;
  const level = node.data.upgradeLevel || 1;
  const capacity = CACHE_CAPACITY[level] || 10;
  const cacheStore = getCacheStore(nodeId);
  // Evict expired entries first
  const now = Date.now();
  for (const [k, e] of cacheStore) {
    if (e.ttl > 0 && now - e.storedAt > e.ttl) cacheStore.delete(k);
  }
  // Check capacity (allow overwrite of existing key)
  if (!cacheStore.has(key) && cacheStore.size >= capacity) return false;
  cacheStore.set(key, { value, storedAt: now, ttl });
  return true;
}

export function cacheKeys(nodeId: string): string[] {
  const cacheStore = getCacheStore(nodeId);
  // Filter out expired
  const now = Date.now();
  const keys: string[] = [];
  for (const [k, e] of cacheStore) {
    if (e.ttl > 0 && now - e.storedAt > e.ttl) { cacheStore.delete(k); continue; }
    keys.push(k);
  }
  return keys;
}

export function getCacheRange(nodeId: string): number {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node || node.type !== 'cache') return 0;
  return CACHE_RANGE[node.data.upgradeLevel || 1] || 1;
}

export function getCacheCapacity(nodeId: string): number {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node || node.type !== 'cache') return 0;
  return CACHE_CAPACITY[node.data.upgradeLevel || 1] || 10;
}
