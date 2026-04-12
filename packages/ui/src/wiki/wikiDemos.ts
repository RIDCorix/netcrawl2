/**
 * Interactive code demos for wiki equipment entries.
 *
 * Each demo shows how to use an item in a worker script with a live
 * mini-graph that animates alongside the highlighted code line.
 *
 * Reuses the DemoScript / DemoPlayer infrastructure from the quest guide
 * system — same types, same renderer.
 */

import type { DemoScript, DemoGraphState } from '../components/guide/types';

// ── Shared initial states ─────────────────────────────────────────────────

const BASE_STATE: DemoGraphState = {
  nodes: [
    { id: 'hub', type: 'hub', label: 'Hub', position: { x: 120, y: 20 }, color: '#00d4aa' },
    { id: 'mine', type: 'resource', label: 'Data Mine', position: { x: 120, y: 130 }, color: '#45aaf2', subtitle: '+10/harvest' },
  ],
  edges: [
    { id: 'e1', source: 'hub', target: 'mine' },
  ],
  worker: { nodeId: 'hub', color: '#facc15', status: 'idle', holding: null },
  statusLabel: 'Worker idle at Hub',
  resources: { data: 0 },
};

// ── Pickaxe demo ──────────────────────────────────────────────────────────
// Shows: equip pickaxe → mine → collect → deposit

const PICKAXE_DEMO: DemoScript = {
  code: `class Miner(NetCrawlWorker):
    equippedPickaxe = "pickaxe_basic"

    def on_loop(self):
        self.mine()        # swing pickaxe at node
        self.collect()     # pick up drops
        self.move("hub")
        self.deposit()     # bank resources`,
  initialState: BASE_STATE,
  steps: [
    {
      codeLine: 2, durationMs: 1500,
      apply: (prev) => ({
        ...prev,
        statusLabel: 'Equipped: Basic Pickaxe (1.0x)',
        worker: { ...prev.worker!, nodeId: 'hub', status: 'idle' },
      }),
    },
    {
      codeLine: 5, durationMs: 1800,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, nodeId: 'mine', status: 'mining' },
        nodes: prev.nodes.map(n =>
          n.id === 'mine' ? { ...n, highlighted: true, dropCount: 10 } : n
        ),
        statusLabel: 'Mining... +10 data fragments',
      }),
    },
    {
      codeLine: 6, durationMs: 1200,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, status: 'collecting', holding: { type: 'data_fragment', amount: 10 } },
        nodes: prev.nodes.map(n =>
          n.id === 'mine' ? { ...n, highlighted: false, dropCount: 0 } : n
        ),
        statusLabel: 'Collecting drops → holding 10 fragments',
      }),
    },
    {
      codeLine: 7, durationMs: 1200,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, nodeId: 'hub', status: 'moving' },
        edges: prev.edges.map(e => ({ ...e, highlighted: true })),
        statusLabel: 'Moving to Hub...',
      }),
    },
    {
      codeLine: 8, durationMs: 1500,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, status: 'depositing', holding: null },
        edges: prev.edges.map(e => ({ ...e, highlighted: false })),
        nodes: prev.nodes.map(n =>
          n.id === 'hub' ? { ...n, highlighted: true } : n
        ),
        resources: { data: 10 },
        statusLabel: 'Deposited! Data: 0 → 10',
      }),
    },
  ],
};

// ── CPU demo ──────────────────────────────────────────────────────────────
// Shows: equip CPU → enables extra actions per tick

const CPU_DEMO: DemoScript = {
  code: `class FastMiner(NetCrawlWorker):
    equippedCpu = "cpu_basic"  # +1 action slot

    def on_loop(self):
        self.mine()     # action 1
        self.mine()     # action 2 (CPU bonus!)
        self.collect()
        self.move("hub")
        self.deposit()`,
  initialState: BASE_STATE,
  steps: [
    {
      codeLine: 2, durationMs: 1500,
      apply: (prev) => ({
        ...prev,
        statusLabel: 'Equipped: CPU Module (+1 action slot)',
        worker: { ...prev.worker!, nodeId: 'hub', status: 'idle' },
      }),
    },
    {
      codeLine: 5, durationMs: 1200,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, nodeId: 'mine', status: 'mining' },
        nodes: prev.nodes.map(n =>
          n.id === 'mine' ? { ...n, highlighted: true, dropCount: 10 } : n
        ),
        statusLabel: 'Action 1: mine() → +10 fragments',
      }),
    },
    {
      codeLine: 6, durationMs: 1200,
      apply: (prev) => ({
        ...prev,
        nodes: prev.nodes.map(n =>
          n.id === 'mine' ? { ...n, dropCount: 20 } : n
        ),
        statusLabel: 'Action 2: mine() again! → +20 total (CPU bonus)',
      }),
    },
    {
      codeLine: 7, durationMs: 1000,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, status: 'collecting', holding: { type: 'data_fragment', amount: 20 } },
        nodes: prev.nodes.map(n =>
          n.id === 'mine' ? { ...n, highlighted: false, dropCount: 0 } : n
        ),
        statusLabel: 'Collecting 20 fragments',
      }),
    },
    {
      codeLine: 9, durationMs: 1500,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, nodeId: 'hub', status: 'depositing', holding: null },
        resources: { data: 20 },
        statusLabel: 'Deposited 20! Double output thanks to CPU.',
      }),
    },
  ],
};

