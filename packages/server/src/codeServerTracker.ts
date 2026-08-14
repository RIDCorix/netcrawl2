/**
 * Tracks code server heartbeat per user.
 * The code server polls /api/deploy-queue every ~1 second.
 * If no poll for 15 seconds, the code server is considered disconnected.
 */

import { randomUUID } from 'crypto';

interface CodeServerLease {
  sessionId: string;
  expiresAt: number;
}

const lastSeen = new Map<string, number>();
const wasConnected = new Map<string, boolean>();
const leases = new Map<string, CodeServerLease>();

const keyFor = (userId?: string) => userId || '__default__';

/** Claim the sole Code Server lease for a user. A running second server gets a conflict. */
export function claimCodeServerLease(
  requestedSessionId?: string,
  userId?: string,
): { ok: true; sessionId: string; expiresAt: number } | { ok: false; reason: 'code_server_conflict' } {
  const key = keyFor(userId);
  const now = Date.now();
  const existing = leases.get(key);
  if (existing && existing.expiresAt > now && requestedSessionId && existing.sessionId !== requestedSessionId) {
    return { ok: false, reason: 'code_server_conflict' };
  }
  if (existing && existing.expiresAt > now && !requestedSessionId) return { ok: false, reason: 'code_server_conflict' };
  const sessionId = requestedSessionId || randomUUID();
  const expiresAt = now + 15_000;
  leases.set(key, { sessionId, expiresAt });
  lastSeen.set(key, now);
  wasConnected.set(key, true);
  return { ok: true, sessionId, expiresAt };
}

export function isValidCodeServerLease(sessionId: string | undefined, userId?: string): boolean {
  const lease = leases.get(keyFor(userId));
  return Boolean(sessionId && lease && lease.sessionId === sessionId && lease.expiresAt > Date.now());
}

export function renewCodeServerLease(sessionId: string, userId?: string): number | null {
  const key = keyFor(userId);
  const lease = leases.get(key);
  if (!lease || lease.sessionId !== sessionId || lease.expiresAt <= Date.now()) return null;
  lease.expiresAt = Date.now() + 15_000;
  lastSeen.set(key, Date.now());
  wasConnected.set(key, true);
  return lease.expiresAt;
}

/** Invalidate all runtime observations after a Game Server restart/reset. */
export function invalidateCodeServerLease(userId?: string): void {
  const key = keyFor(userId);
  leases.delete(key);
  lastSeen.delete(key);
  wasConnected.delete(key);
}

export function releaseCodeServerLease(sessionId: string | undefined, userId?: string): boolean {
  const key = keyFor(userId);
  const lease = leases.get(key);
  if (!sessionId || !lease || lease.sessionId !== sessionId || lease.expiresAt <= Date.now()) return false;
  leases.delete(key);
  lastSeen.delete(key);
  wasConnected.delete(key);
  return true;
}

export function markCodeServerSeen(userId?: string): void {
  const key = keyFor(userId);
  lastSeen.set(key, Date.now());
  wasConnected.set(key, true);
}

export function isCodeServerConnected(userId?: string): boolean {
  const key = keyFor(userId);
  const ts = lastSeen.get(key) || 0;
  return Date.now() - ts < 15000;
}

/**
 * Check if code server just disconnected (was connected, now isn't).
 * Returns true once per disconnect event, then resets.
 */
export function checkCodeServerDisconnected(userId?: string): boolean {
  const key = keyFor(userId);
  const connected = isCodeServerConnected(userId);
  const was = wasConnected.get(key) || false;

  if (was && !connected) {
    wasConnected.set(key, false);
    return true; // just disconnected
  }
  if (connected) {
    wasConnected.set(key, true);
  }
  return false;
}
