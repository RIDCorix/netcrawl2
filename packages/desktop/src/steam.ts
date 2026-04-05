/**
 * Steamworks integration stub.
 * Uses steamworks.js (optional dependency) for Steam API access.
 * Gracefully degrades when Steam SDK is not available.
 */

const STEAM_APP_ID = 480; // Valve's Spacewar test app ID — replace with real ID after registration

let steamClient: any = null;

export function initSteam(): boolean {
  try {
    // Write steam_appid.txt for development
    const fs = require('fs');
    const path = require('path');
    const appIdPath = path.join(process.cwd(), 'steam_appid.txt');
    if (!fs.existsSync(appIdPath)) {
      fs.writeFileSync(appIdPath, String(STEAM_APP_ID));
    }

    const steamworks = require('steamworks.js');
    steamClient = steamworks.init(STEAM_APP_ID);
    console.log('[Steam] Initialized successfully');
    return true;
  } catch {
    console.log('[Steam] Steamworks not available — running without Steam integration');
    return false;
  }
}

export function getSteamId(): string | null {
  if (!steamClient) return null;
  try {
    return steamClient.localplayer.getSteamId().steamId64.toString();
  } catch {
    return null;
  }
}

export function getSteamName(): string | null {
  if (!steamClient) return null;
  try {
    return steamClient.localplayer.getName();
  } catch {
    return null;
  }
}

export function unlockAchievement(id: string): void {
  if (!steamClient) return;
  try {
    steamClient.achievement.activate(id);
    console.log(`[Steam] Achievement unlocked: ${id}`);
  } catch (err) {
    console.error(`[Steam] Failed to unlock achievement ${id}:`, err);
  }
}

export function shutdownSteam(): void {
  // steamworks.js handles cleanup automatically
  steamClient = null;
}
