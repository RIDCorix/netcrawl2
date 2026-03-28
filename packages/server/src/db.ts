/**
 * Lightweight JSON-based persistence store.
 * Stores all game state in a single JSON file.
 * No native bindings needed.
 */

import path from 'path';
import fs from 'fs';

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
}

// ── Initial data ──────────────────────────────────────────────────────────────

export const INITIAL_NODES = [
  // ── Core (center) ──
  { id: 'hub', type: 'hub', position: { x: 0, y: 0 }, data: { label: 'Hub', unlocked: true, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] } },

  // ── North branch ──
  { id: 'r1', type: 'resource', position: { x: -100, y: -280 }, data: { label: 'Data Mine Alpha', resource: 'data', rate: 50, unlocked: false, unlockCost: { data: 100 }, mineable: true, drops: [], mineCount: 0, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] } },

  // ── Northeast branch ──
  { id: 'r2', type: 'resource', position: { x: 350, y: -200 }, data: { label: 'Data Mine Beta', resource: 'data', rate: 30, unlocked: false, unlockCost: { data: 200 }, mineable: true, drops: [], mineCount: 0, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] } },
  { id: 'locked1', type: 'locked', position: { x: 650, y: -350 }, data: { label: 'Deep Shaft', unlocked: false, unlockCost: { data: 5000, rp: 10 }, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] } },

  // ── East branch (Data + Compute) ──
  { id: 'r3', type: 'resource', position: { x: 400, y: 180 }, data: { label: 'Data Mine Gamma', resource: 'data', rate: 20, unlocked: false, unlockCost: { data: 300 }, mineable: true, drops: [], mineCount: 0, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] } },
  { id: 'c2', type: 'compute', position: { x: 700, y: 100 }, data: { label: 'Compute Beta', unlocked: false, unlockCost: { data: 2000, rp: 5 }, difficulty: 'medium', rewardResource: 'rp', solveCount: 0, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] } },

  // ── West branch (Relay network) ──
  { id: 'relay2', type: 'relay', position: { x: -350, y: -80 }, data: { label: 'Relay Beta', unlocked: false, unlockCost: { data: 150 }, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] } },

  // ── South branch (Relay + Compute) ──
  { id: 'relay1', type: 'relay', position: { x: -200, y: 300 }, data: { label: 'Relay Alpha', unlocked: false, unlockCost: { data: 80 }, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] } },
  { id: 'c1', type: 'compute', position: { x: -50, y: 500 }, data: { label: 'Compute Alpha', unlocked: false, unlockCost: { data: 500 }, difficulty: 'easy', rewardResource: 'rp', solveCount: 0, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] } },

  // ── Empty nodes (buildable) ──
  { id: 'empty1', type: 'empty', position: { x: -500, y: 150 }, data: { label: 'Open Slot', unlocked: false, unlockCost: { data: 1000, rp: 5 }, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] } },
  { id: 'empty2', type: 'empty', position: { x: 500, y: -50 }, data: { label: 'Open Slot', unlocked: false, unlockCost: { data: 2000, rp: 10 }, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] } },
];

export const INITIAL_EDGES = [
  // Hub connections (star topology from center)
  { id: 'e1', source: 'hub', target: 'r1' },
  { id: 'e2', source: 'hub', target: 'r2' },
  { id: 'e3', source: 'hub', target: 'r3' },
  { id: 'e4', source: 'hub', target: 'relay1' },
  { id: 'e6', source: 'hub', target: 'relay2' },
  // Branches outward
  { id: 'e5', source: 'r2', target: 'locked1' },
  { id: 'e7', source: 'relay1', target: 'relay2' },
  { id: 'e8', source: 'relay1', target: 'c1' },
  { id: 'e9', source: 'r3', target: 'c2' },
  { id: 'e10', source: 'locked1', target: 'c2' },
  // Empty node connections
  { id: 'e11', source: 'relay2', target: 'empty1' },
  { id: 'e12', source: 'r3', target: 'empty2' },
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
