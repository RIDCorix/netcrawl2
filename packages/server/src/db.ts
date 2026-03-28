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
  energy: number;
  ore: number;
  data: number;
}

// === Drop System ===
export interface Drop {
  id: string;           // uuid
  type: 'ore_chunk' | 'energy_crystal' | 'data_shard';
  amount: number;
}

// === Player Inventory ===
export interface InventoryItem {
  id: string;
  itemType: 'pickaxe_basic' | 'pickaxe_iron' | 'pickaxe_diamond' | 'shield' | 'beacon' | 'ore_chunk' | 'energy_crystal' | 'data_shard' | 'chip_pack_basic' | 'chip_pack_premium' | 'scanner' | 'signal_booster' | 'overclock_kit' | 'antivirus_module' | 'memory_allocator' | 'fullstack_pickaxe';
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
  status: 'deploying' | 'running' | 'suspending' | 'suspended' | 'crashed' | 'idle' | 'moving' | 'harvesting' | 'dead';
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
  ore?: number;
  energy?: number;
  data?: number;
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
    cost: { ore: 20 },
  },
  {
    id: 'pickaxe_iron',
    name: 'Iron Pickaxe',
    description: 'Stronger pick. efficiency 1.5×. Yields 1-2 drops.',
    output: { itemType: 'pickaxe_iron', count: 1, metadata: { efficiency: 1.5 } },
    cost: { ore: 50, energy: 30 },
  },
  {
    id: 'pickaxe_diamond',
    name: 'Diamond Pickaxe',
    description: 'Finest tool. efficiency 2.5×. Yields 2-3 drops.',
    output: { itemType: 'pickaxe_diamond', count: 1, metadata: { efficiency: 2.5 } },
    cost: { ore: 100, energy: 60, data: 40 },
  },
  {
    id: 'shield',
    name: 'Shield',
    description: 'Protects worker from infection damage.',
    output: { itemType: 'shield', count: 1 },
    cost: { energy: 30, ore: 20 },
  },
  {
    id: 'beacon',
    name: 'Beacon',
    description: 'Increases scan radius for workers.',
    output: { itemType: 'beacon', count: 1 },
    cost: { data: 50 },
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
  { id: 'hub', type: 'hub', position: { x: 400, y: 300 }, data: { label: 'Hub', unlocked: true, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] } },
  { id: 'r1', type: 'resource', position: { x: 200, y: 120 }, data: { label: 'Energy Node', resource: 'energy', rate: 5, unlocked: false, unlockCost: { energy: 20 }, mineable: true, drops: [], mineCount: 0, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] } },
  { id: 'r2', type: 'resource', position: { x: 620, y: 120 }, data: { label: 'Ore Mine', resource: 'ore', rate: 3, unlocked: false, unlockCost: { energy: 30 }, mineable: true, drops: [], mineCount: 0, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] } },
  { id: 'r3', type: 'resource', position: { x: 620, y: 480 }, data: { label: 'Data Cache', resource: 'data', rate: 2, unlocked: false, unlockCost: { energy: 40, ore: 20 }, mineable: true, drops: [], mineCount: 0, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] } },
  { id: 'relay1', type: 'relay', position: { x: 200, y: 480 }, data: { label: 'Relay Alpha', unlocked: false, unlockCost: { energy: 15 }, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] } },
  { id: 'relay2', type: 'relay', position: { x: 80, y: 300 }, data: { label: 'Relay Beta', unlocked: false, unlockCost: { energy: 25 }, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] } },
  { id: 'locked1', type: 'locked', position: { x: 750, y: 300 }, data: { label: 'Unknown Node', unlocked: false, unlockCost: { energy: 100, ore: 50, data: 20 }, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] } },
];

export const INITIAL_EDGES = [
  { id: 'e1', source: 'hub', target: 'r1' },
  { id: 'e2', source: 'hub', target: 'r2' },
  { id: 'e3', source: 'hub', target: 'r3' },
  { id: 'e4', source: 'hub', target: 'relay1' },
  { id: 'e5', source: 'r2', target: 'locked1' },
  { id: 'e6', source: 'hub', target: 'relay2' },
  { id: 'e7', source: 'relay1', target: 'relay2' },
];

export const INITIAL_RESOURCES: Resources = { energy: 50, ore: 0, data: 0 };

export const INITIAL_PLAYER_INVENTORY: InventoryItem[] = [
  { id: 'starter-pick', itemType: 'pickaxe_basic', count: 1, metadata: { efficiency: 1.0 } },
];

const INITIAL_STORE: Store = {
  game_state: {
    nodes: INITIAL_NODES,
    edges: INITIAL_EDGES,
    resources: INITIAL_RESOURCES,
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
