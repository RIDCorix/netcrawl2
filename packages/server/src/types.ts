/**
 * Shared types, interfaces, and constants for NetCrawl game state.
 * Pure definitions — no runtime dependencies.
 */

import type { LevelState, LevelSummary } from './levelSystem.js';
import type { LayerSnapshot } from './layerDefinitions.js';

// ── Resources ───────────────────────────────────────────────────────────────

export interface Resources {
  data: number;       // primary currency (bytes), mined from resource nodes
  rp: number;         // research points, from compute nodes
  credits: number;    // premium currency, from API nodes / quests
  /** Index signature — allows dynamic resource key access (e.g. resources[rewardType]) */
  [key: string]: number;
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

// ── Item Stack System (Minecraft-style) ─────────────────────────────────────

export interface Item {
  type: 'data_fragment' | 'rp_shard' | 'bad_data';
  count: number;
}

export const MAX_STACK_SIZE = 64;

/** Merge two lists of item stacks, combining counts for matching types. Respects MAX_STACK_SIZE. */
export function mergeItemStacks(a: Item[], b: Item[]): Item[] {
  const map = new Map<string, number>();
  for (const item of a) map.set(item.type, (map.get(item.type) || 0) + item.count);
  for (const item of b) map.set(item.type, (map.get(item.type) || 0) + item.count);
  const result: Item[] = [];
  for (const [type, total] of map.entries()) {
    let remaining = total;
    while (remaining > 0) {
      const stackCount = Math.min(remaining, MAX_STACK_SIZE);
      result.push({ type, count: stackCount } as Item);
      remaining -= stackCount;
    }
  }
  return result;
}

// ── Player Inventory ────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  itemType: 'pickaxe_basic' | 'pickaxe_iron' | 'pickaxe_diamond' | 'shield' | 'beacon' | 'data_fragment' | 'rp_shard' | 'chip_pack_basic' | 'chip_pack_premium' | 'scanner' | 'signal_booster' | 'overclock_kit' | 'antivirus_module' | 'memory_allocator' | 'fullstack_pickaxe' | 'cpu_basic' | 'cpu_advanced' | 'ram_basic' | 'ram_advanced';
  count: number;
  metadata?: {
    efficiency?: number;
  };
}

// ── Chip System ─────────────────────────────────────────────────────────────

export interface Chip {
  id: string;
  chipType: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  effect: { type: string; value: number };
}

// ── Node Types ─────────────────────────────────────────────────────────────

export type NodeType = 'hub' | 'resource' | 'compute' | 'cache' | 'api' | 'auth' | 'empty' | 'infected';

export interface NodeData {
  label: string;
  unlocked?: boolean;
  resource?: string;
  rate?: number;
  baseRate?: number;
  unlockCost?: Partial<Resources>;
  infected?: boolean;
  mineable?: boolean;
  items?: Item[];
  drops?: Item[];
  mineCount?: number;
  depleted?: boolean;
  depletedUntil?: number;
  capacity?: number;
  refillMs?: number;
  upgradeLevel?: number;
  chipSlots?: number;
  baseChipSlots?: number;
  installedChips?: (string | Chip)[];
  enhancementPoints?: number;
  statAlloc?: Record<string, number>;
  baseDefense?: number;
  defense?: number;
  bad_data_chance?: number;
  autoCollect?: boolean;
  maxBuffer?: number;
  // Compute node properties
  difficulty?: 'easy' | 'medium' | 'hard';
  fixedPuzzleTemplate?: string;
  rewardResource?: string;
  solveCount?: number;
  // Cache node properties
  cacheRange?: number;
  cacheCapacity?: number;
  // API node properties
  tier?: number;
  infectionValue?: number;
  pendingRequests?: number;
  // XP (computed/enriched)
  nodeXp?: number;
  nodeXpToNext?: number;
  /** Extensible — allows future properties without breaking types */
  [key: string]: any;
}

export interface GameNode {
  id: string;
  type: NodeType | string;
  position: { x: number; y: number };
  data: NodeData;
}

export interface GameEdge {
  id: string;
  source: string;
  target: string;
}

// ── Game State ──────────────────────────────────────────────────────────────

export interface GameStateRow {
  nodes: GameNode[];
  edges: GameEdge[];
  resources: Resources;
  flop: FlopState;
  tick: number;
  gameOver: boolean;
  playerInventory: InventoryItem[];
  playerChips: Chip[];
}

