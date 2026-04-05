/**
 * Types for the quest guide demo system.
 *
 * Each demo is a mini animated graph that plays alongside a code sample,
 * highlighting one line at a time and showing the corresponding game action.
 *
 * Scripts are lambda-based: each step is a function that transforms the
 * graph state, allowing maximum flexibility for any visual effect.
 */

export interface DemoNode {
  id: string;
  type: 'hub' | 'resource' | 'empty' | 'locked' | 'compute' | 'infected';
  label: string;
  position: { x: number; y: number };
  /** Glow/border color override */
  color?: string;
  /** Whether this node is highlighted (bright border) */
  highlighted?: boolean;
  /** Number of drops on this node */
  dropCount?: number;
  /** Subtitle text (e.g., "+10/harvest") */
  subtitle?: string;
  /** Extra data for node-specific rendering */
  data?: Record<string, any>;
}

export interface DemoEdge {
  id: string;
  source: string;
  target: string;
  /** Whether this edge is highlighted */
  highlighted?: boolean;
  /** Edge label */
  label?: string;
}

export interface DemoWorker {
  /** Which node the worker is currently at */
  nodeId: string;
  /** Worker color */
  color?: string;
  /** Status icon above the dot */
  status?: 'idle' | 'moving' | 'mining' | 'collecting' | 'depositing' | 'discarding' | 'scanning';
  /** Whether worker is holding an item */
  holding?: { type: string; amount: number } | null;
}

export interface DemoGraphState {
  nodes: DemoNode[];
  edges: DemoEdge[];
  worker?: DemoWorker;
  /** Status text shown below the graph */
  statusLabel?: string;
  /** Resources display (e.g., "Data: 150") */
  resources?: Record<string, number>;
}

export interface DemoStep {
  /** Which line to highlight in the code block (1-indexed) */
  codeLine: number;
  /** Transform the graph state. Return a NEW state object. */
  apply: (prev: DemoGraphState) => DemoGraphState;
  /** How long to show this step before auto-advancing (ms). Default 1200. */
  durationMs?: number;
}

export interface DemoScript {
  /** The code to display (Python). Lines are highlighted per step. */
  code: string;
  /** Initial graph state before any steps run. */
  initialState: DemoGraphState;
  /** Ordered steps. Each step highlights a code line and transforms graph state. */
  steps: DemoStep[];
}
