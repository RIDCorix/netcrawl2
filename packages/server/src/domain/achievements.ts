/**
 * Achievement state accessors — stats tracking and unlock management.
 */

import { resolveStore } from '../store.js';
import type { AchievementState } from '../types.js';

export function getAchievementState(userId?: string): AchievementState {
  return resolveStore(userId).achievement_state;
}

export function incrementStat(key: string, amount: number = 1, userId?: string): number {
  const s = resolveStore(userId).achievement_state.stats;
  s[key] = (s[key] || 0) + amount;
  return s[key];
}

export function setStatMax(key: string, value: number, userId?: string): number {
  const s = resolveStore(userId).achievement_state.stats;
  s[key] = Math.max(s[key] || 0, value);
  return s[key];
}

export function getStat(key: string, userId?: string): number {
  return resolveStore(userId).achievement_state.stats[key] || 0;
}

export function addToStatArray(key: string, value: string, userId?: string): string[] {
  const a = resolveStore(userId).achievement_state.statArrays;
  if (!a[key]) a[key] = [];
  if (!a[key].includes(value)) a[key].push(value);
  return a[key];
}

export function getStatArray(key: string, userId?: string): string[] {
  return resolveStore(userId).achievement_state.statArrays[key] || [];
}

export function markAchievementUnlocked(id: string, userId?: string): void {
  resolveStore(userId).achievement_state.unlocked[id] = new Date().toISOString();
}

export function isAchievementUnlocked(id: string, userId?: string): boolean {
  return !!resolveStore(userId).achievement_state.unlocked[id];
}