// ── Workers ─────────────────────────────────────────────────────────────────

export interface WorkerRow {
  id: string;
  node_id: string;
  class_name: string;
  class_icon: string;
  commit_hash: string;
  status: 'deploying' | 'running' | 'suspending' | 'suspended' | 'crashed' | 'error' | 'idle' | 'moving' | 'harvesting' | 'dead';
  current_node: string;
  carrying: Partial<Resources>;
  pid: number | null;
  deployed_at: string;
  holding: Item[];
  equippedPickaxe: { itemType: string; efficiency: number } | null;
  equippedCpu: { itemType: string; computePoints: number; count: number } | null;
  equippedRam: { itemType: string; capacityBonus: number; count: number } | null;
  lastLog?: { message: string; level: string; ts: number } | null;
  /** Node the worker was at before the current move — cleared when move completes */
  previous_node?: string;
  /** Timestamp of the current move — used for animation/dedup */
  move_id?: number;
  /** Original deploy configuration — used for auto-resume after disconnect */
  deployConfig?: { classId: string; equippedItems: Record<string, any>; injectedFields: Record<string, any> } | null;
}

export interface WorkerLogRow {
  id: number;
  worker_id: string;
  message: string;
  created_at: string;
}

// ── Crafting Recipes ────────────────────────────────────────────────────────

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
    cost: { data: 20000 },
  },
  {
    id: 'pickaxe_iron',
    name: 'Iron Pickaxe',
    description: 'Stronger pick. efficiency 1.5×. Yields 1-2 items.',
    output: { itemType: 'pickaxe_iron', count: 1, metadata: { efficiency: 1.5 } },
    cost: { data: 50000, rp: 5 },
  },
  {
    id: 'pickaxe_diamond',
    name: 'Diamond Pickaxe',
    description: 'Finest tool. efficiency 2.5×. Yields 2-3 items.',
    output: { itemType: 'pickaxe_diamond', count: 1, metadata: { efficiency: 2.5 } },
    cost: { data: 200000, rp: 20 },
  },
  {
    id: 'shield',
    name: 'Shield',
    description: 'Protects worker from infection damage.',
    output: { itemType: 'shield', count: 1 },
    cost: { data: 30000, rp: 3 },
  },
  {
    id: 'beacon',
    name: 'Beacon',
    description: 'Increases scan radius for workers.',
    output: { itemType: 'beacon', count: 1 },
    cost: { data: 50000, rp: 8 },
  },
  {
    id: 'cpu_basic',
    name: 'CPU Module',
    description: '+1 compute point. Enables equipping advanced algorithms.',
    output: { itemType: 'cpu_basic', count: 1 },
    cost: { data: 40000 },
  },
  {
    id: 'cpu_advanced',
    name: 'CPU Module II',
    description: '+2 compute points. For demanding algorithms.',
    output: { itemType: 'cpu_advanced', count: 1 },
    cost: { data: 150000 },
  },
  {
    id: 'ram_basic',
    name: 'RAM Module',
    description: '+2 inventory capacity.',
    output: { itemType: 'ram_basic', count: 1 },
    cost: { data: 30000 },
  },
  {
    id: 'ram_advanced',
    name: 'RAM Module II',
    description: '+4 inventory capacity.',
    output: { itemType: 'ram_advanced', count: 1 },
    cost: { data: 120000 },
  },
];

// ── Quest System ────────────────────────────────────────────────────────────

export interface QuestState {
  questStatus: Record<string, 'locked' | 'available' | 'completed' | 'claimed'>;
  activePassives: Record<string, { description: string; effect: Record<string, number> }>;
  unlockedRecipes: string[];
  claimedAt: Record<string, string>;
}

// ── Achievement System ──────────────────────────────────────────────────────

export interface AchievementState {
  unlocked: Record<string, string>; // id -> ISO timestamp
  stats: Record<string, number>;
  statArrays: Record<string, string[]>;
}

// ── Layer Manager ───────────────────────────────────────────────────────────

export interface LayerManagerState {
  currentLayer: number;       // 0, 1, 2, ...
  unlockedLayers: number[];   // [0, 1] = layers that are available to enter
  snapshots: Record<number, LayerSnapshot>;
}

// ── Autosave ────────────────────────────────────────────────────────────────

