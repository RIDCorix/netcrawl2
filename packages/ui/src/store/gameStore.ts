import { create } from 'zustand';

export interface Resources {
  energy: number;
  ore: number;
  data: number;
}

export type ChipRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface Chip {
  id: string;
  chipType: string;
  name: string;
  rarity: ChipRarity;
  effect: { type: string; value: number };
}

export interface NodeData {
  label: string;
  unlocked?: boolean;
  resource?: string;
  rate?: number;
  unlockCost?: Partial<Resources>;
  infected?: boolean;
  mineable?: boolean;
  drops?: Drop[];
  mineCount?: number;
  depleted?: boolean;
  depletedUntil?: number;
  upgradeLevel?: number;
  chipSlots?: number;
  installedChips?: Chip[];
  autoCollect?: boolean;
  defense?: number;
  [key: string]: any;
}

export interface Drop {
  id: string;
  type: 'ore_chunk' | 'energy_crystal' | 'data_shard';
  amount: number;
}

export interface GameNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

export interface GameEdge {
  id: string;
  source: string;
  target: string;
}

export interface InventoryItem {
  id: string;
  itemType: 'pickaxe_basic' | 'pickaxe_iron' | 'pickaxe_diamond' | 'shield' | 'beacon' | 'ore_chunk' | 'energy_crystal' | 'data_shard';
  count: number;
  metadata?: {
    efficiency?: number;
  };
}

export interface Worker {
  id: string;
  node_id: string;
  class_name: string;
  commit_hash: string;
  status: 'deploying' | 'running' | 'suspending' | 'suspended' | 'crashed' | 'idle' | 'moving' | 'harvesting' | 'dead';
  current_node: string;
  previous_node?: string;
  carrying: Partial<Resources>;
  pid: number | null;
  deployed_at?: string;
  holding?: Drop | null;
  equippedPickaxe?: { itemType: string; efficiency: number } | null;
}

export interface GameState {
  nodes: GameNode[];
  edges: GameEdge[];
  resources: Resources;
  tick: number;
  gameOver: boolean;
  workers: Worker[];
  connected: boolean;
  selectedNodeId: string | null;
  selectedWorkerId: string | null;
  playerInventory: InventoryItem[];
  playerChips: Chip[];
  inventoryOpen: boolean;
  achievements: {
    unlocked: Record<string, string>;
    stats: Record<string, number>;
    totalUnlocked: number;
    totalAchievements: number;
  };
  achievementToasts: Array<{ id: string; name: string; description: string; category: string; timestamp: number }>;
  achievementsOpen: boolean;
  // Deploy wizard — edge selection mode
  edgeSelectMode: {
    fieldName: string;
    onSelect: (edge: { source: string; target: string }) => void;
  } | null;
}

interface GameActions {
  setState: (state: Partial<GameState>) => void;
  setConnected: (connected: boolean) => void;
  selectNode: (nodeId: string | null) => void;
  selectWorker: (workerId: string | null) => void;
  updateFromServer: (data: any) => void;
  toggleInventory: () => void;
  toggleAchievements: () => void;
  addAchievementToast: (toast: { id: string; name: string; description: string; category: string }) => void;
  removeAchievementToast: (id: string) => void;
  setEdgeSelectMode: (mode: GameState['edgeSelectMode']) => void;
  setInventory: (inventory: InventoryItem[]) => void;
}

export const useGameStore = create<GameState & GameActions>((set) => ({
  nodes: [],
  edges: [],
  resources: { energy: 0, ore: 0, data: 0 },
  tick: 0,
  gameOver: false,
  workers: [],
  connected: false,
  selectedNodeId: null,
  selectedWorkerId: null,
  playerInventory: [],
  playerChips: [],
  inventoryOpen: false,
  achievements: { unlocked: {}, stats: {}, totalUnlocked: 0, totalAchievements: 0 },
  achievementToasts: [],
  achievementsOpen: false,
  edgeSelectMode: null,

  setState: (partial) => set((state) => ({ ...state, ...partial })),
  setConnected: (connected) => set({ connected }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedWorkerId: null }),
  selectWorker: (workerId) => set({ selectedWorkerId: workerId, selectedNodeId: null }),
  setEdgeSelectMode: (mode) => set({ edgeSelectMode: mode }),
  toggleInventory: () => set((state) => ({ inventoryOpen: !state.inventoryOpen })),
  toggleAchievements: () => set((state) => ({ achievementsOpen: !state.achievementsOpen })),
  addAchievementToast: (toast) => set((state) => ({
    achievementToasts: [...state.achievementToasts.slice(-2), { ...toast, timestamp: Date.now() }],
  })),
  removeAchievementToast: (id) => set((state) => ({
    achievementToasts: state.achievementToasts.filter(t => t.id !== id),
  })),
  setInventory: (inventory) => set({ playerInventory: inventory }),

  updateFromServer: (data) => {
    set((state) => ({
      nodes: data.nodes ?? state.nodes,
      edges: data.edges ?? state.edges,
      resources: data.resources ?? state.resources,
      tick: data.tick ?? state.tick,
      gameOver: data.gameOver ?? state.gameOver,
      workers: data.workers ?? state.workers,
      playerInventory: data.playerInventory ?? state.playerInventory,
      playerChips: data.playerChips ?? state.playerChips,
      achievements: data.achievements ?? state.achievements,
    }));
  },
}));
