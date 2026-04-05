/**
 * Demo scripts for quest guide animations.
 *
 * Each script defines:
 *  - code: the Python code to display
 *  - initialState: the starting graph layout
 *  - steps: lambda functions that transform graph state per code line
 *
 * Keyed by: `${questId}:${stepIndex}` (e.g., "q_method_call:1")
 */

import type { DemoScript, DemoGraphState, DemoNode, DemoEdge } from './types';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Deep clone + patch state */
function patch(prev: DemoGraphState, changes: Partial<DemoGraphState>): DemoGraphState {
  return { ...prev, ...changes };
}

function moveWorker(prev: DemoGraphState, nodeId: string, status?: DemoGraphState['worker']): DemoGraphState {
  return { ...prev, worker: { ...prev.worker!, nodeId, ...status } };
}

function highlightEdge(prev: DemoGraphState, edgeId: string, on = true): DemoGraphState {
  return {
    ...prev,
    edges: prev.edges.map((e): DemoEdge => e.id === edgeId ? { ...e, highlighted: on } : { ...e, highlighted: false }),
  };
}

function highlightNode(prev: DemoGraphState, nodeId: string, on = true): DemoGraphState {
  return {
    ...prev,
    nodes: prev.nodes.map((n): DemoNode => n.id === nodeId ? { ...n, highlighted: on } : { ...n, highlighted: false }),
  };
}

function setDrops(prev: DemoGraphState, nodeId: string, count: number): DemoGraphState {
  return {
    ...prev,
    nodes: prev.nodes.map((n): DemoNode => n.id === nodeId ? { ...n, dropCount: count } : n),
  };
}

function clearHighlights(prev: DemoGraphState): DemoGraphState {
  return {
    ...prev,
    nodes: prev.nodes.map((n): DemoNode => ({ ...n, highlighted: false })),
    edges: prev.edges.map((e): DemoEdge => ({ ...e, highlighted: false })),
  };
}

// ── Shared layouts ─────────────────────────────────────────────────────────

const HUB_MINE_NODES: DemoNode[] = [
  { id: 'hub', type: 'hub', label: 'Hub', position: { x: 0, y: 80 } },
  { id: 'mine', type: 'resource', label: 'Data Mine', position: { x: 0, y: -60 }, subtitle: '+10/harvest' },
];

const HUB_MINE_EDGES: DemoEdge[] = [
  { id: 'e1', source: 'hub', target: 'mine' },
];

const INITIAL_HUB_MINE: DemoGraphState = {
  nodes: HUB_MINE_NODES,
  edges: HUB_MINE_EDGES,
  worker: { nodeId: 'hub', color: '#fbbf24' },
};

// ── q_method_call: step 1 (Write Your First Worker) ────────────────────────

const METHOD_CALL_DEMO: DemoScript = {
  code: `def on_loop(self):
    self.move_edge(self.route)
    self.pickaxe.mine()
    self.collect()
    self.move_edge(self.route)
    self.deposit()`,
  initialState: INITIAL_HUB_MINE,
  steps: [
    {
      codeLine: 2,
      durationMs: 1000,
      apply: (prev) => {
        let s = highlightEdge(prev, 'e1');
        s = moveWorker(s, 'mine', { nodeId: 'mine', color: '#fbbf24', status: 'moving' });
        return patch(s, { statusLabel: 'Moving to mine...' });
      },
    },
    {
      codeLine: 3,
      durationMs: 1200,
      apply: (prev) => {
        let s = clearHighlights(prev);
        s = moveWorker(s, 'mine', { nodeId: 'mine', color: '#fbbf24', status: 'mining' });
        s = highlightNode(s, 'mine');
        s = setDrops(s, 'mine', 1);
        return patch(s, { statusLabel: '⛏ Mining... drop created' });
      },
    },
    {
      codeLine: 4,
      durationMs: 1000,
      apply: (prev) => {
        let s = clearHighlights(prev);
        s = moveWorker(s, 'mine', { nodeId: 'mine', color: '#fbbf24', status: 'collecting', holding: { type: 'data_fragment', amount: 1 } });
        s = setDrops(s, 'mine', 0);
        return patch(s, { statusLabel: 'Collected data_fragment' });
      },
    },
    {
      codeLine: 5,
      durationMs: 1000,
      apply: (prev) => {
        let s = highlightEdge(prev, 'e1');
        s = moveWorker(s, 'hub', { nodeId: 'hub', color: '#fbbf24', status: 'moving', holding: { type: 'data_fragment', amount: 1 } });
        return patch(s, { statusLabel: 'Returning to hub...' });
      },
    },
    {
      codeLine: 6,
      durationMs: 1200,
      apply: (prev) => {
        let s = clearHighlights(prev);
        s = highlightNode(s, 'hub');
        s = moveWorker(s, 'hub', { nodeId: 'hub', color: '#fbbf24', status: 'depositing', holding: null });
        const res = { data: (prev.resources?.data || 0) + 1 };
        return patch(s, { statusLabel: 'Deposited → Data +1', resources: res });
      },
    },
  ],
};

