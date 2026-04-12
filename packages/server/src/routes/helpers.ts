/**
 * Shared helpers for route handlers.
 */

import path from 'path';
import fs from 'fs';
import { Request, Response } from 'express';
import { addToPlayerInventory } from '../domain/inventory.js';

/** Extract userId from request (set by auth middleware in multi-user mode). */
export function getUserId(req: Request): string | undefined {
  return (req as any)._userId || undefined;
}

/**
 * Send a standardized error response.
 * All API errors use the shape: { error: string, reason?: string }
 */
export function sendError(res: Response, status: number, error: string, reason?: string) {
  const body: { error: string; reason?: string } = { error };
  if (reason) body.reason = reason;
  return res.status(status).json(body);
}

/** Return all equipment + held items from a worker to player inventory */
export function returnWorkerItems(worker: any, uid?: string) {
  if (worker.equippedPickaxe) {
    addToPlayerInventory(worker.equippedPickaxe.itemType, 1, undefined, uid);
  }
  if (worker.equippedCpu) {
    addToPlayerInventory(worker.equippedCpu.itemType, worker.equippedCpu.count || 1, undefined, uid);
  }
  if (worker.equippedRam) {
    addToPlayerInventory(worker.equippedRam.itemType, worker.equippedRam.count || 1, undefined, uid);
  }
  for (const item of (worker.holding || [])) {
    if (item.type !== 'bad_data') {
      addToPlayerInventory(item.type, item.count, undefined, uid);
    }
  }
}

/** Resolve workspace path from config or default */
export function getWorkspacePath(): string {
  const configPath = path.join(process.cwd(), 'netcrawl.config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.workspacePath) {
      return path.resolve(config.workspacePath);
    }
  }
  return path.join(process.cwd(), 'workspace');
}