// ── RAM demo ──────────────────────────────────────────────────────────────
// Shows: equip RAM → can hold more stacks → fewer trips

const RAM_DEMO: DemoScript = {
  code: `class PackMiner(NetCrawlWorker):
    equippedRam = "ram_basic"  # +8 capacity

    def on_loop(self):
        # Mine and collect multiple rounds
        for _ in range(3):
            self.mine()
            self.collect()
        # Single trip home with everything
        self.move("hub")
        self.deposit()`,
  initialState: {
    ...BASE_STATE,
    nodes: [
      { id: 'hub', type: 'hub', label: 'Hub', position: { x: 120, y: 20 }, color: '#00d4aa' },
      { id: 'mine', type: 'resource', label: 'Data Mine', position: { x: 120, y: 130 }, color: '#45aaf2', subtitle: '+10/harvest' },
    ],
  },
  steps: [
    {
      codeLine: 2, durationMs: 1500,
      apply: (prev) => ({
        ...prev,
        statusLabel: 'Equipped: RAM Module (+8 capacity)',
        worker: { ...prev.worker!, nodeId: 'hub', status: 'idle' },
      }),
    },
    {
      codeLine: 7, durationMs: 1200,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, nodeId: 'mine', status: 'mining' },
        nodes: prev.nodes.map(n =>
          n.id === 'mine' ? { ...n, highlighted: true, dropCount: 10 } : n
        ),
        statusLabel: 'Loop 1: mine + collect → holding 10',
      }),
    },
    {
      codeLine: 8, durationMs: 1200,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, holding: { type: 'data_fragment', amount: 10 } },
        nodes: prev.nodes.map(n =>
          n.id === 'mine' ? { ...n, dropCount: 0 } : n
        ),
        statusLabel: 'Collected round 1 (10 held)',
      }),
    },
    {
      codeLine: 7, durationMs: 1200,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, status: 'mining' },
        nodes: prev.nodes.map(n =>
          n.id === 'mine' ? { ...n, dropCount: 10 } : n
        ),
        statusLabel: 'Loop 2: mine again...',
      }),
    },
    {
      codeLine: 8, durationMs: 1200,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, holding: { type: 'data_fragment', amount: 20 }, status: 'collecting' },
        nodes: prev.nodes.map(n =>
          n.id === 'mine' ? { ...n, dropCount: 0 } : n
        ),
        statusLabel: 'Collected round 2 (20 held — RAM has room!)',
      }),
    },
    {
      codeLine: 7, durationMs: 1200,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, status: 'mining' },
        nodes: prev.nodes.map(n =>
          n.id === 'mine' ? { ...n, dropCount: 10 } : n
        ),
        statusLabel: 'Loop 3: mine once more...',
      }),
    },
    {
      codeLine: 8, durationMs: 1200,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, holding: { type: 'data_fragment', amount: 30 }, status: 'collecting' },
        nodes: prev.nodes.map(n =>
          n.id === 'mine' ? { ...n, highlighted: false, dropCount: 0 } : n
        ),
        statusLabel: 'Collected round 3 (30 held — still fits!)',
      }),
    },
    {
      codeLine: 11, durationMs: 1500,
      apply: (prev) => ({
        ...prev,
        worker: { ...prev.worker!, nodeId: 'hub', status: 'depositing', holding: null },
        resources: { data: 30 },
        statusLabel: 'Deposited 30 in ONE trip. Without RAM: 3 trips needed.',
      }),
    },
  ],
};

// ── Registry ──────────────────────────────────────────────────────────────

export const WIKI_DEMOS: Record<string, DemoScript> = {
  wiki_pickaxe: PICKAXE_DEMO,
  wiki_cpu: CPU_DEMO,
  wiki_ram: RAM_DEMO,
};