// ── q_conditions: step 1 (Smart Mining Loop) ───────────────────────────────

const CONDITIONS_DEMO: DemoScript = {
  code: `def on_loop(self):
    self.move_edge(self.route)
    self.pickaxe.mine()
    result = self.collect()

    if result.get("ok"):
        self.move_edge(self.route)
        self.deposit()
    else:
        self.info("Nothing to collect")`,
  initialState: INITIAL_HUB_MINE,
  steps: [
    {
      codeLine: 2,
      durationMs: 800,
      apply: (prev) => {
        let s = highlightEdge(prev, 'e1');
        s = moveWorker(s, 'mine', { nodeId: 'mine', color: '#fbbf24', status: 'moving' });
        return patch(s, { statusLabel: 'Moving to mine...' });
      },
    },
    {
      codeLine: 3,
      durationMs: 1000,
      apply: (prev) => {
        let s = clearHighlights(prev);
        s = highlightNode(s, 'mine');
        s = moveWorker(s, 'mine', { nodeId: 'mine', color: '#fbbf24', status: 'mining' });
        s = setDrops(s, 'mine', 1);
        return patch(s, { statusLabel: '⛏ Mining...' });
      },
    },
    {
      codeLine: 4,
      durationMs: 800,
      apply: (prev) => {
        let s = clearHighlights(prev);
        s = moveWorker(s, 'mine', { nodeId: 'mine', color: '#fbbf24', status: 'collecting', holding: { type: 'data_fragment', amount: 1 } });
        s = setDrops(s, 'mine', 0);
        return patch(s, { statusLabel: 'result = { ok: true, item: data_fragment }' });
      },
    },
    {
      codeLine: 6,
      durationMs: 600,
      apply: (prev) => patch(prev, { statusLabel: '✓ result.ok is True → deposit' }),
    },
    {
      codeLine: 7,
      durationMs: 800,
      apply: (prev) => {
        let s = highlightEdge(prev, 'e1');
        s = moveWorker(s, 'hub', { nodeId: 'hub', color: '#fbbf24', status: 'moving', holding: { type: 'data_fragment', amount: 1 } });
        return patch(s, { statusLabel: 'Returning to hub...' });
      },
    },
    {
      codeLine: 8,
      durationMs: 1200,
      apply: (prev) => {
        let s = clearHighlights(prev);
        s = highlightNode(s, 'hub');
        s = moveWorker(s, 'hub', { nodeId: 'hub', color: '#fbbf24', status: 'depositing', holding: null });
        return patch(s, { statusLabel: 'Deposited → Data +1' });
      },
    },
  ],
};

// ── q_while_loop: step 1 (Filtering Bad Data) ─────────────────────────────

