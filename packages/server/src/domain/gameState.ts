/**
 * Core game state CRUD + visibility computation.
 */

import fs from 'fs';
import { resolveStore, forcePersist, getInitialStore } from '../store.js';
import type { GameStateRow } from '../types.js';
import { getNodeChipEffects } from './chips.js';
import { computeNodeBuffer, MAX_CHIP_SLOTS } from '../upgradeDefinitions.js';

const isMultiUser = () => process.env.NETCRAWL_MULTI_USER === 'true';

export function getGameState(userId?: string): GameStateRow {
  return resolveStore(userId).game_state;
}

/**
 * Return only nodes within `depth` hops of any unlocked node,
 * plus the edges that connect visible nodes.
 */
export function getVisibleState(depth = 2, userId?: string): { nodes: any[]; edges: any[] } {
  const { nodes, edges } = resolveStore(userId).game_state;

  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  const visible = new Set<string>();
  const queue: { id: string; d: number }[] = [];

  for (const n of nodes) {
    if (n.id === 'hub' || n.data?.unlocked) {
      visible.add(n.id);
      queue.push({ id: n.id, d: 0 });
    }
  }

  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    if (d >= depth) continue;
    const neighbors = adj.get(id);
    if (!neighbors) continue;
    for (const nid of neighbors) {
      if (!visible.has(nid)) {
        visible.add(nid);
        queue.push({ id: nid, d: d + 1 });
      }
    }
  }

  const enrichedNodes = nodes
    .filter(n => visible.has(n.id))
    .map(n => {
      const chipEffects = getNodeChipEffects(n.id, userId);
      const maxBuffer = computeNodeBuffer(n.type, chipEffects);
      return {
        ...n,
        data: {
          ...n.data,
          maxBuffer,
          chipSlots: Math.min(MAX_CHIP_SLOTS, n.data.chipSlots || 0),
        },
      };
    });

  return {
    nodes: enrichedNodes,
    edges: edges.filter(e => visible.has(e.source) && visible.has(e.target)),
  };
}

export function saveGameState(state: GameStateRow, userId?: string) {
  const s = resolveStore(userId);
  s.game_state = state;
}

export function resetGameState(userId?: string) {
  const fresh = getInitialStore();
  if (isMultiUser() && userId) {
    // Replace the user's store with fresh state
    const s = resolveStore(userId);
    Object.assign(s, fresh);
    forcePersist(userId);
  } else {
    const s = resolveStore();
    Object.assign(s, fresh);
    forcePersist();
  }
}
