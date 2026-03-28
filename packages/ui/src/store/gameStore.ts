import { create } from 'zustand';

export interface Resources {
  energy: number;
  ore: number;
  data: number;
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
  playerInventory: InventoryItem[];
  inventoryOpen: boolean;
}

interface GameActions {
  setState: (state: Partial<GameState>) => void;
  setConnected: (connected: boolean) => void;
  selectNode: (nodeId: string | null) => void;
  updateFromServer: (data: any) => void;
  toggleInventory: () => void;
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
  playerInventory: [],
  inventoryOpen: false,

  setState: (partial) => set((state) => ({ ...state, ...partial })),
  setConnected: (connected) => set({ connected }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  toggleInventory: () => set((state) => ({ inventoryOpen: !state.inventoryOpen })),
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
    }));
  },
}));