const WHILE_LOOP_DEMO: DemoScript = {
  code: `self.pickaxe.mine()

while self.has_dropped_items():
    result = self.collect()
    item = result.get("item", {})
    if item.get("type") == "bad_data":
        self.discard()
    else:
        break

self.move_edge(self.route)
self.deposit()`,
  initialState: {
    nodes: HUB_MINE_NODES,
    edges: HUB_MINE_EDGES,
    worker: { nodeId: 'mine', color: '#fbbf24' },
    statusLabel: '(already at mine)',
  },
  steps: [
    {
      codeLine: 1,
      durationMs: 1200,
      apply: (prev) => {
        let s = highlightNode(prev, 'mine');
        s = moveWorker(s, 'mine', { nodeId: 'mine', color: '#fbbf24', status: 'mining' });
        // Mine produces 2 drops: bad_data then data_fragment
        s = setDrops(s, 'mine', 2);
        return patch(s, { statusLabel: '⛏ Mining... 2 drops created (1 bad!)' });
      },
    },
    {
      codeLine: 3,
      durationMs: 800,
      apply: (prev) => patch(prev, { statusLabel: 'has_dropped_items() → True (2 items)' }),
    },
    {
      codeLine: 4,
      durationMs: 800,
      apply: (prev) => {
        let s = setDrops(prev, 'mine', 1);
        s = moveWorker(s, 'mine', { nodeId: 'mine', color: '#fbbf24', status: 'collecting', holding: { type: 'bad_data', amount: 1 } });
        return patch(s, { statusLabel: 'Collected: bad_data ⚠' });
      },
    },
    {
      codeLine: 6,
      durationMs: 600,
      apply: (prev) => patch(prev, { statusLabel: 'item.type == "bad_data" → True!' }),
    },
    {
      codeLine: 7,
      durationMs: 1000,
      apply: (prev) => {
        let s = moveWorker(prev, 'mine', { nodeId: 'mine', color: '#fbbf24', status: 'discarding', holding: null });
        return patch(s, { statusLabel: '🗑 Discarded bad_data' });
      },
    },
    {
      codeLine: 3,
      durationMs: 800,
      apply: (prev) => {
        let s = moveWorker(prev, 'mine', { nodeId: 'mine', color: '#fbbf24' });
        return patch(s, { statusLabel: 'has_dropped_items() → True (1 item left)' });
      },
    },
    {
      codeLine: 4,
      durationMs: 800,
      apply: (prev) => {
        let s = setDrops(prev, 'mine', 0);
        s = moveWorker(s, 'mine', { nodeId: 'mine', color: '#fbbf24', status: 'collecting', holding: { type: 'data_fragment', amount: 1 } });
        return patch(s, { statusLabel: 'Collected: data_fragment ✓' });
      },
    },
    {
      codeLine: 6,
      durationMs: 600,
      apply: (prev) => patch(prev, { statusLabel: 'item.type == "bad_data" → False' }),
    },
    {
      codeLine: 9,
      durationMs: 600,
      apply: (prev) => patch(prev, { statusLabel: 'break → exit while loop' }),
    },
    {
      codeLine: 11,
      durationMs: 800,
      apply: (prev) => {
        let s = highlightEdge(prev, 'e1');
        s = moveWorker(s, 'hub', { nodeId: 'hub', color: '#fbbf24', status: 'moving', holding: { type: 'data_fragment', amount: 1 } });
        return patch(s, { statusLabel: 'Returning to hub...' });
      },
    },
    {
      codeLine: 12,
      durationMs: 1200,
      apply: (prev) => {
        let s = clearHighlights(prev);
        s = highlightNode(s, 'hub');
        s = moveWorker(s, 'hub', { nodeId: 'hub', color: '#fbbf24', status: 'depositing', holding: null });
        return patch(s, { statusLabel: 'Deposited → Data +1 (bad data was filtered!)' });
      },
    },
  ],
};

// ── q_for_loop: step 1 (The Data Mine Cluster) ────────────────────────────

const CLUSTER_NODES: DemoNode[] = [
  { id: 'relay', type: 'empty', label: 'Cluster Relay', position: { x: 0, y: 0 } },
  { id: 'm1', type: 'resource', label: 'Mine A', position: { x: -80, y: -80 }, subtitle: 'cap: 1' },
  { id: 'm2', type: 'resource', label: 'Mine B', position: { x: 80, y: -80 }, subtitle: 'cap: 1' },
  { id: 'm3', type: 'resource', label: 'Mine C', position: { x: 100, y: 40 }, subtitle: 'cap: 1' },
  { id: 'm4', type: 'resource', label: 'Mine D', position: { x: -100, y: 40 }, subtitle: 'cap: 1' },
];

const CLUSTER_EDGES: DemoEdge[] = [
  { id: 'ce1', source: 'relay', target: 'm1' },
  { id: 'ce2', source: 'relay', target: 'm2' },
  { id: 'ce3', source: 'relay', target: 'm3' },
  { id: 'ce4', source: 'relay', target: 'm4' },
];