/** Snapshot of game progress used by the "return to autosave" recovery flow. */
export interface AutosaveSnapshot {
  ts: number;
  tick: number;
  game_state: GameStateRow;
  workers: Record<string, WorkerRow>;
  achievement_state: AchievementState;
  quest_state: QuestState;
  level_state: LevelState;
  layer_manager: LayerManagerState;
}

// ── Store ───────────────────────────────────────────────────────────────────

export interface Store {
  game_state: GameStateRow;
  workers: Record<string, WorkerRow>;
  worker_logs: WorkerLogRow[];
  next_log_id: number;
  achievement_state: AchievementState;
  quest_state: QuestState;
  level_state: LevelState;
  layer_manager: LayerManagerState;
  /** Latest healthy snapshot — refreshed periodically by gameTick while game is alive. */
  autosave?: AutosaveSnapshot;
}

// ── Initial Data ────────────────────────────────────────────────────────────

// Helper to create typed node data
const R = (label: string, rate: number, cost: Record<string, number>, badDataChance: number = 0.2) =>
  ({ label, resource: 'data' as const, rate, baseRate: rate, unlocked: false, unlockCost: cost, mineable: true, items: [] as any[], mineCount: 0, upgradeLevel: 0, chipSlots: 1, baseChipSlots: 1, installedChips: [] as string[], enhancementPoints: 0, statAlloc: {} as Record<string, number>, baseDefense: 0, bad_data_chance: badDataChance });
const C = (label: string, diff: 'easy' | 'medium' | 'hard', cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, difficulty: diff, rewardResource: 'rp' as const, solveCount: 0, upgradeLevel: 0, chipSlots: 0, baseChipSlots: 0, installedChips: [] as string[], enhancementPoints: 0, statAlloc: {} as Record<string, number>, baseDefense: 0 });
const Y = (label: string, cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, upgradeLevel: 0, chipSlots: 0, baseChipSlots: 0, installedChips: [] as string[], enhancementPoints: 0, statAlloc: {} as Record<string, number>, baseDefense: 0 });
const E = (label: string, cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, upgradeLevel: 0, chipSlots: 0, baseChipSlots: 0, installedChips: [] as string[], enhancementPoints: 0, statAlloc: {} as Record<string, number>, baseDefense: 0 });
const P = (label: string, tier: number, cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, tier, infectionValue: 0, pendingRequests: 0, upgradeLevel: 0, chipSlots: 1, baseChipSlots: 1, installedChips: [] as string[], enhancementPoints: 0, statAlloc: {} as Record<string, number>, baseDefense: 0 });
const AU = (label: string, cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, upgradeLevel: 0, chipSlots: 1, baseChipSlots: 1, installedChips: [] as string[], enhancementPoints: 0, statAlloc: {} as Record<string, number>, baseDefense: 0 });
const MC = (label: string, rate: number, cost: Record<string, number>, badDataChance: number = 0) =>
  ({ label, resource: 'data' as const, rate, baseRate: rate, unlocked: false, unlockCost: cost, mineable: true, items: [] as any[], mineCount: 0, upgradeLevel: 0, chipSlots: 0, baseChipSlots: 0, installedChips: [] as string[], enhancementPoints: 0, statAlloc: {} as Record<string, number>, baseDefense: 0, capacity: 1, refillMs: 5000, bad_data_chance: badDataChance });

