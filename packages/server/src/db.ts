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
  itemType: 'pickaxe_basic' | 'pickaxe_iron' | 'pickaxe_diamond' | 'shield' | 'beacon' | 'ore_chunk' | 'energy_crystal' | 'data_shard';
  count: number;
  metadata?: {
    efficiency?: number;
  };
}

export interface GameStateRow {
  nodes: any[];
  edges: any[];
  resources: Resources;
  tick: number;
  gameOver: boolean;
  playerInventory: InventoryItem[];
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

interface Store {
  game_state: GameStateRow;
  workers: Record<string, WorkerRow>;
  worker_logs: WorkerLogRow[];
  next_log_id: number;
}

// ── Initial data ──────────────────────────────────────────────────────────────

export const INITIAL_NODES = [
  { id: 'hub', type: 'hub', position: { x: 400, y: 300 }, data: { label: 'Hub', unlocked: true } },
  { id: 'r1', type: 'resource', position: { x: 200, y: 120 }, data: { label: 'Energy Node', resource: 'energy', rate: 5, unlocked: false, unlockCost: { energy: 20 }, mineable: true, drops: [], mineCount: 0 } },
  { id: 'r2', type: 'resource', position: { x: 620, y: 120 }, data: { label: 'Ore Mine', resource: 'ore', rate: 3, unlocked: false, unlockCost: { energy: 30 }, mineable: true, drops: [], mineCount: 0 } },
  { id: 'r3', type: 'resource', position: { x: 620, y: 480 }, data: { label: 'Data Cache', resource: 'data', rate: 2, unlocked: false, unlockCost: { energy: 40, ore: 20 }, mineable: true, drops: [], mineCount: 0 } },
  { id: 'relay1', type: 'relay', position: { x: 200, y: 480 }, data: { label: 'Relay Alpha', unlocked: false, unlockCost: { energy: 15 } } },
  { id: 'relay2', type: 'relay', position: { x: 80, y: 300 }, data: { label: 'Relay Beta', unlocked: false, unlockCost: { energy: 25 } } },
  { id: 'locked1', type: 'locked', position: { x: 750, y: 300 }, data: { label: 'Unknown Node', unlocked: false, unlockCost: { energy: 100, ore: 50, data: 20 } } },
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
  },
  workers: {},
  worker_logs: [],
  next_log_id: 1,
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
