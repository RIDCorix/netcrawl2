import { create } from 'zustand';
import type { Language } from '../i18n/index';

/**
 * Reuse old references when incoming data is structurally equal.
 * Server re-sends full state on every tick, but most items don't actually change.
 * Without this, every downstream useMemo/useEffect that depends on these arrays
 * (or their items) re-runs every tick, causing re-render storms and API call storms.
 */
function stableArray<T>(oldArr: T[] | undefined, newArr: T[] | undefined): T[] | undefined {
  if (newArr === undefined) return oldArr;
  if (oldArr === undefined) return newArr;
  if (oldArr === newArr) return oldArr;
  if (oldArr.length !== newArr.length) {
    // Length changed: still reuse individual items that are structurally equal
    const out: T[] = new Array(newArr.length);
    for (let i = 0; i < newArr.length; i++) {
      const n = newArr[i];
      // Try to find a structurally-equal old item (by id if possible, else index)
      const nId = (n as any)?.id;
      const o = nId != null
        ? oldArr.find(x => (x as any)?.id === nId)
        : oldArr[i];
      out[i] = (o !== undefined && JSON.stringify(o) === JSON.stringify(n)) ? o : n;
    }
    return out;
  }
  let allSame = true;
  const out: T[] = new Array(newArr.length);
  for (let i = 0; i < newArr.length; i++) {
    const o = oldArr[i];
    const n = newArr[i];
    if (o === n || JSON.stringify(o) === JSON.stringify(n)) {
      out[i] = o;
    } else {
      out[i] = n;
      allSame = false;
    }
  }
  return allSame ? oldArr : out;
}

function stableObject<T>(oldObj: T | undefined, newObj: T | undefined): T | undefined {
  if (newObj === undefined) return oldObj;
  if (oldObj === undefined) return newObj;
  if (oldObj === newObj) return oldObj;
  return JSON.stringify(oldObj) === JSON.stringify(newObj) ? oldObj : newObj;
}

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
  items?: Item[];
  drops?: Item[];
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

export interface Item {
  type: 'data_fragment' | 'rp_shard' | 'bad_data';
  count: number;
  amount?: number; // legacy compat
}

/** @deprecated Use Item instead */
export type Drop = Item;

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
  holding?: Item[] | null;
  equippedPickaxe?: { itemType: string; efficiency: number } | null;
  lastLog?: { message: string; level: string; ts: number } | null;
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
  bgmVolume: number
  sfxVolume: number
  currentTrack: string
}

const DEFAULT_SETTINGS: Settings = {
  edgeStyle: 'straight',
  showTrafficDots: true,
  showWorkerDots: true,
  keybindings: { inventory: 'e', achievements: 'a', quests: 'q', level: 'l', settings: 'Escape' },
  theme: 'deep-space',
  language: 'en',
  bgmVolume: 50,
  sfxVolume: 70,
  currentTrack: 'default',
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
  flop: { total: number; used: number };
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
  docsOpen: boolean;
  // Wiki (in-game interactive manual)
  wikiSelectedEntry: string | null;
  wikiSeenEntries: Record<string, number>; // entryId -> timestamp of first view
  connectOpen: boolean;
  settings: Settings;
  // Deploy wizard — edge selection mode (for Edge fields)
  edgeSelectMode: {
    fieldName: string;
    onSelect: (edge: { id: string; source: string; target: string }) => void;
  } | null;
  // Deploy wizard — node selection mode (for Route fields, click nodes to build path)
  nodeSelectMode: {
    fieldName: string;
    onSelect: (nodeId: string) => void;
  } | null;
  // Currently selected route path (for visual feedback in GameGraph)
  routePath: string[];
  // Multi-layer system
  activeLayer: number;
  layerMeta: LayerMeta[];
  layerSelectOpen: boolean;
  layerUnlockToasts: Array<{ id: number; name: string; emoji: string; timestamp: number }>;
  // Worker classes (pushed via WS — no HTTP polling needed)
  workerClasses: any[];
  codeServerConnected: boolean;
  // Worker logs per worker id (pushed via WS WORKER_LOG — no HTTP polling)
  workerLogs: Record<string, Array<{ message: string; level: string; created_at: string }>>;
  // Ephemeral hub deposit flash effects (pushed via WS HUB_DEPOSIT).
  // Each entry auto-expires after the animation duration.
  hubDeposits: Array<{ id: number; ts: number; goodCount: number; badCount: number }>;
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
  toggleDocs: () => void;
  openWiki: (entryId?: string | null) => void;
  closeWiki: () => void;
  markWikiEntrySeen: (entryId: string) => void;
  toggleConnect: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  toggleQuests: () => void;
  selectQuest: (questId: string | null) => void;
  addQuestToast: (toast: { id: string; name: string; type: 'available' | 'completed' }) => void;
  removeQuestToast: (id: string) => void;
  addAchievementToast: (toast: { id: string; name: string; description: string; category: string }) => void;
  removeAchievementToast: (id: string) => void;
  setEdgeSelectMode: (mode: GameState['edgeSelectMode']) => void;
  setNodeSelectMode: (mode: GameState['nodeSelectMode']) => void;
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
  // Worker logs
  appendWorkerLog: (workerId: string, entry: { message: string; level: string; created_at?: string }) => void;
  setWorkerLogs: (workerId: string, logs: Array<{ message: string; level: string; created_at: string }>) => void;
  // Hub deposit VFX
  pushHubDeposit: (deposit: { goodCount: number; badCount: number }) => void;
  removeHubDeposit: (id: number) => void;
}

