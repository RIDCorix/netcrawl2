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
  [key: string]: any;
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

export interface Worker {
  id: string;
  node_id: string;
  class_name: string;
  commit_hash: string;
  status: 'idle' | 'moving' | 'harvesting' | 'dead' | 'crashed';
  current_node: string;
  carrying: Partial<Resources>;
  pid: number | null;
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
}

interface GameActions {
  setState: (state: Partial<GameState>) => void;
  setConnected: (connected: boolean) => void;
  selectNode: (nodeId: string | null) => void;
  updateFromServer: (data: any) => void;
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

  setState: (partial) => set((state) => ({ ...state, ...partial })),
  setConnected: (connected) => set({ connected }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  updateFromServer: (data) => {
    set((state) => ({
      nodes: data.nodes ?? state.nodes,
      edges: data.edges ?? state.edges,
      resources: data.resources ?? state.resources,
      tick: data.tick ?? state.tick,
      gameOver: data.gameOver ?? state.gameOver,
      workers: data.workers ?? state.workers,
    }));
  },
}));