export const INITIAL_NODES = [
  // Core
  { id: 'hub', type: 'hub', position: { x: -45, y: -36 }, data: { label: 'Hub', unlocked: true, upgradeLevel: 0, chipSlots: 1, baseChipSlots: 1, installedChips: [] as string[], enhancementPoints: 0, statAlloc: {} as Record<string, number>, baseDefense: 0 } },

  // NORTH — Mining District
  { id: 'n_relay1', type: 'resource', position: { x: 0,    y: -300 },  data: { ...R('Data Mine Nano', 30, { data: 2000 }, 0.4), unlocked: true } },
  { id: 'n_mine1',  type: 'resource', position: { x: -220, y: -500 },  data: R('Data Mine Alpha', 50, { data: 10000 }, 0.25) },
  { id: 'n_mine2',  type: 'resource', position: { x: 220,  y: -500 },  data: R('Data Mine Beta', 40, { data: 15000 }, 0.2) },
  { id: 'n_relay2', type: 'empty',    position: { x: 0,    y: -700 },  data: Y('Relay N2', { data: 20000 }) },
  { id: 'n_mine3',  type: 'resource', position: { x: -220, y: -900 },  data: R('Data Mine Gamma', 60, { data: 40000 }) },
  { id: 'n_mine4',  type: 'resource', position: { x: 220,  y: -900 },  data: R('Data Mine Delta', 55, { data: 50000 }) },
  { id: 'n_empty1', type: 'empty',    position: { x: 0,    y: -1100 }, data: E('Open Slot', { data: 80000, rp: 3 }) },
  { id: 'n_deep1',  type: 'resource', position: { x: 0,    y: -1300 }, data: R('Deep Core Alpha', 100, { data: 200000, rp: 5 }) },
  { id: 'n_deep2',  type: 'resource', position: { x: -350, y: -1100 }, data: R('Deep Core Beta', 80, { data: 150000, rp: 3 }) },

  // NORTHEAST — Compute Cluster
  { id: 'ne_relay1', type: 'empty',    position: { x: 350,  y: -200 },  data: Y('Relay NE1', { data: 12000 }) },
  { id: 'ne_comp1',  type: 'compute',  position: { x: 560,  y: -380 },  data: C('Compute C1', 'easy', { data: 30000 }) },
  { id: 'ne_mine1',  type: 'resource', position: { x: 560,  y: -60 },   data: R('Data Silo East', 35, { data: 25000 }) },
  { id: 'ne_relay2', type: 'empty',    position: { x: 780,  y: -280 },  data: Y('Relay NE2', { data: 60000 }) },
  { id: 'ne_comp2',  type: 'compute',  position: { x: 980,  y: -430 },  data: C('Compute C2', 'medium', { data: 100000, rp: 5 }) },
  { id: 'ne_comp3',  type: 'compute',  position: { x: 980,  y: -130 },  data: C('Compute C3', 'medium', { data: 120000, rp: 8 }) },
  { id: 'ne_empty1', type: 'empty',    position: { x: 780,  y: -500 },  data: E('Open Slot', { data: 150000, rp: 5 }) },
  { id: 'ne_comp4',  type: 'compute',  position: { x: 1200, y: -280 },  data: C('Compute C4', 'hard', { data: 300000, rp: 15 }) },

  // EAST — Trade Route
  { id: 'e_relay1', type: 'empty',    position: { x: 420,  y: 100 },   data: Y('Relay E1', { data: 18000 }) },
  { id: 'e_mine1',  type: 'resource', position: { x: 650,  y: -40 },   data: R('Data Mine Echo', 45, { data: 35000 }) },
  { id: 'e_mine2',  type: 'resource', position: { x: 650,  y: 240 },   data: R('Data Vein East', 30, { data: 30000 }) },
  { id: 'e_relay2', type: 'empty',    position: { x: 880,  y: 100 },   data: Y('Relay E2', { data: 80000 }) },
  { id: 'e_empty1', type: 'empty',    position: { x: 880,  y: 320 },   data: E('Open Slot', { data: 200000, rp: 8 }) },
  { id: 'e_mine3',  type: 'resource', position: { x: 1110, y: -40 },   data: R('Data Mine Foxtrot', 70, { data: 120000 }) },
  { id: 'e_mine4',  type: 'resource', position: { x: 1110, y: 240 },   data: R('Data Mine Golf', 65, { data: 100000 }) },
  { id: 'e_empty2', type: 'empty',    position: { x: 1340, y: 100 },   data: E('Open Slot', { data: 300000, rp: 12 }) },
  // East API Cluster
  { id: 'api_east_1', type: 'api',  position: { x: 1110, y: -240 }, data: P('Echo Service', 1, { data: 40000 }) },
  { id: 'api_east_2', type: 'api',  position: { x: 1340, y: -240 }, data: P('Compute API', 1, { data: 80000, rp: 3 }) },
  { id: 'auth_iam1',  type: 'auth', position: { x: 1560, y: -100 }, data: AU('IAM Auth', { data: 60000, rp: 5 }) },

  // SOUTHEAST — Deep Territory
  { id: 'se_relay1', type: 'empty',    position: { x: 350,  y: 340 },   data: Y('Relay SE1', { data: 25000 }) },
  { id: 'se_mine1',  type: 'resource', position: { x: 560,  y: 460 },   data: R('Data Mine Hotel', 50, { data: 50000 }) },
  { id: 'se_comp1',  type: 'compute',  position: { x: 350,  y: 560 },   data: C('Compute C5', 'easy', { data: 60000 }) },
  { id: 'se_relay2', type: 'empty',    position: { x: 680,  y: 660 },   data: Y('Relay SE2', { data: 120000 }) },
  { id: 'se_mine2',  type: 'resource', position: { x: 900,  y: 560 },   data: R('Data Mine India', 85, { data: 180000 }) },
  { id: 'se_empty1', type: 'empty',    position: { x: 680,  y: 860 },   data: E('Open Slot', { data: 250000, rp: 10 }) },
  { id: 'se_locked1',type: 'locked',   position: { x: 350,  y: 780 },   data: Y('Encrypted Vault', { data: 500000, rp: 20 }) },

  // SOUTH — Relay Backbone
  { id: 's_relay1', type: 'empty',    position: { x: 0,    y: 380 },    data: Y('Relay S1', { data: 8000 }) },
  { id: 's_comp1',  type: 'compute',  position: { x: -1200, y: -1400 },  data: C('Compute Alpha', 'easy', { data: 40000 }) },
  { id: 's_mine1',  type: 'resource', position: { x: -220, y: 560 },    data: R('Data Mine Juliet', 40, { data: 35000 }) },
  { id: 's_relay2', type: 'empty',    position: { x: 0,    y: 760 },    data: Y('Relay S2', { data: 70000 }) },
  { id: 's_mine2',  type: 'resource', position: { x: -220, y: 960 },    data: R('Data Mine Kilo', 75, { data: 150000 }) },
  { id: 's_mine3',  type: 'resource', position: { x: 220,  y: 960 },    data: R('Data Mine Lima', 70, { data: 140000 }) },
  { id: 's_empty1', type: 'empty',    position: { x: 0,    y: 1160 },   data: E('Open Slot', { data: 200000, rp: 8 }) },

  // SOUTHWEST — Defense Perimeter
  { id: 'sw_relay1', type: 'empty',    position: { x: -350, y: 340 },   data: Y('Relay SW1', { data: 15000 }) },
  { id: 'sw_mine1',  type: 'resource', position: { x: -560, y: 200 },   data: R('Data Mine Mike', 45, { data: 40000 }) },
  { id: 'sw_mine2',  type: 'resource', position: { x: -560, y: 480 },   data: R('Data Mine November', 55, { data: 60000 }) },
  { id: 'sw_relay2', type: 'empty',    position: { x: -560, y: 680 },   data: Y('Relay SW2', { data: 90000 }) },
  { id: 'sw_comp1',  type: 'compute',  position: { x: -780, y: 800 },   data: C('Compute C6', 'medium', { data: 120000, rp: 5 }) },
  { id: 'sw_empty1', type: 'empty',    position: { x: -780, y: 200 },   data: E('Open Slot', { data: 180000, rp: 7 }) },
  { id: 'sw_locked1',type: 'locked',   position: { x: -780, y: 60 },    data: Y('Quarantine Zone', { data: 400000, rp: 15 }) },

  // WEST — Relay Network
  { id: 'w_relay1', type: 'empty',    position: { x: -420, y: -60 },    data: Y('Relay W1', { data: 10000 }) },
  { id: 'w_mine1',  type: 'resource', position: { x: -650, y: -200 },   data: R('Data Mine Oscar', 35, { data: 25000 }) },
  { id: 'w_relay2', type: 'empty',    position: { x: -650, y: 80 },     data: Y('Relay W2', { data: 50000 }) },
  { id: 'w_empty1', type: 'empty',    position: { x: -880, y: -60 },    data: E('Open Slot', { data: 100000, rp: 5 }) },
  { id: 'w_mine2',  type: 'resource', position: { x: -880, y: 140 },    data: R('Data Mine Papa', 60, { data: 80000 }) },

  // NORTHWEST — Research Outpost
  { id: 'nw_relay1', type: 'empty',    position: { x: -320, y: -280 },  data: Y('Relay NW1', { data: 20000 }) },
  { id: 'nw_mine1',  type: 'resource', position: { x: -540, y: -380 },  data: R('Data Mine Quebec', 45, { data: 50000 }) },
  { id: 'nw_comp1',  type: 'compute',  position: { x: -400, y: -520 },  data: C('Research Lab', 'hard', { data: 200000, rp: 10 }) },
  { id: 'nw_relay2', type: 'empty',    position: { x: -600, y: -680 },  data: Y('Relay NW2', { data: 150000 }) },
  { id: 'nw_comp2',  type: 'compute',  position: { x: -820, y: -560 },  data: C('Deep Research Lab', 'hard', { data: 400000, rp: 20 }) },
  { id: 'nw_empty1', type: 'empty',    position: { x: -600, y: -880 },  data: E('Open Slot', { data: 300000, rp: 15 }) },
  { id: 'nw_locked1', type: 'compute', position: { x: -600, y: -1080 }, data: { ...C('Observatory', 'hard', { data: 800000, rp: 30 }), unlocked: true, fixedPuzzleTemplate: 'calculator' } },

  // DATA MINE CLUSTER (far south — for Ch1 for-loop quest)
  { id: 'cluster_hub', type: 'empty',    position: { x: 0,    y: 1400 },  data: Y('Cluster Relay', { data: 30000 }) },
  { id: 'cluster_m1',  type: 'resource', position: { x: 0,    y: 1200 },  data: MC('Micro Mine A', 10, { data: 5000 }) },
  { id: 'cluster_m2',  type: 'resource', position: { x: 200,  y: 1300 },  data: MC('Micro Mine B', 10, { data: 5000 }) },
  { id: 'cluster_m3',  type: 'resource', position: { x: 200,  y: 1500 },  data: MC('Micro Mine C', 10, { data: 5000 }) },
  { id: 'cluster_m4',  type: 'resource', position: { x: 0,    y: 1600 },  data: MC('Micro Mine D', 10, { data: 5000 }) },
  { id: 'cluster_m5',  type: 'resource', position: { x: -200, y: 1500 },  data: MC('Micro Mine E', 10, { data: 5000 }) },
  { id: 'cluster_m6',  type: 'resource', position: { x: -200, y: 1300 },  data: MC('Micro Mine F', 10, { data: 5000 }) },
];

