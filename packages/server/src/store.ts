/**
 * Store core — singleton state management, multi-user resolution, persistence.
 * All domain modules import `resolveStore` from here.
 */

import path from 'path';
import fs from 'fs';
import { INITIAL_LEVEL_STATE, type LevelState } from './levelSystem.js';
import { getUpgradeKey, getNodeXpThreshold, NODE_UPGRADE_DEFS } from './upgradeDefinitions.js';
import { QUESTS } from './questDefinitions.js';
import {
  type Store, type InventoryItem,
  INITIAL_NODES, INITIAL_EDGES, INITIAL_RESOURCES, INITIAL_PLAYER_INVENTORY, INITIAL_FLOP,
} from './types.js';

// ── Module state ────────────────────────────────────────────────────────────

let _dataDir = process.env.NETCRAWL_DATA_DIR || process.cwd();
let DATA_PATH = path.join(_dataDir, 'data', 'netcrawl-state.json');

const isMultiUser = () => process.env.NETCRAWL_MULTI_USER === 'true';
let _currentUserId: string | null = null;

const userStores = new Map<string, Store>();
const userDataPaths = new Map<string, string>();

let store: Store;

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
  layer_manager: {
    currentLayer: 0,
    unlockedLayers: [0],
    snapshots: {},
  },
};

// ── Public API ──────────────────────────────────────────────────────────────

/** Set data directory before calling initDb(). Used by Electron main process. */
export function setDataDir(dir: string) {
  _dataDir = dir;
  DATA_PATH = path.join(_dataDir, 'data', 'netcrawl-state.json');
}

/**
 * In multi-user mode, ensure a specific user's state is loaded.
 * Safe to call concurrently — only loads once per user.
 */
export function setCurrentUser(userId: string) {
  if (!isMultiUser()) return;

  _currentUserId = userId;

  if (userStores.has(userId)) return;

  const userDir = path.join(_dataDir, 'data', 'users', userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  const userDataPath = path.join(userDir, 'state.json');
  userDataPaths.set(userId, userDataPath);

  const savedPath = DATA_PATH;
  const savedStore = store;
  DATA_PATH = userDataPath;
  _loadStore();
  userStores.set(userId, store);
  store = savedStore;
  DATA_PATH = savedPath;
}

/** Get the current user ID (null in single-user mode) */
export function getCurrentUserId(): string | null {
  return _currentUserId;
}

/**
 * Resolve the store for a given userId.
 * In multi-user mode: uses explicit userId if provided, otherwise falls back to _currentUserId.
 * In single-user mode: always returns the default store.
 */
export function resolveStore(userId?: string): Store {
  if (isMultiUser()) {
    const effectiveId = userId || _currentUserId;
    if (effectiveId && userStores.has(effectiveId)) {
      return userStores.get(effectiveId)!;
    }
  }
  return store;
}

/** Get all active user IDs with loaded stores (for game tick). */
export function getAllActiveUserIds(): string[] {
  return Array.from(userStores.keys());
}

/** Initialize the store and start periodic persistence. */
export function initDb() {
  _loadStore();
  setInterval(persistAll, 5000);
}

// ── Persistence ─────────────────────────────────────────────────────────────

function persist() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('[DB] Persist failed:', err);
  }
}

/** Persist all stores — default store + all per-user stores. */
function persistAll() {
  persist();
  for (const [userId, userStore] of userStores.entries()) {
    const userPath = userDataPaths.get(userId);
    if (!userPath) continue;
    try {
      fs.writeFileSync(userPath, JSON.stringify(userStore, null, 2));
    } catch (err) {
      console.error(`[DB] Persist failed for user ${userId}:`, err);
    }
  }
}

/**
 * Force-persist (used by restoreAutosave and resetGameState).
 * In multi-user mode, persists the specific user's store.
 */
export function forcePersist(userId?: string) {
  if (isMultiUser() && userId) {
    const userPath = userDataPaths.get(userId);
    const userStore = userStores.get(userId);
    if (userPath && userStore) {
      try { fs.writeFileSync(userPath, JSON.stringify(userStore, null, 2)); } catch {}
    }
  } else {
    persist();
  }
}

/** Get a fresh copy of the initial store. */
export function getInitialStore(): Store {
  return JSON.parse(JSON.stringify(INITIAL_STORE));
}

