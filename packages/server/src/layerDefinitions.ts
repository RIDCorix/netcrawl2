/**
 * Multi-layer definitions — each layer is a distinct network map.
 * Layer 0 is the existing map (defined in db.ts).
 * Layer 1+ are defined here.
 */

import type { FlopState } from './db.js';

// ── Layer metadata ────────────────────────────────────────────────────────────

export interface LayerDef {
  id: number;
  name: string;
  tagline: string;
  description: string;
  color: string;
  emoji: string;
  unlockThresholds: {
    total_data_deposited?: number;
    rp?: number;        // current resource balance
    credits?: number;   // current resource balance
  };
}

export const LAYER_DEFS: LayerDef[] = [
  {
    id: 0,
    name: 'Surface Network',
    tagline: 'The open internet',
    description: 'Scattered nodes, raw data mines, and your first API endpoints. The starting point.',
    color: '#00d4aa',
    emoji: '🌐',
    unlockThresholds: {},
  },
  {
    id: 1,
    name: 'Corp Intranet',
    tagline: 'Internal corporate network',
    description: 'High-security API nodes, multi-factor auth, corporate databases. Valuable — but defended.',
    color: '#60a5fa',
    emoji: '🏢',
    unlockThresholds: {
      total_data_deposited: 5000,
      rp: 50,
      credits: 20,
    },
  },
  {
    id: 2,
    name: 'Dark Subnet',
    tagline: 'Unindexed. Encrypted.',
    description: 'No one knows what runs here. Rare chips, extreme compute, unusual node types.',
    color: '#a78bfa',
    emoji: '🌑',
    unlockThresholds: {
      total_data_deposited: 25000,
      rp: 200,
      credits: 100,
    },
  },
  {
    id: 3,
    name: 'The Core',
    tagline: 'Root access',
    description: 'The heart of the network. Few reach this depth. Fewer survive it.',
    color: '#ef4444',
    emoji: '⚡',
    unlockThresholds: {
      total_data_deposited: 100000,
      rp: 1000,
      credits: 500,
    },
  },
];

// ── Layer initial node/edge layouts ─────────────────────────────────────────

// Node data helpers (same pattern as db.ts)
const R1 = (label: string, rate: number, cost: Record<string, number>) =>
  ({ label, resource: 'data' as const, rate, unlocked: false, unlockCost: cost, mineable: true, items: [] as any[], mineCount: 0, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] });
const C1 = (label: string, diff: 'easy' | 'medium' | 'hard', cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, difficulty: diff, rewardResource: 'rp' as const, solveCount: 0, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] });
const Y1 = (label: string, cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] });
const P1 = (label: string, tier: number, cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, tier, infectionValue: 0, pendingRequests: 0, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] });
const A1 = (label: string, cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, upgradeLevel: 0, chipSlots: 1, installedChips: [] as string[] });
const E1 = (label: string, cost: Record<string, number>) =>
  ({ label, unlocked: false, unlockCost: cost, upgradeLevel: 0, chipSlots: 0, installedChips: [] as string[] });

export const LAYER_1_INITIAL_NODES = [
  // Hub
  { id: 'l1_hub', type: 'hub', position: { x: -45, y: -36 },
    data: { label: 'HQ Terminal', unlocked: true, upgradeLevel: 0, chipSlots: 2, installedChips: [] as string[] } },

  // Entry Zone — lightly defended lobby
  { id: 'l1_n_relay1', type: 'empty',    position: { x: 0,    y: -240 }, data: Y1('Internal DNS',   { data: 100 }) },
  { id: 'l1_n_api1',   type: 'api',      position: { x: -200, y: -400 }, data: P1('REST Gateway',   1, { data: 200 }) },
  { id: 'l1_n_api2',   type: 'api',      position: { x: 200,  y: -400 }, data: P1('Auth Service',   1, { data: 200, rp: 2 }) },
  { id: 'l1_n_auth1',  type: 'auth',     position: { x: 0,    y: -560 }, data: A1('LDAP Auth',          { data: 400, rp: 5 }) },

  // East Wing — Dev / CI
  { id: 'l1_e_relay1', type: 'empty',    position: { x: 380,  y: -120 }, data: Y1('Dev VLAN',       { data: 300 }) },
  { id: 'l1_e_comp1',  type: 'compute',  position: { x: 600,  y: -280 }, data: C1('CI Runner',      'easy',   { data: 500 }) },
  { id: 'l1_e_api3',   type: 'api',      position: { x: 600,  y: 40   }, data: P1('Build API',      1, { data: 400 }) },
  { id: 'l1_e_relay2', type: 'empty',    position: { x: 860,  y: -120 }, data: Y1('QA VLAN',        { data: 800 }) },
  { id: 'l1_e_comp2',  type: 'compute',  position: { x: 1060, y: -280 }, data: C1('Test Cluster',   'medium', { data: 1000, rp: 8 }) },
  { id: 'l1_e_api4',   type: 'api',      position: { x: 1060, y: 40   }, data: P1('Deploy API',     2, { data: 1200, rp: 5 }) },
  { id: 'l1_e_auth2',  type: 'auth',     position: { x: 1300, y: -120 }, data: A1('DevOps IAM',         { data: 1500, rp: 10 }) },

  // North Wing — Finance
  { id: 'l1_nn_relay1',type: 'empty',    position: { x: -200, y: -760 }, data: Y1('Finance VLAN',   { data: 600, rp: 3 }) },
  { id: 'l1_nn_comp1', type: 'compute',  position: { x: -450, y: -960 }, data: C1('ERP Node',       'medium', { data: 900, rp: 6 }) },
  { id: 'l1_nn_api5',  type: 'api',      position: { x: 80,   y: -960 }, data: P1('Billing API',    2, { data: 1100, rp: 8 }) },
  { id: 'l1_nn_locked',type: 'empty',    position: { x: -200, y: -1180},  data: E1('Finance Vault',      { data: 4000, rp: 30 }) },

  // South Wing — HR / CRM (data-rich)
  { id: 'l1_s_relay1', type: 'empty',    position: { x: 0,    y: 320  }, data: Y1('HR VLAN',        { data: 400 }) },
  { id: 'l1_s_mine1',  type: 'resource', position: { x: 200,  y: 480  }, data: R1('Employee DB',    40, { data: 600 }) },
  { id: 'l1_s_api7',   type: 'api',      position: { x: -200, y: 480  }, data: P1('HR Portal API',  1, { data: 500, rp: 3 }) },
  { id: 'l1_s_mine2',  type: 'resource', position: { x: 200,  y: 700  }, data: R1('Customer DB',    60, { data: 1300, rp: 6 }) },
  { id: 'l1_s_comp1',  type: 'compute',  position: { x: -200, y: 700  }, data: C1('Analytics',      'hard',   { data: 2000, rp: 12 }) },

  // West Wing — NOC / Infra
  { id: 'l1_w_relay1', type: 'empty',    position: { x: -400, y: 40   }, data: Y1('NOC VLAN',       { data: 350 }) },
  { id: 'l1_w_api8',   type: 'api',      position: { x: -640, y: -140 }, data: P1('Monitor API',    1, { data: 500 }) },
  { id: 'l1_w_comp2',  type: 'compute',  position: { x: -640, y: 220  }, data: C1('Log Collector',  'easy',   { data: 700, rp: 4 }) },
  { id: 'l1_w_auth3',  type: 'auth',     position: { x: -900, y: 40   }, data: A1('SOC Gateway',        { data: 1200, rp: 10 }) },
];

