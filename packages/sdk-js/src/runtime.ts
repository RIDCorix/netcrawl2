/**
 * runtime.ts
 *
 * Runtime proxy objects for equipped items and gadgets.
 * These are created by the runner when injecting fields into a worker instance.
 */

import type { WorkerClass } from './base.js';
import { EdgeInfo, AdvancedEdgeInfo } from './sensors.js';

/**
 * Base runtime proxy for gadgets. Has a _worker back-reference
 * that gets set during worker initialization.
 */
export class RuntimeGadget {
  _worker: WorkerClass | null = null;

  toString(): string {
    return `<${this.constructor.name}>`;
  }
}

/**
 * Runtime proxy for SensorGadget. Provides pathfinding and exploration.
 */
export class RuntimeSensorGadget extends RuntimeGadget {
  async travelTo(nodeId: string): Promise<void> {
    if (!this._worker) throw new Error('Gadget not initialized -- _worker is null');
    const result = await this._worker._client!.action('findPath', {
      from: this._worker._currentNode,
      to: nodeId,
    });
    const path = (result['path'] as string[]) ?? [];
    if (!path.length) {
      throw new Error(`No path from ${this._worker._currentNode} to ${nodeId}`);
    }
    await this._worker.moveThrough(path);
  }

  async findNearest(nodeType: string): Promise<string | null> {
    if (!this._worker) throw new Error('Gadget not initialized -- _worker is null');
    const result = await this._worker._client!.action('findNearest', {
      from: this._worker._currentNode,
      nodeType,
    });
    return (result['nodeId'] as string) ?? null;
  }

  async explore(): Promise<Record<string, unknown>[]> {
    if (!this._worker) throw new Error('Gadget not initialized -- _worker is null');
    const result = await this._worker._client!.action('scan', { radius: 3 });
    return (result['nodes'] as Record<string, unknown>[]) ?? [];
  }
}

/**
 * Runtime proxy for BasicSensor. Calls server scan_edges action.
 * Returns EdgeInfo[] -- edges with basic info only.
 */
export class RuntimeBasicSensor extends RuntimeGadget {
  async scan(): Promise<EdgeInfo[]> {
    if (!this._worker) throw new Error('Gadget not initialized -- _worker is null');
    const result = await this._worker._client!.action('scan_edges', {});
    const edgesData = (result['edges'] as Record<string, unknown>[]) ?? [];
    return edgesData.map(e => new EdgeInfo(e));
  }
}

/**
 * Runtime proxy for AdvancedSensor. Calls server scan_edges_advanced action.
 * Returns AdvancedEdgeInfo[] -- edges with full target node type info.
 */
export class RuntimeAdvancedSensor extends RuntimeGadget {
  async scan(): Promise<AdvancedEdgeInfo[]> {
    if (!this._worker) throw new Error('Gadget not initialized -- _worker is null');
    const result = await this._worker._client!.action('scan_edges_advanced', {});
    const edgesData = (result['edges'] as Record<string, unknown>[]) ?? [];
    return edgesData.map(
      e => new AdvancedEdgeInfo(e, this._worker!._client!, this._worker!._workerId)
    );
  }
}

/**
 * Runtime proxy for equipped items. Wraps the injected item metadata.
 * Created by runner.ts when a worker class has an ItemField that gets injected
 * with a dict from NETCRAWL_INJECTED.
 */
export class RuntimeItem {
  readonly itemType: string;
  readonly efficiency: number;
  _worker: WorkerClass | null = null;

  constructor(metadata: Record<string, unknown>) {
    this.itemType = (metadata['itemType'] as string) ?? '';
    this.efficiency = (metadata['efficiency'] as number) ?? 1.0;
  }

  /**
   * Mine the current node using this pickaxe.
   * Creates a drop on the node floor. Use worker.collect() to pick it up.
   */
  async mine(): Promise<Record<string, unknown>> {
    if (!this._worker) {
      throw new Error('Item not properly initialized -- _worker is null');
    }
    return this._worker._client!.action('mine', {});
  }

  /**
   * Convenience: mine() then collect() in one call.
   * Returns the collected item, or error dict.
   */
  async mineAndCollect(): Promise<Record<string, unknown>> {
    const result = await this.mine();
    if (!result['ok']) {
      return result;
    }
    return this._worker!.collect();
  }

  toString(): string {
    return `<${this.itemType} efficiency=${this.efficiency}>`;
  }
}
