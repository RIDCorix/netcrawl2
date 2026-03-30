import { create } from 'zustand';
import type { Language } from '../i18n/index';

export interface Resources {
  data: number;
  rp: number;
  credits: number;
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
  type: 'data_fragment' | 'rp_shard';
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
  itemType: 'pickaxe_basic' | 'pickaxe_iron' | 'pickaxe_diamond' | 'shield' | 'beacon' | 'data_fragment' | 'rp_shard' | 'chip_pack_basic' | 'chip_pack_premium' | 'scanner' | 'signal_booster' | 'overclock_kit' | 'antivirus_module' | 'memory_allocator' | 'fullstack_pickaxe' | 'cpu_basic' | 'cpu_advanced' | 'ram_basic' | 'ram_advanced';
  count: number;
  metadata?: {
    efficiency?: number;
  };
}

export interface Worker {
  id: string;
  node_id: string;
  class_name: string;
  class_icon?: string;
  commit_hash: string;
  status: 'deploying' | 'running' | 'suspending' | 'suspended' | 'crashed' | 'error' | 'idle' | 'moving' | 'harvesting' | 'dead';
  current_node: string;
  previous_node?: string;
  carrying: Partial<Resources>;
  pid: number | null;
  deployed_at?: string;
  holding?: Drop | null;
  equippedPickaxe?: { itemType: string; efficiency: number } | null;
}

export interface LevelSummary {
  level: number;
  xp: number;
  xpToNext: number;
  totalXp: number;
  title: string;
  titleZh: string;
  maxLevel: number;
  maxWorkersBonus: number;
  flopBonus: number;
  milestones: Array<{
    level: number;
    rewards: Array<{ kind: string; [key: string]: any }>;
    claimed: boolean;
  }>;
}

export interface Settings {
  edgeStyle: 'straight' | 'smoothstep' | 'bezier'
  showTrafficDots: boolean
  showWorkerDots: boolean
  keybindings: Record<string, string>
  theme: 'deep-space' | 'synthwave' | 'matrix' | 'amber' | 'ice' | 'cloud' | 'sakura' | 'arctic'
  language: Language
}

const DEFAULT_SETTINGS: Settings = {
  edgeStyle: 'straight',
  showTrafficDots: true,
  showWorkerDots: true,
  keybindings: { inventory: 'e', achievements: 'a', quests: 'q', level: 'l', settings: 'Escape' },
  theme: 'deep-space',
  language: 'en',
}