export const LAYER_1_INITIAL_EDGES = [
  // Hub spokes
  { id: 'l1e1',  source: 'l1_hub',      target: 'l1_n_relay1' },
  { id: 'l1e2',  source: 'l1_hub',      target: 'l1_e_relay1' },
  { id: 'l1e3',  source: 'l1_hub',      target: 'l1_s_relay1' },
  { id: 'l1e4',  source: 'l1_hub',      target: 'l1_w_relay1' },
  // Entry zone
  { id: 'l1e5',  source: 'l1_n_relay1', target: 'l1_n_api1' },
  { id: 'l1e6',  source: 'l1_n_relay1', target: 'l1_n_api2' },
  { id: 'l1e7',  source: 'l1_n_api1',   target: 'l1_n_auth1' },
  { id: 'l1e8',  source: 'l1_n_api2',   target: 'l1_n_auth1' },
  // East wing
  { id: 'l1e9',  source: 'l1_e_relay1', target: 'l1_e_comp1' },
  { id: 'l1e10', source: 'l1_e_relay1', target: 'l1_e_api3' },
  { id: 'l1e11', source: 'l1_e_relay1', target: 'l1_e_relay2' },
  { id: 'l1e12', source: 'l1_e_relay2', target: 'l1_e_comp2' },
  { id: 'l1e13', source: 'l1_e_relay2', target: 'l1_e_api4' },
  { id: 'l1e14', source: 'l1_e_relay2', target: 'l1_e_auth2' },
  // North wing
  { id: 'l1e15', source: 'l1_n_auth1',  target: 'l1_nn_relay1' },
  { id: 'l1e16', source: 'l1_nn_relay1',target: 'l1_nn_comp1' },
  { id: 'l1e17', source: 'l1_nn_relay1',target: 'l1_nn_api5' },
  { id: 'l1e18', source: 'l1_nn_relay1',target: 'l1_nn_locked' },
  // South wing
  { id: 'l1e19', source: 'l1_s_relay1', target: 'l1_s_mine1' },
  { id: 'l1e20', source: 'l1_s_relay1', target: 'l1_s_api7' },
  { id: 'l1e21', source: 'l1_s_mine1',  target: 'l1_s_mine2' },
  { id: 'l1e22', source: 'l1_s_api7',   target: 'l1_s_comp1' },
  // West wing
  { id: 'l1e23', source: 'l1_w_relay1', target: 'l1_w_api8' },
  { id: 'l1e24', source: 'l1_w_relay1', target: 'l1_w_comp2' },
  { id: 'l1e25', source: 'l1_w_relay1', target: 'l1_w_auth3' },
  // Cross-wing
  { id: 'l1e26', source: 'l1_n_relay1', target: 'l1_nn_relay1' },
  { id: 'l1e27', source: 'l1_e_relay1', target: 'l1_n_relay1' },
];

export interface LayerSnapshot {
  nodes: any[];
  edges: any[];
  workers: Record<string, any>;
  flop: FlopState;
  tick: number;
  gameOver: boolean;
}

export function getLayerInitialSnapshot(layerId: number): LayerSnapshot {
  if (layerId === 1) {
    return {
      nodes: JSON.parse(JSON.stringify(LAYER_1_INITIAL_NODES)),
      edges: JSON.parse(JSON.stringify(LAYER_1_INITIAL_EDGES)),
      workers: {},
      flop: { total: 50, used: 0 },
      tick: 0,
      gameOver: false,
    };
  }
  throw new Error(`No initial snapshot for layer ${layerId}`);
}