// ── Inline inventory helper for migration ───────────────────────────────────
// Avoids circular dependency with domain/inventory.ts

function _addToPlayerInventoryDirect(inv: InventoryItem[], itemType: string, count: number) {
  const existing = inv.find(i => i.itemType === itemType);
  if (existing) {
    existing.count += count;
  } else {
    inv.push({
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      itemType: itemType as InventoryItem['itemType'],
      count,
    });
  }
}

// ── Inline sweepNodeAutoUpgrades for migration ──────────────────────────────
// Avoids circular dependency with domain/nodeXp.ts

function _sweepNodeAutoUpgrades(): boolean {
  const state = store.game_state;
  let changed = false;

  for (let i = 0; i < state.nodes.length; i++) {
    const node = state.nodes[i];
    const key = getUpgradeKey(node.type, node.data.resource);
    const upgrades = NODE_UPGRADE_DEFS[key];
    if (!upgrades) continue;

    const currentLevel = node.data.upgradeLevel || 0;
    const maxLevel = upgrades.length;
    if (currentLevel >= maxLevel) continue;

    const threshold = getNodeXpThreshold(key, currentLevel + 1);
    if (threshold <= 0) continue;

    const nodeXp = node.data.nodeXp || 0;
    if (nodeXp < threshold) continue;

    const nextUpgrade = upgrades.find(u => u.level === currentLevel + 1);
    if (!nextUpgrade) continue;

    const newLevel = nextUpgrade.level;
    const nextThreshold = getNodeXpThreshold(key, newLevel + 1);
    const data = {
      ...node.data,
      upgradeLevel: newLevel,
      nodeXp: 0,
      nodeXpToNext: nextThreshold,
      enhancementPoints: (node.data.enhancementPoints || 0) + (nextUpgrade.enhancementPoints || 2),
      statAlloc: node.data.statAlloc || {},
    };
    if (nextUpgrade.effects.rateBonus) data.rate = (data.rate || 0) + nextUpgrade.effects.rateBonus;
    if (nextUpgrade.effects.chipSlots !== undefined) data.chipSlots = nextUpgrade.effects.chipSlots;
    if (nextUpgrade.effects.autoCollect) data.autoCollect = true;
    if (nextUpgrade.effects.defenseBonus) data.defense = (data.defense || 0) + nextUpgrade.effects.defenseBonus;

    state.nodes[i] = { ...node, data };
    changed = true;
  }

  return changed;
}

// ── Store loading with migrations ───────────────────────────────────────────