const FOR_LOOP_DEMO: DemoScript = {
  code: `edges = self.sensor.scan()

for edge in edges:
    if isinstance(edge.target_node, ResourceNode):
        self.move_edge(edge.edge_id)
        self.pickaxe.mine()
        self.collect()
        self.move_edge(edge.edge_id)
        self.deposit()`,
  initialState: {
    nodes: CLUSTER_NODES,
    edges: CLUSTER_EDGES,
    worker: { nodeId: 'relay', color: '#fbbf24' },
  },
  steps: [
    {
      codeLine: 1,
      durationMs: 1000,
      apply: (prev) => {
        // Highlight all edges = scan result
        return {
          ...prev,
          edges: prev.edges.map(e => ({ ...e, highlighted: true } as DemoEdge)),
          statusLabel: 'Scanning... 4 edges found',
        };
      },
    },
    // Iteration 1: Mine A
    {
      codeLine: 3,
      durationMs: 600,
      apply: (prev) => {
        let s = clearHighlights(prev);
        s = highlightEdge(s, 'ce1');
        return patch(s, { statusLabel: 'for edge ce1 → Mine A' });
      },
    },
    {
      codeLine: 4,
      durationMs: 600,
      apply: (prev) => {
        let s = highlightNode(prev, 'm1');
        return patch(s, { statusLabel: 'isinstance → ResourceNode ✓' });
      },
    },
    {
      codeLine: 5,
      durationMs: 800,
      apply: (prev) => {
        let s = moveWorker(prev, 'm1', { nodeId: 'm1', color: '#fbbf24', status: 'moving' });
        return patch(s, { statusLabel: 'Moving to Mine A' });
      },
    },
    {
      codeLine: 6,
      durationMs: 800,
      apply: (prev) => {
        let s = moveWorker(prev, 'm1', { nodeId: 'm1', color: '#fbbf24', status: 'mining' });
        s = setDrops(s, 'm1', 1);
        return patch(s, { statusLabel: '⛏ Mining...' });
      },
    },
    {
      codeLine: 7,
      durationMs: 600,
      apply: (prev) => {
        let s = setDrops(prev, 'm1', 0);
        s = moveWorker(s, 'm1', { nodeId: 'm1', color: '#fbbf24', status: 'collecting', holding: { type: 'data_fragment', amount: 1 } });
        return patch(s, { statusLabel: 'Collected' });
      },
    },
    {
      codeLine: 8,
      durationMs: 800,
      apply: (prev) => {
        let s = clearHighlights(prev);
        s = moveWorker(s, 'relay', { nodeId: 'relay', color: '#fbbf24', status: 'moving', holding: { type: 'data_fragment', amount: 1 } });
        return patch(s, { statusLabel: 'Back to relay' });
      },
    },
    {
      codeLine: 9,
      durationMs: 600,
      apply: (prev) => {
        let s = moveWorker(prev, 'relay', { nodeId: 'relay', color: '#fbbf24', status: 'depositing', holding: null });
        return patch(s, { statusLabel: 'Deposited +1 → next edge', resources: { data: (prev.resources?.data || 0) + 1 } });
      },
    },
    // Iteration 2: Mine B
    {
      codeLine: 3,
      durationMs: 600,
      apply: (prev) => {
        let s = clearHighlights(prev);
        s = highlightEdge(s, 'ce2');
        return patch(s, { statusLabel: 'for edge ce2 → Mine B' });
      },
    },
    {
      codeLine: 5,
      durationMs: 800,
      apply: (prev) => {
        let s = highlightNode(prev, 'm2');
        s = moveWorker(s, 'm2', { nodeId: 'm2', color: '#fbbf24', status: 'moving' });
        return patch(s, { statusLabel: 'Moving to Mine B' });
      },
    },
    {
      codeLine: 6,
      durationMs: 800,
      apply: (prev) => {
        let s = moveWorker(prev, 'm2', { nodeId: 'm2', color: '#fbbf24', status: 'mining' });
        s = setDrops(s, 'm2', 1);
        return patch(s, { statusLabel: '⛏ Mining...' });
      },
    },
    {
      codeLine: 8,
      durationMs: 800,
      apply: (prev) => {
        let s = setDrops(prev, 'm2', 0);
        s = clearHighlights(s);
        s = moveWorker(s, 'relay', { nodeId: 'relay', color: '#fbbf24', status: 'depositing', holding: null });
        return patch(s, { statusLabel: 'Mine + collect + deposit → Data +1', resources: { data: (prev.resources?.data || 0) + 1 } });
      },
    },
    // Summary: remaining iterations implied
    {
      codeLine: 3,
      durationMs: 1500,
      apply: (prev) => {
        // Flash all remaining edges
        let s = { ...prev, edges: prev.edges.map(e => ({ ...e, highlighted: true } as DemoEdge)) };
        s = moveWorker(s, 'relay', { nodeId: 'relay', color: '#fbbf24' });
        return patch(s, { statusLabel: '... continues for ce3, ce4 → all mines visited!', resources: { data: 4 } });
      },
    },
  ],
};

// ── q_for_loop: step 1 (Build a Long-Range Miner) ─────────────────────────

const ROUTE_NODES: DemoNode[] = [
  { id: 'hub', type: 'hub', label: 'Hub', position: { x: 0, y: 100 } },
  { id: 'relay', type: 'empty', label: 'Relay', position: { x: 0, y: 0 } },
  { id: 'deep', type: 'resource', label: 'Deep Mine', position: { x: 0, y: -100 }, subtitle: '+40/mine' },
];

