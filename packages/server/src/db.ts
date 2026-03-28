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

export interface GameStateRow {
  nodes: any[];
  edges: any[];
  resources: Resources;
  tick: number;
  gameOver: boolean;
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
}

export interface WorkerLogRow {
  id: number;
  worker_id: string;
  message: string;
  created_at: string;
}

interface Store {
  game_state: GameStateRow;
  workers: Record<string, WorkerRow>;
  worker_logs: WorkerLogRow[];
  next_log_id: number;
}

// ── Initial data ──────────────────────────────────────────────────────────────

export const INITIAL_NODES = [
  { id: 'hub', type: 'hub', position: { x: 300, y: 250 }, data: { label: 'Hub', unlocked: true } },
  { id: 'r1', type: 'resource', position: { x: 150, y: 100 }, data: { label: 'Energy Node', resource: 'energy', rate: 5, unlocked: false, unlockCost: { energy: 20 } } },
  { id: 'r2', type: 'resource', position: { x: 500, y: 120 }, data: { label: 'Ore Mine', resource: 'ore', rate: 3, unlocked: false, unlockCost: { energy: 30 } } },
  { id: 'r3', type: 'resource', position: { x: 480, y: 380 }, data: { label: 'Data Cache', resource: 'data', rate: 2, unlocked: false, unlockCost: { energy: 40, ore: 20 } } },
  { id: 'relay1', type: 'relay', position: { x: 320, y: 420 }, data: { label: 'Relay Alpha', unlocked: false, unlockCost: { energy: 50, ore: 30 } } },
  { id: 'locked1', type: 'locked', position: { x: 650, y: 280 }, data: { label: 'Unknown Node', unlocked: false, unlockCost: { energy: 100, ore: 50, data: 20 } } },
  { id: 'infected1', type: 'infected', position: { x: 100, y: 350 }, data: { label: 'Infected Node', infected: true, unlocked: true } },
];

export const INITIAL_EDGES = [
  { id: 'e1', source: 'hub', target: 'r1' },
  { id: 'e2', source: 'hub', target: 'r2' },
  { id: 'e3', source: 'hub', target: 'r3' },
  { id: 'e4', source: 'hub', target: 'relay1' },
  { id: 'e5', source: 'relay1', target: 'locked1' },
  { id: 'e6', source: 'hub', target: 'infected1' },
];

export const INITIAL_RESOURCES: Resources = { energy: 50, ore: 0, data: 0 };

const INITIAL_STORE: Store = {
  game_state: {
    nodes: INITIAL_NODES,
    edges: INITIAL_EDGES,
    resources: INITIAL_RESOURCES,
    tick: 0,
    gameOver: false,
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