export const useGameStore = create<GameState & GameActions>((set) => ({
  nodes: [],
  edges: [],
  resources: { data: 0, rp: 0, credits: 0 },
  flop: { total: 50, used: 0 },
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
  docsOpen: false,
  wikiSelectedEntry: null,
  wikiSeenEntries: (() => {
    try {
      const raw = localStorage.getItem('netcrawl-wiki-seen');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })(),
  connectOpen: false,
  settings: savedSettings,
  questSummary: { total: 0, claimed: 0, completed: 0, available: 0 },
  questsOpen: false,
  selectedQuestId: null,
  questToasts: [],
  levelSummary: { level: 1, xp: 0, xpToNext: 100, totalXp: 0, title: 'Script Kiddie', titleZh: '腳本小子', maxLevel: 30, maxWorkersBonus: 0, flopBonus: 0, milestones: [] },
  levelOpen: false,
  levelUpToasts: [],
  edgeSelectMode: null,
  nodeSelectMode: null,
  routePath: [],
  activeLayer: 0,
  layerMeta: [],
  layerSelectOpen: false,
  layerUnlockToasts: [],
  workerClasses: [],
  codeServerConnected: false,
  workerLogs: {},
  hubDeposits: [],

  setState: (partial) => set((state) => ({ ...state, ...partial })),
  setConnected: (connected) => set({ connected }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedWorkerId: null }),
  selectWorker: (workerId) => set({ selectedWorkerId: workerId, selectedNodeId: null }),
  setEdgeSelectMode: (mode) => set({ edgeSelectMode: mode }),
  setNodeSelectMode: (mode) => set({ nodeSelectMode: mode }),
  toggleInventory: () => set((state) => ({ inventoryOpen: !state.inventoryOpen })),
  toggleAchievements: () => set((state) => ({ achievementsOpen: !state.achievementsOpen })),
  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  toggleDocs: () => set((state) => ({ docsOpen: !state.docsOpen })),
  openWiki: (entryId) => set({ docsOpen: true, wikiSelectedEntry: entryId ?? null }),
  closeWiki: () => set({ docsOpen: false }),
  markWikiEntrySeen: (entryId) => set((state) => {
    if (state.wikiSeenEntries[entryId]) return state;
    const next = { ...state.wikiSeenEntries, [entryId]: Date.now() };
    try { localStorage.setItem('netcrawl-wiki-seen', JSON.stringify(next)); } catch {}
    return { wikiSeenEntries: next };
  }),
  toggleConnect: () => set((state) => ({ connectOpen: !state.connectOpen })),
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

  appendWorkerLog: (workerId, entry) => set((state) => {
    const prev = state.workerLogs[workerId] || [];
    const record = {
      message: entry.message,
      level: entry.level,
      created_at: entry.created_at || new Date().toISOString(),
    };
    // Keep last 200 entries per worker
    const next = [...prev, record].slice(-200);
    return { workerLogs: { ...state.workerLogs, [workerId]: next } };
  }),
  setWorkerLogs: (workerId, logs) => set((state) => ({
    workerLogs: { ...state.workerLogs, [workerId]: logs },
  })),

  pushHubDeposit: (deposit) => set((state) => ({
    hubDeposits: [
      ...state.hubDeposits,
      { id: Date.now() + Math.random(), ts: Date.now(), ...deposit },
    ],
  })),
  removeHubDeposit: (id) => set((state) => ({
    hubDeposits: state.hubDeposits.filter(d => d.id !== id),
  })),

  updateFromServer: (data) => {
    set((state) => ({
      // Arrays: reuse references (per-item) when structurally unchanged
      nodes: stableArray(state.nodes, data.nodes) ?? state.nodes,
      edges: stableArray(state.edges, data.edges) ?? state.edges,
      workers: stableArray(state.workers, data.workers) ?? state.workers,
      playerInventory: stableArray(state.playerInventory, data.playerInventory) ?? state.playerInventory,
      playerChips: stableArray(state.playerChips, data.playerChips) ?? state.playerChips,
      achievements: stableObject(state.achievements, data.achievements) ?? state.achievements,
      // Objects: reuse reference when structurally unchanged
      resources: stableObject(state.resources, data.resources) ?? state.resources,
      questSummary: stableObject(state.questSummary, data.questSummary) ?? state.questSummary,
      levelSummary: stableObject(state.levelSummary, data.levelSummary) ?? state.levelSummary,
      layerMeta: stableObject(state.layerMeta, data.layerMeta) ?? state.layerMeta,
      // Primitives
      flop: data.flop ?? state.flop,
      tick: data.tick ?? state.tick,
      gameOver: data.gameOver ?? state.gameOver,
      activeLayer: data.activeLayer ?? state.activeLayer,
      // Worker classes + code server status — pushed via WS, no polling needed
      workerClasses: stableArray(state.workerClasses, data.workerClasses) ?? state.workerClasses,
      codeServerConnected: data.codeServerConnected ?? state.codeServerConnected,
    }));
  },
}));