const savedSettings = (() => {
  try {
    const raw = localStorage.getItem('netcrawl-settings')
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch { return DEFAULT_SETTINGS }
})()

export interface LayerMeta {
  id: number;
  name: string;
  tagline: string;
  description: string;
  color: string;
  emoji: string;
  unlocked: boolean;
  thresholds: {
    total_data_deposited?: number;
    rp?: number;
    credits?: number;
  };
  progress: {
    total_data_deposited?: number;
    rp?: number;
    credits?: number;
  };
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
  questSummary: { total: number; claimed: number; completed: number; available: number };
  questsOpen: boolean;
  selectedQuestId: string | null;
  questToasts: Array<{ id: string; name: string; type: 'available' | 'completed'; timestamp: number }>;
  // Level system
  levelSummary: LevelSummary;
  levelOpen: boolean;
  levelUpToasts: Array<{ level: number; title: string; titleZh: string; timestamp: number }>;
  // Settings
  settingsOpen: boolean;
  settings: Settings;
  // Deploy wizard — edge selection mode
  edgeSelectMode: {
    fieldName: string;
    onSelect: (edge: { id: string; source: string; target: string }) => void;
  } | null;
  // Multi-layer system
  activeLayer: number;
  layerMeta: LayerMeta[];
  layerSelectOpen: boolean;
  layerUnlockToasts: Array<{ id: number; name: string; emoji: string; timestamp: number }>;
}

interface GameActions {
  setState: (state: Partial<GameState>) => void;
  setConnected: (connected: boolean) => void;
  selectNode: (nodeId: string | null) => void;
  selectWorker: (workerId: string | null) => void;
  updateFromServer: (data: any) => void;
  toggleInventory: () => void;
  toggleAchievements: () => void;
  toggleSettings: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  toggleQuests: () => void;
  selectQuest: (questId: string | null) => void;
  addQuestToast: (toast: { id: string; name: string; type: 'available' | 'completed' }) => void;
  removeQuestToast: (id: string) => void;
  addAchievementToast: (toast: { id: string; name: string; description: string; category: string }) => void;
  removeAchievementToast: (id: string) => void;
  setEdgeSelectMode: (mode: GameState['edgeSelectMode']) => void;
  setInventory: (inventory: InventoryItem[]) => void;
  toggleLevel: () => void;
  addLevelUpToast: (toast: { level: number; title: string; titleZh: string }) => void;
  removeLevelUpToast: (level: number) => void;
  resetTutorial: () => void;
  // Layer actions
  openLayerSelect: () => void;
  closeLayerSelect: () => void;
  addLayerUnlockToast: (toast: { id: number; name: string; emoji: string }) => void;
  removeLayerUnlockToast: (id: number) => void;
}

export const useGameStore = create<GameState & GameActions>((set) => ({
  nodes: [],
  edges: [],
  resources: { data: 0, rp: 0, credits: 0 },
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
  settingsOpen: false,
  settings: savedSettings,
  questSummary: { total: 0, claimed: 0, completed: 0, available: 0 },
  questsOpen: false,
  selectedQuestId: null,
  questToasts: [],
  levelSummary: { level: 1, xp: 0, xpToNext: 100, totalXp: 0, title: 'Script Kiddie', titleZh: '腳本小子', maxLevel: 30, maxWorkersBonus: 0, flopBonus: 0, milestones: [] },
  levelOpen: false,
  levelUpToasts: [],
  edgeSelectMode: null,
  activeLayer: 0,
  layerMeta: [],
  layerSelectOpen: false,
  layerUnlockToasts: [],

  setState: (partial) => set((state) => ({ ...state, ...partial })),
  setConnected: (connected) => set({ connected }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedWorkerId: null }),
  selectWorker: (workerId) => set({ selectedWorkerId: workerId, selectedNodeId: null }),
  setEdgeSelectMode: (mode) => set({ edgeSelectMode: mode }),
  toggleInventory: () => set((state) => ({ inventoryOpen: !state.inventoryOpen })),
  toggleAchievements: () => set((state) => ({ achievementsOpen: !state.achievementsOpen })),
  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  updateSettings: (patch) => set((state) => {
    const newSettings = { ...state.settings, ...patch }
    localStorage.setItem('netcrawl-settings', JSON.stringify(newSettings))
    if (patch.theme) {
      document.documentElement.setAttribute('data-theme', newSettings.theme)
    }
    return { settings: newSettings }
  }),
  toggleQuests: () => set((state) => ({ questsOpen: !state.questsOpen })),
  selectQuest: (questId) => set({ selectedQuestId: questId }),
  addQuestToast: (toast) => set((state) => ({
    questToasts: [...state.questToasts.slice(-2), { ...toast, timestamp: Date.now() }],
  })),
  removeQuestToast: (id) => set((state) => ({
    questToasts: state.questToasts.filter(t => t.id !== id),
  })),
  addAchievementToast: (toast) => set((state) => ({
    achievementToasts: [...state.achievementToasts.slice(-2), { ...toast, timestamp: Date.now() }],
  })),
  removeAchievementToast: (id) => set((state) => ({
    achievementToasts: state.achievementToasts.filter(t => t.id !== id),
  })),
  setInventory: (inventory) => set({ playerInventory: inventory }),
  toggleLevel: () => set((state) => ({ levelOpen: !state.levelOpen })),
  addLevelUpToast: (toast) => set((state) => ({
    levelUpToasts: [...state.levelUpToasts.slice(-2), { ...toast, timestamp: Date.now() }],
  })),
  removeLevelUpToast: (level) => set((state) => ({
    levelUpToasts: state.levelUpToasts.filter(t => t.level !== level),
  })),
  resetTutorial: () => {
    localStorage.removeItem('netcrawl-tutorial');
  },

  openLayerSelect: () => set({ layerSelectOpen: true }),
  closeLayerSelect: () => set({ layerSelectOpen: false }),
  addLayerUnlockToast: (toast) => set((state) => ({
    layerUnlockToasts: [...state.layerUnlockToasts.slice(-2), { ...toast, timestamp: Date.now() }],
  })),
  removeLayerUnlockToast: (id) => set((state) => ({
    layerUnlockToasts: state.layerUnlockToasts.filter(t => t.id !== id),
  })),

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
      questSummary: data.questSummary ?? state.questSummary,
      levelSummary: data.levelSummary ?? state.levelSummary,
      activeLayer: data.activeLayer ?? state.activeLayer,
      layerMeta: data.layerMeta ?? state.layerMeta,
    }));
  },
}));
