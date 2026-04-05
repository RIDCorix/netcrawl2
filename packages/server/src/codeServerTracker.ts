/**
 * Tracks code server heartbeat per user.
 * The code server polls /api/deploy-queue every ~1 second.
 * If no poll for 15 seconds, the code server is considered disconnected.
 */

const lastSeen = new Map<string, number>();
const wasConnected = new Map<string, boolean>();

export function markCodeServerSeen(userId?: string): void {
  lastSeen.set(userId || '__default__', Date.now());
  wasConnected.set(userId || '__default__', true);
}

export function isCodeServerConnected(userId?: string): boolean {
  const key = userId || '__default__';
  const ts = lastSeen.get(key) || 0;
  return Date.now() - ts < 15000;
}

/**
 * Check if code server just disconnected (was connected, now isn't).
 * Returns true once per disconnect event, then resets.
 */
export function checkCodeServerDisconnected(userId?: string): boolean {
  const key = userId || '__default__';
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