const ROUTE_EDGES: DemoEdge[] = [
  { id: 're1', source: 'hub', target: 'relay' },
  { id: 're2', source: 'relay', target: 'deep' },
];

const ROUTE_DEMO: DemoScript = {
  code: `def on_loop(self):
    for edge in self.route:
        self.move(edge)

    self.pickaxe.mine_and_collect()

    if self.holding.type == "bad_data":
        self.discard()
        return

    for edge in reversed(self.route):
        self.move(edge)

    self.deposit()`,
  initialState: {
    nodes: ROUTE_NODES,
    edges: ROUTE_EDGES,
    worker: { nodeId: 'hub', color: '#fbbf24' },
  },
  steps: [
    // Forward: hub → relay
    {
      codeLine: 2,
      durationMs: 600,
      apply: (prev) => patch(highlightEdge(prev, 're1'), { statusLabel: 'for edge re1 (hub → relay)' }),
    },
    {
      codeLine: 3,
      durationMs: 800,
      apply: (prev) => patch(moveWorker(clearHighlights(prev), 'relay'), { statusLabel: 'Moving to Relay' }),
    },
    // Forward: relay → deep
    {
      codeLine: 2,
      durationMs: 600,
      apply: (prev) => patch(highlightEdge(prev, 're2'), { statusLabel: 'for edge re2 (relay → deep)' }),
    },
    {
      codeLine: 3,
      durationMs: 800,
      apply: (prev) => patch(moveWorker(clearHighlights(prev), 'deep'), { statusLabel: 'Moving to Deep Mine' }),
    },
    // Mine + collect
    {
      codeLine: 5,
      durationMs: 1200,
      apply: (prev) => {
        let s = highlightNode(prev, 'deep');
        s = moveWorker(s, 'deep', { nodeId: 'deep', color: '#fbbf24', status: 'mining' });
        s = setDrops(s, 'deep', 1);
        return patch(s, { statusLabel: '⛏ Mining + collecting...' });
      },
    },
    // Check holding — good data this time
    {
      codeLine: 7,
      durationMs: 800,
      apply: (prev) => {
        let s = clearHighlights(prev);
        s = setDrops(s, 'deep', 0);
        return patch(s, { statusLabel: 'holding.type == "data_fragment" → keep!' });
      },
    },
    // Backward: deep → relay
    {
      codeLine: 11,
      durationMs: 600,
      apply: (prev) => patch(highlightEdge(prev, 're2'), { statusLabel: 'reversed: edge re2 (deep → relay)' }),
    },
    {
      codeLine: 12,
      durationMs: 800,
      apply: (prev) => patch(moveWorker(clearHighlights(prev), 'relay'), { statusLabel: 'Moving to Relay' }),
    },
    // Backward: relay → hub
    {
      codeLine: 11,
      durationMs: 600,
      apply: (prev) => patch(highlightEdge(prev, 're1'), { statusLabel: 'reversed: edge re1 (relay → hub)' }),
    },
    {
      codeLine: 12,
      durationMs: 800,
      apply: (prev) => patch(moveWorker(clearHighlights(prev), 'hub'), { statusLabel: 'Moving to Hub' }),
    },
    // Deposit
    {
      codeLine: 14,
      durationMs: 1000,
      apply: (prev) => {
        let s = highlightNode(prev, 'hub');
        s = moveWorker(s, 'hub', { nodeId: 'hub', color: '#fbbf24', status: 'depositing' });
        return patch(s, { statusLabel: '💰 Deposited! +40 data' });
      },
    },
    // Done
    {
      codeLine: 14,
      durationMs: 800,
      apply: (prev) => patch(clearHighlights(moveWorker(prev, 'hub')), { statusLabel: '✓ Loop complete — starting again' }),
    },
  ],
};

// ── Registry ───────────────────────────────────────────────────────────────

/**
 * Demo script registry.
 * Key format: `${questId}:${guideStepIndex}` (0-indexed step)
 */
export const DEMO_SCRIPTS: Record<string, DemoScript> = {
  'q_method_call:2': METHOD_CALL_DEMO,     // "Deploy and Watch" step
  'q_conditions:1':  CONDITIONS_DEMO,       // "Smart Mining Loop" step
  'q_while_loop:1':  WHILE_LOOP_DEMO,      // "Filtering Bad Data" step
  'q_for_loop:1':    ROUTE_DEMO,           // "Build a Long-Range Miner" step
  'q_cluster_mining:1': FOR_LOOP_DEMO,      // "Build a Cluster Miner" step
};