function _loadStore() {
  const dataDir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

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

      // Migrate existing nodes to add mineable/items
      store.game_state.nodes = store.game_state.nodes.map((n: any) => {
        const init = INITIAL_NODES.find(in_ => in_.id === n.id);
        if (init && (init.data as any).mineable && !n.data.mineable) {
          return { ...n, data: { ...n.data, mineable: true, items: n.data.items || [], mineCount: n.data.mineCount || 0 } };
        }
        return n;
      });

      // Migrate: drops → items, amount → count
      for (const node of store.game_state.nodes) {
        if (node.data.drops && !node.data.items) {
          node.data.items = (node.data.drops as any[]).map((d: any) => ({ type: d.type, count: d.amount || d.count || 1 }));
          delete node.data.drops;
        } else if (node.data.drops && node.data.items) {
          delete node.data.drops;
        }
        if (Array.isArray(node.data.items)) {
          node.data.items = node.data.items.map((d: any) => ({ type: d.type, count: d.amount || d.count || 1 }));
        }
      }

      // Migrate worker holding: amount → count
      for (const w of Object.values(store.workers)) {
        if (Array.isArray(w.holding)) {
          w.holding = w.holding.map((h: any) => ({ type: h.type, count: h.amount || h.count || 1 }));
        }
      }

      // Migrate: convert legacy 'relay' type to 'empty'
      store.game_state.nodes = store.game_state.nodes.map((n: any) =>
        n.type === 'relay' ? { ...n, type: 'empty' } : n
      );

      // Migrate workers to add holding/equippedPickaxe/equippedCpu/equippedRam
      for (const w of Object.values(store.workers)) {
        if (w.holding === undefined || w.holding === null) (w as any).holding = [];
        if (w.equippedPickaxe === undefined) (w as any).equippedPickaxe = null;
        if (w.equippedCpu === undefined) (w as any).equippedCpu = null;
        if (w.equippedRam === undefined) (w as any).equippedRam = null;
      }

      // Clean up stale workers from previous session
      const inv = store.game_state.playerInventory || [];
      for (const w of Object.values(store.workers)) {
        if (['running', 'moving', 'harvesting', 'deploying', 'suspending'].includes(w.status)) {
          if (w.equippedPickaxe) {
            const existing = inv.find((i: any) => i.itemType === w.equippedPickaxe!.itemType);
            if (existing) existing.count += 1;
            else inv.push({ id: `item_${Date.now()}`, itemType: w.equippedPickaxe.itemType as any, count: 1, metadata: { efficiency: w.equippedPickaxe.efficiency } });
          }
          if (w.equippedCpu) _addToPlayerInventoryDirect(inv, w.equippedCpu.itemType, w.equippedCpu.count || 1);
          if (w.equippedRam) _addToPlayerInventoryDirect(inv, w.equippedRam.itemType, w.equippedRam.count || 1);
          for (const heldItem of (w.holding || [])) {
            const existing = inv.find((i: any) => i.itemType === heldItem.type);
            if (existing) existing.count += heldItem.count || 1;
          }
          w.status = 'suspended';
          w.pid = null;
          (w as any).equippedPickaxe = null;
          (w as any).equippedCpu = null;
          (w as any).equippedRam = null;
          (w as any).holding = [];
          console.log(`[initDb] Cleaned up stale worker ${w.id} (was ${w.status})`);
        }
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

      if (!store.game_state.playerChips) (store.game_state as any).playerChips = [];
      if (!store.achievement_state) store.achievement_state = { unlocked: {}, stats: {}, statArrays: {} };
      if (!store.quest_state) store.quest_state = { questStatus: {}, activePassives: {}, unlockedRecipes: [], claimedAt: {} };
      if (!store.level_state) store.level_state = { ...INITIAL_LEVEL_STATE };

      // Migrate: initialize nodeXpToNext for unlocked nodes
      store.game_state.nodes = store.game_state.nodes.map((n: any) => {
        if (n.data.nodeXpToNext === undefined && (n.data.unlocked || n.id === 'hub')) {
          const key = getUpgradeKey(n.type, n.data.resource);
          const currentLevel = n.data.upgradeLevel || 0;
          const threshold = getNodeXpThreshold(key, currentLevel + 1);
          return { ...n, data: { ...n.data, nodeXp: n.data.nodeXp || 0, nodeXpToNext: threshold } };
        }
        return n;
      });

      // Migrate: sync node positions from INITIAL_NODES
      const positionMap = new Map(INITIAL_NODES.map(n => [n.id, n.position]));
      store.game_state.nodes = store.game_state.nodes.map((n: any) => {
        const pos = positionMap.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });

      // Migrate: add layer_manager
      if (!store.layer_manager) {
        store.layer_manager = {
          currentLayer: 0,
          unlockedLayers: [0],
          snapshots: {
            0: {
              nodes: store.game_state.nodes,
              edges: store.game_state.edges,
              workers: store.workers,
              flop: store.game_state.flop,
              tick: store.game_state.tick,
              gameOver: store.game_state.gameOver,
            },
          },
        };
      }

      // Migrate: add base fields
      store.game_state.nodes = store.game_state.nodes.map((n: any) => ({
        ...n,
        data: {
          ...n.data,
          enhancementPoints: n.data.enhancementPoints ?? 0,
          statAlloc: n.data.statAlloc ?? {},
          baseRate: n.data.baseRate ?? n.data.rate ?? 0,
          baseChipSlots: n.data.baseChipSlots ?? n.data.chipSlots ?? 0,
          baseDefense: n.data.baseDefense ?? 0,
        },
      }));

      // Migrate: Chapter 1 graduation Observatory
      store.game_state.nodes = store.game_state.nodes.map((n: any) => {
        if (n.id !== 'nw_locked1') return n;
        return {
          ...n,
          type: 'compute',
          data: {
            ...n.data,
            unlocked: true,
            difficulty: n.data.difficulty || 'hard',
            rewardResource: n.data.rewardResource || 'rp',
            solveCount: n.data.solveCount || 0,
            fixedPuzzleTemplate: 'calculator',
          },
        };
      });

      // Migrate: East trade route → Operator Academy (diamond)
      // Removes old mine/relay/empty nodes and inserts new compute nodes.
      {
        const OLD_EAST = new Set(['e_mine1', 'e_mine2', 'e_relay2', 'e_empty1', 'e_mine3', 'e_mine4', 'e_empty2']);
        const NEW_EAST = ['e_types', 'e_op_add', 'e_op_sub', 'e_op_mul', 'e_op_div', 'e_op_mod', 'e_calc'];
        const hasOld = store.game_state.nodes.some((n: any) => OLD_EAST.has(n.id));
        const hasAllNew = NEW_EAST.every((id) => store.game_state.nodes.some((n: any) => n.id === id));
        if (hasOld || !hasAllNew) {
          store.game_state.nodes = store.game_state.nodes.filter((n: any) => !OLD_EAST.has(n.id));
          for (const newId of NEW_EAST) {
            if (!store.game_state.nodes.some((n: any) => n.id === newId)) {
              const template = INITIAL_NODES.find((n: any) => n.id === newId);
              if (template) store.game_state.nodes.push(JSON.parse(JSON.stringify(template)));
            }
          }
          // Rebuild edges: drop any edge touching a removed node, then re-add
          // the full new east wiring from INITIAL_EDGES.
          const removedNodeIds = new Set(OLD_EAST);
          store.game_state.edges = store.game_state.edges.filter(
            (e: any) => !removedNodeIds.has(e.source) && !removedNodeIds.has(e.target),
          );
          const NEW_EAST_EDGE_IDS = ['e30', 'e31', 'e32', 'e33', 'e34', 'e35', 'e36', 'e37', 'e38', 'e39', 'e3a', 'eapi1', 'eapi2', 'eapi3', 'eapi4'];
          const existingEdgeIds = new Set(store.game_state.edges.map((e: any) => e.id));
          for (const eid of NEW_EAST_EDGE_IDS) {
            if (existingEdgeIds.has(eid)) continue;
            const template = INITIAL_EDGES.find((e: any) => e.id === eid);
            if (template) store.game_state.edges.push({ ...template });
          }
          // Sync layer 0 snapshot so graph stays consistent
          if (store.layer_manager?.snapshots?.[0]) {
            store.layer_manager.snapshots[0].nodes = store.game_state.nodes;
            store.layer_manager.snapshots[0].edges = store.game_state.edges;
          }
        }

        // Label sync — keep operator nodes' labels aligned with the canonical
        // INITIAL_NODES so rename rollouts reach existing saves.
        const labelMap = new Map(
          NEW_EAST.map((id) => [id, INITIAL_NODES.find((n: any) => n.id === id)?.data?.label])
            .filter(([, label]) => !!label) as [string, string][],
        );
        store.game_state.nodes = store.game_state.nodes.map((n: any) => {
          const canonical = labelMap.get(n.id);
          if (!canonical || n.data?.label === canonical) return n;
          return { ...n, data: { ...n.data, label: canonical } };
        });
        if (store.layer_manager?.snapshots?.[0]) {
          store.layer_manager.snapshots[0].nodes = store.game_state.nodes;
        }
      }

      // Migrate: retroactively unlock recipes for already-claimed quests
      {
        const qs = store.quest_state;
        for (const quest of QUESTS) {
          const status = qs.questStatus?.[quest.id];
          if (status !== 'claimed') continue;
          for (const reward of quest.rewards) {
            if (reward.kind === 'recipe_unlock') {
              if (!qs.unlockedRecipes.includes(reward.recipeId)) {
                qs.unlockedRecipes.push(reward.recipeId);
              }
            }
          }
        }
      }

      // Auto-upgrade any nodes that already have full XP
      if (_sweepNodeAutoUpgrades()) {
        console.log('[initDb] Auto-upgraded nodes with full XP');
      }
    } catch {
      console.warn('[DB] Could not parse state file, starting fresh');
      store = JSON.parse(JSON.stringify(INITIAL_STORE));
    }
  } else {
    store = JSON.parse(JSON.stringify(INITIAL_STORE));
  }
}
