/**
 * Shared helpers for worker action handlers.
 */

import type { Item } from '../types.js';
import { getActivePassives } from '../domain/questState.js';

export const ACTION_DELAY = 1000;
export const MOVE_DELAY = 1000;
export const MINE_DELAY = 1000;

/** Get aggregated passive multipliers from quest rewards */
export function getPassiveEffects(): Record<string, number> {
  const passives = getActivePassives();
  const agg: Record<string, number> = {};
  for (const p of Object.values(passives)) {
    for (const [k, v] of Object.entries(p.effect)) {
      if (k.endsWith('_mult')) {
        agg[k] = (agg[k] || 1) * v;
      } else {
        agg[k] = (agg[k] || 0) + v;
      }
    }
  }
  return agg;
}

export function getItemTypeForNode(node: any): Item['type'] {
  const badDataChance = node.data.bad_data_chance || 0;
  if (badDataChance > 0 && Math.random() < badDataChance) {
    return 'bad_data';
  }
  return 'data_fragment';
}

export function calcItemCount(baseRate: number, efficiency: number): number {
  const base = Math.max(1, Math.floor(baseRate * efficiency));
  const variance = Math.floor(base * 0.1 * (Math.random() * 2 - 1));
  return Math.max(1, base + variance);
}

/** Context shared across action handlers within a single handleWorkerAction call */
export interface ActionContext {
  workerId: string;
  uid: string | undefined;
  worker: any;
  state: any;
  nodes: any[];
  edges: any[];
  resources: any;
}
