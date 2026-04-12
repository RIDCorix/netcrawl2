/**
 * Cache node in-memory KV storage.
 */

import { getGameState } from './gameState.js';

interface CacheEntry {
  value: any;
  storedAt: number;
  ttl: number; // ms, 0 = no expiry
}

const cacheStores = new Map<string, Map<string, CacheEntry>>();

const CACHE_CAPACITY: Record<number, number> = { 0: 0, 1: 10, 2: 30, 3: 100 };
const CACHE_RANGE: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3 };

export function getCacheStore(nodeId: string): Map<string, CacheEntry> {
  if (!cacheStores.has(nodeId)) cacheStores.set(nodeId, new Map());
  return cacheStores.get(nodeId)!;
}

export function cacheGet(nodeId: string, key: string): any | undefined {
  const store = getCacheStore(nodeId);
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.ttl > 0 && Date.now() - entry.storedAt > entry.ttl) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(nodeId: string, key: string, value: any, ttl: number = 0): boolean {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node || node.type !== 'cache') return false;
  const level = node.data.upgradeLevel || 1;
  const capacity = CACHE_CAPACITY[level] || 10;
  const cacheStore = getCacheStore(nodeId);
  const now = Date.now();
  for (const [k, e] of cacheStore) {
    if (e.ttl > 0 && now - e.storedAt > e.ttl) cacheStore.delete(k);
  }
  if (!cacheStore.has(key) && cacheStore.size >= capacity) return false;
  cacheStore.set(key, { value, storedAt: now, ttl });
  return true;
}

export function cacheKeys(nodeId: string): string[] {
  const cacheStore = getCacheStore(nodeId);
  const now = Date.now();
  const keys: string[] = [];
  for (const [k, e] of cacheStore) {
    if (e.ttl > 0 && now - e.storedAt > e.ttl) { cacheStore.delete(k); continue; }
    keys.push(k);
  }
  return keys;
}

export function getCacheRange(nodeId: string): number {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node || node.type !== 'cache') return 0;
  return CACHE_RANGE[node.data.upgradeLevel || 1] || 1;
}

export function getCacheCapacity(nodeId: string): number {
  const state = getGameState();
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node || node.type !== 'cache') return 0;
  return CACHE_CAPACITY[node.data.upgradeLevel || 1] || 10;
}
