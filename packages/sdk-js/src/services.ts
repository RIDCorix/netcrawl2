/**
 * services.ts
 *
 * Service proxies for structure nodes (Cache, etc.)
 * Obtained via worker.getService("node-id").
 */

import type { ApiClient } from './client.js';

export class ServiceNotReachable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceNotReachable';
  }
}

/**
 * Proxy for a Cache Node. Provides key-value get/set within range.
 */
export class CacheService {
  private _client: ApiClient;
  private _workerId: string;
  private _nodeId: string;
  readonly range: number;
  readonly capacity: number;
  readonly usedSlots: number;

  constructor(client: ApiClient, workerId: string, cacheNodeId: string, info: Record<string, unknown>) {
    this._client = client;
    this._workerId = workerId;
    this._nodeId = cacheNodeId;
    this.range = (info['range'] as number) ?? 1;
    this.capacity = (info['capacity'] as number) ?? 10;
    this.usedSlots = (info['usedSlots'] as number) ?? 0;
  }

  async get(key: string): Promise<unknown> {
    const result = await this._client.action('cache_get', {
      cacheNodeId: this._nodeId,
      key,
    });
    if (!result['ok']) {
      if (result['reason'] === 'not_reachable') {
        throw new ServiceNotReachable(`Cache '${this._nodeId}' is out of range`);
      }
      return null;
    }
    return result['hit'] ? result['value'] : null;
  }

  async set(key: string, value: unknown, ttl: number = 0): Promise<boolean> {
    const result = await this._client.action('cache_set', {
      cacheNodeId: this._nodeId,
      key,
      value,
      ttl,
    });
    if (!result['ok']) {
      if (result['reason'] === 'not_reachable') {
        throw new ServiceNotReachable(`Cache '${this._nodeId}' is out of range`);
      }
      return false;
    }
    return true;
  }

  async keys(): Promise<string[]> {
    const result = await this._client.action('cache_keys', {
      cacheNodeId: this._nodeId,
    });
    if (!result['ok']) {
      if (result['reason'] === 'not_reachable') {
        throw new ServiceNotReachable(`Cache '${this._nodeId}' is out of range`);
      }
      return [];
    }
    return (result['keys'] as string[]) ?? [];
  }

  toString(): string {
    return `<CacheService node=${this._nodeId} range=${this.range} capacity=${this.capacity}>`;
  }
}