export const INITIAL_EDGES = [
  // Hub spokes
  { id: 'e1',  source: 'hub',       target: 'n_relay1' },
  { id: 'e2',  source: 'hub',       target: 'ne_relay1' },
  { id: 'e3',  source: 'hub',       target: 'e_relay1' },
  { id: 'e4',  source: 'hub',       target: 'se_relay1' },
  { id: 'e5',  source: 'hub',       target: 's_relay1' },
  { id: 'e6',  source: 'hub',       target: 'sw_relay1' },
  { id: 'e7',  source: 'hub',       target: 'w_relay1' },
  { id: 'e8',  source: 'hub',       target: 'nw_relay1' },
  // North Mining District
  { id: 'e10', source: 'n_relay1',  target: 'n_mine1' },
  { id: 'e11', source: 'n_relay1',  target: 'n_mine2' },
  { id: 'e12', source: 'n_relay1',  target: 'n_relay2' },
  { id: 'e13', source: 'n_relay2',  target: 'n_mine3' },
  { id: 'e14', source: 'n_relay2',  target: 'n_mine4' },
  { id: 'e15', source: 'n_relay2',  target: 'n_empty1' },
  { id: 'e16', source: 'n_empty1',  target: 'n_deep1' },
  { id: 'e17', source: 'n_mine3',   target: 'n_deep2' },
  // Northeast Compute Cluster
  { id: 'e20', source: 'ne_relay1', target: 'ne_comp1' },
  { id: 'e21', source: 'ne_relay1', target: 'ne_mine1' },
  { id: 'e22', source: 'ne_comp1',  target: 'ne_relay2' },
  { id: 'e23', source: 'ne_relay2', target: 'ne_comp2' },
  { id: 'e24', source: 'ne_relay2', target: 'ne_comp3' },
  { id: 'e25', source: 'ne_relay2', target: 'ne_empty1' },
  { id: 'e26', source: 'ne_comp2',  target: 'ne_comp4' },
  { id: 'e27', source: 'ne_comp3',  target: 'ne_comp4' },
  // East Trade Route
  { id: 'e30', source: 'e_relay1',  target: 'e_mine1' },
  { id: 'e31', source: 'e_relay1',  target: 'e_mine2' },
  { id: 'e32', source: 'e_mine1',   target: 'e_relay2' },
  { id: 'e33', source: 'e_relay2',  target: 'e_empty1' },
  { id: 'e34', source: 'e_relay2',  target: 'e_mine3' },
  { id: 'e35', source: 'e_relay2',  target: 'e_mine4' },
  { id: 'e36', source: 'e_mine3',   target: 'e_empty2' },
  // Southeast Deep Territory
  { id: 'e40', source: 'se_relay1', target: 'se_mine1' },
  { id: 'e41', source: 'se_relay1', target: 'se_comp1' },
  { id: 'e42', source: 'se_mine1',  target: 'se_relay2' },
  { id: 'e43', source: 'se_relay2', target: 'se_mine2' },
  { id: 'e44', source: 'se_relay2', target: 'se_empty1' },
  { id: 'e45', source: 'se_comp1',  target: 'se_locked1' },
  // South Backbone
  { id: 'e50', source: 's_relay1',  target: 's_relay2' },
  { id: 'e51', source: 's_relay1',  target: 's_mine1' },
  { id: 'e53', source: 's_relay2',  target: 's_mine2' },
  { id: 'e54', source: 's_relay2',  target: 's_mine3' },
  { id: 'e55', source: 's_relay2',  target: 's_empty1' },
  // Southwest Defense
  { id: 'e60', source: 'sw_relay1', target: 'sw_mine1' },
  { id: 'e61', source: 'sw_relay1', target: 'sw_mine2' },
  { id: 'e62', source: 'sw_mine2',  target: 'sw_relay2' },
  { id: 'e63', source: 'sw_relay2', target: 'sw_comp1' },
  { id: 'e64', source: 'sw_mine1',  target: 'sw_empty1' },
  { id: 'e65', source: 'sw_mine1',  target: 'sw_locked1' },
  // West Relay Network
  { id: 'e70', source: 'w_relay1',  target: 'w_mine1' },
  { id: 'e71', source: 'w_relay1',  target: 'w_relay2' },
  { id: 'e72', source: 'w_relay2',  target: 'w_empty1' },
  { id: 'e73', source: 'w_relay2',  target: 'w_mine2' },
  // Northwest Research
  { id: 'e80', source: 'nw_relay1', target: 'nw_mine1' },
  { id: 'e81', source: 'nw_relay1', target: 'nw_comp1' },
  { id: 'e82', source: 'nw_comp1',  target: 'nw_relay2' },
  { id: 'e83', source: 'nw_relay2', target: 'nw_comp2' },
  { id: 'e84', source: 'nw_relay2', target: 'nw_empty1' },
  { id: 'e85', source: 'nw_relay2', target: 'nw_locked1' },
  // Cross-region links
  { id: 'e90', source: 's_relay1',  target: 'sw_relay1' },
  { id: 'e91', source: 's_relay1',  target: 'se_relay1' },
  { id: 'e92', source: 'w_relay1',  target: 'nw_relay1' },
  { id: 'e93', source: 'n_relay1',  target: 'nw_relay1' },
  { id: 'e94', source: 'ne_relay1', target: 'e_relay1' },
  { id: 'e95', source: 'e_relay1',  target: 'se_relay1' },
  { id: 'e96', source: 'w_relay1',  target: 'sw_relay1' },
  // East API Cluster edges
  { id: 'eapi1', source: 'e_mine3',   target: 'api_east_1' },
  { id: 'eapi2', source: 'api_east_1', target: 'api_east_2' },
  { id: 'eapi3', source: 'api_east_2', target: 'auth_iam1' },
  { id: 'eapi4', source: 'e_empty2',  target: 'auth_iam1' },
  // Data Mine Cluster
  { id: 'ec1', source: 's_empty1',    target: 'cluster_hub' },
  { id: 'ec2', source: 'cluster_hub', target: 'cluster_m1' },
  { id: 'ec3', source: 'cluster_hub', target: 'cluster_m2' },
  { id: 'ec4', source: 'cluster_hub', target: 'cluster_m3' },
  { id: 'ec5', source: 'cluster_hub', target: 'cluster_m4' },
  { id: 'ec6', source: 'cluster_hub', target: 'cluster_m5' },
  { id: 'ec7', source: 'cluster_hub', target: 'cluster_m6' },
];

export const INITIAL_RESOURCES: Resources = { data: 50000, rp: 0, credits: 0 };

export const INITIAL_PLAYER_INVENTORY: InventoryItem[] = [
  { id: 'starter-pick', itemType: 'pickaxe_basic', count: 1, metadata: { efficiency: 1.0 } },
];
