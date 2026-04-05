/**
 * sensors.ts
 *
 * Data types returned by sensor equipment (BasicSensor, AdvancedSensor).
 * Lightweight wrappers around server response data.
 */

import type { ApiClient } from './client.js';
import { type BaseNode, createNode } from './nodes.js';

/**
 * Basic edge information returned by BasicSensor.scan().
 * Contains only the edge ID -- you can move along it, but you don't know
 * what's on the other side.
 */
export class EdgeInfo {
  readonly edgeId: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;

  constructor(data: Record<string, unknown>) {
    this.edgeId = data['edge_id'] as string;
    this.sourceNodeId = data['source_node_id'] as string;
    this.targetNodeId = data['target_node_id'] as string;
  }

  toString(): string {
    return `<EdgeInfo ${this.edgeId}: ${this.sourceNodeId} -> ${this.targetNodeId}>`;
  }
}

/**
 * Advanced edge information returned by AdvancedSensor.scan().
 * Extends EdgeInfo with full target node type info, enabling
 * instanceof checks and attribute access.
 */
export class AdvancedEdgeInfo extends EdgeInfo {
  readonly targetNode: BaseNode;

  constructor(data: Record<string, unknown>, client: ApiClient, workerId: string) {
    super(data);
    const nodeData = (data['target_node_data'] as Record<string, unknown>) ?? {};
    this.targetNode = createNode(nodeData, client, workerId);
  }

  toString(): string {
    const nodeType = this.targetNode.constructor.name;
    return `<AdvancedEdgeInfo ${this.edgeId}: -> ${this.targetNodeId} (${nodeType})>`;
  }
}
