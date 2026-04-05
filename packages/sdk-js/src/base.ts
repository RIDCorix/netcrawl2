/**
 * base.ts
 *
 * WorkerClass base class -- the core of the NetCrawl JS SDK.
 * Unlike Python which uses a metaclass, JS uses static fields = {} on subclasses.
 */

import { ApiClient } from './client.js';
import { WorkerField, ItemField } from './fields.js';
import { createNode } from './nodes.js';
import { CacheService, ServiceNotReachable } from './services.js';
import type { BaseNode } from './nodes.js';
import type { FieldSchema } from './fields.js';

/**
 * Represents a pending request from an API node's queue.
 */
export class APIRequest {
  readonly id: string;
  readonly type: string;
  readonly body: Record<string, unknown>;
  readonly hasToken: boolean;
  readonly token: string | null;
  readonly deadlineTick: number;
  readonly reward: Record<string, unknown>;

  constructor(data: Record<string, unknown>) {
    this.id = data['id'] as string;
    this.type = data['type'] as string;
    this.body = (data['body'] as Record<string, unknown>) ?? {};
    this.hasToken = Boolean(data['has_token']);
    this.token = (data['token'] as string) ?? null;
    this.deadlineTick = (data['deadline_tick'] as number) ?? 0;
    this.reward = (data['reward'] as Record<string, unknown>) ?? {};
  }

  toString(): string {
    const auth = this.hasToken ? 'auth' : 'NO_TOKEN';
    return `<APIRequest id=${this.id.slice(0, 8)} type=${this.type} ${auth}>`;
  }
}

/** Discover fields from a class's static `fields` property walking the prototype chain. */
function discoverFields(cls: typeof WorkerClass): Record<string, WorkerField> {
  const fields: Record<string, WorkerField> = {};

  // Walk prototype chain to collect inherited fields
  const chain: (typeof WorkerClass)[] = [];
  let current: Function | null = cls;
  while (current && current !== Function.prototype) {
    if (Object.prototype.hasOwnProperty.call(current, 'fields')) {
      chain.push(current as typeof WorkerClass);
    }
    current = Object.getPrototypeOf(current);
  }

  // Apply from base to derived so derived fields override
  for (let i = chain.length - 1; i >= 0; i--) {
    const staticFields = (chain[i] as unknown as Record<string, unknown>)['fields'] as Record<string, WorkerField> | undefined;
    if (staticFields) {
      for (const [key, value] of Object.entries(staticFields)) {
        if (value instanceof WorkerField) {
          value._fieldName = key;
          fields[key] = value;
        }
      }
    }
  }

  return fields;
}

/**
 * Base class for all NetCrawl workers.
 *
 * Lifecycle:
 * 1. App discovers class, reads fields for requirements schema
 * 2. User deploys from UI, specifying items and edges/routes
 * 3. App spawns subprocess with env vars
 * 4. Runner instantiates class, injects field values, calls onStartup()
 * 5. Runner calls onLoop() in a loop until process is killed
 *
 * Internal state:
 * - Use regular instance variables in onStartup() and onLoop()
 * - State persists between onLoop() calls (instance stays alive)
 */
export class WorkerClass {
  // Static metadata -- override in subclasses
  static classId: string = '';
  static className: string = '';
  static classIcon: string = 'Bot';
  static fields: Record<string, WorkerField> = {};

  // Discovered fields (populated by getSchema / constructor)
  static _fields: Record<string, WorkerField> = {};

  // Instance state set by runner at instantiation time
  _workerId: string;
  _apiUrl: string;
  _currentNode: string = 'hub';
  _inventory: Record<string, unknown> = {};
  _holding: Record<string, unknown> | null = null;
  _client: ApiClient;

  // Dynamic field values injected at runtime
  [key: string]: unknown;

  constructor(workerId: string, apiUrl: string, injectedFields: Record<string, unknown>) {
    this._workerId = workerId;
    this._apiUrl = apiUrl;
    this._currentNode = 'hub';
    this._inventory = {};
    this._holding = null;
    this._client = new ApiClient(apiUrl, workerId);

    // Inject field values (replace descriptor instances with actual values)
    for (const [fieldName, value] of Object.entries(injectedFields)) {
      this[fieldName] = value;
    }

    // Give RuntimeItem/RuntimeGadget instances a back-reference to self
    const fields = discoverFields(this.constructor as typeof WorkerClass);
    for (const fieldName of Object.keys(fields)) {
      const instance = this[fieldName];
      if (instance != null && typeof instance === 'object' && '_worker' in (instance as object)) {
        (instance as { _worker: WorkerClass | null })._worker = this;
      }
    }
  }

  // -- Lifecycle hooks (override these) --

  async onStartup(): Promise<void> {}
  async onLoop(): Promise<void> {}

  // -- Node access --

  /**
   * Get a typed node object for the worker's current position.
   * Returns a subclass of BaseNode based on node type.
   */
  async getCurrentNode(): Promise<BaseNode> {
    const result = await this._client.action('get_node_info', {});
    if (!result['ok']) {
      throw new Error(`getCurrentNode() failed: ${result['error']}`);
    }
    return createNode(result, this._client, this._workerId);
  }

  // -- Services --

  /**
   * Get a service proxy for a structure node (e.g., Cache Node).
   * Throws ServiceNotReachable if the node is out of range or unavailable.
   */
  async getService(nodeId: string): Promise<CacheService> {
    const result = await this._client.action('get_service', { serviceNodeId: nodeId });
    if (!result['ok']) {
      const reason = result['reason'] as string ?? '';
      if (['not_reachable', 'not_found', 'not_a_service'].includes(reason)) {
        throw new ServiceNotReachable((result['error'] as string) ?? `Service '${nodeId}' not reachable`);
      }
      throw new ServiceNotReachable((result['error'] as string) ?? 'Unknown error');
    }

    const serviceType = result['serviceType'] as string;
    if (serviceType === 'cache') {
      return new CacheService(this._client, this._workerId, nodeId, result);
    }

    throw new ServiceNotReachable(`Unknown service type: ${serviceType}`);
  }

  // -- Movement --

  /**
   * Move along an edge, to a node, or through a route.
   * - If target is an array: treats as a route and moves through all
   * - If target looks like an edge ID (starts with 'e'): uses moveEdge
   * - Otherwise: legacy move by node ID
   */
  async move(target: string | string[]): Promise<void> {
    if (Array.isArray(target)) {
      return this.moveThrough(target);
    }
    if (typeof target === 'string' && target.startsWith('e') && /^\d+$/.test(target.slice(1))) {
      await this.moveEdge(target);
      return;
    }
    const result = await this._client.action('move', { targetNodeId: target });
    if (result['ok']) {
      this._currentNode = target;
    } else {
      throw new Error(`Cannot move to ${target}: ${result['error']}`);
    }
  }

  /**
   * Move along a specific edge. The worker travels to the other end
   * of the edge from their current position.
   */
  async moveEdge(edgeId: string): Promise<Record<string, unknown>> {
    const result = await this._client.action('move_edge', { edgeId });
    if (result['ok']) {
      this._currentNode = (result['to'] as string) ?? this._currentNode;
      return result;
    } else {
      throw new Error(`Cannot move along edge ${edgeId}: ${result['error']}`);
    }
  }

  /**
   * Get all edges connected to the current node.
   */
  async getEdges(): Promise<Array<{ id: string; otherNode: string }>> {
    const result = await this._client.action('get_edges', {});
    return (result['edges'] as Array<{ id: string; otherNode: string }>) ?? [];
  }

  /**
   * Move through a list of edge IDs or node IDs in order.
   */
  async moveThrough(route: string[]): Promise<void> {
    const items = [...route];
    for (const item of items) {
      if (item === this._currentNode) {
        continue;
      }
      await this.move(item);
    }
  }

  // -- Resource actions --

  /**
   * Pick up a drop from the current node into the 1-slot internal inventory.
   */
  async collect(): Promise<Record<string, unknown>> {
    const result = await this._client.action('collect', {});
    if (result['ok']) {
      this._holding = (result['item'] as Record<string, unknown>) ?? null;
    }
    return result;
  }

  /**
   * Deposit the held item into player inventory. Must be at Hub node.
   */
  async deposit(): Promise<Record<string, unknown>> {
    const result = await this._client.action('deposit', {});
    if (result['ok']) {
      this._holding = null;
      this._inventory = {};
    }
    return result;
  }

  /**
   * Discard the currently held item without depositing.
   */
  async discard(): Promise<Record<string, unknown>> {
    const result = await this._client.action('discard', {});
    if (result['ok']) {
      this._holding = null;
    }
    return result;
  }

  /**
   * Check if the current node has any dropped items waiting to be collected.
   */
  async hasDroppedItems(): Promise<boolean> {
    const result = await this._client.action('has_dropped_items', {});
    return Boolean(result['has_items']);
  }

  /**
   * Legacy: harvest resources at current node (old carry system).
   */
  async harvest(): Promise<Record<string, unknown>> {
    const result = await this._client.action('harvest', {});
    if (result['ok']) {
      this._inventory = (result['carrying'] as Record<string, unknown>) ?? {};
    }
    return result;
  }

  // -- Scanning --

  /**
   * Scan adjacent nodes.
   */
  async scan(): Promise<Record<string, unknown>[]> {
    const result = await this._client.action('scan', {});
    return (result['nodes'] as Record<string, unknown>[]) ?? [];
  }

  // -- Repair --

  /**
   * Repair an infected node. Costs 30 data from game resources.
   * Must be adjacent to the target node.
   */
  async repair(nodeId: string): Promise<boolean> {
    const result = await this._client.action('repair', { nodeId });
    return Boolean(result['ok']);
  }

  // -- API Node methods --

  /**
   * Poll the current API node for the next pending request.
   * Must be standing on an api-type node.
   */
  async pollRequest(): Promise<APIRequest | null> {
    const result = await this._client.action('api_poll', {});
    if (!result['ok']) {
      throw new Error((result['error'] as string) ?? 'api_poll failed');
    }
    const reqData = result['request'] as Record<string, unknown> | null;
    if (reqData == null) {
      return null;
    }
    return new APIRequest(reqData);
  }

  /**
   * Respond to a request with a 2xx success response.
   * Only call this for AUTHENTICATED requests (req.hasToken === true).
   * Calling this on an unauthenticated request adds +25 infection!
   */
  async respond(requestId: string, responseData: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this._client.action('api_respond', {
      requestId,
      responseData,
    });
    if (!result['ok']) {
      throw new Error((result['error'] as string) ?? 'api_respond failed');
    }
    return result;
  }

  /**
   * Reject a request with an error status code (4xx or 5xx).
   */
  async reject(requestId: string, statusCode: number = 401): Promise<Record<string, unknown>> {
    const result = await this._client.action('api_reject', {
      requestId,
      statusCode,
    });
    if (!result['ok']) {
      this.warn(`reject(${statusCode}) failed: ${result['error']}`);
    }
    return result;
  }

  /**
   * Validate a token by querying the auth node you're currently standing on.
   */
  async validateToken(token: string): Promise<{ valid: boolean; ttl: number }> {
    const result = await this._client.action('validate_token', { token });
    if (!result['ok']) {
      throw new Error((result['error'] as string) ?? 'validate_token failed');
    }
    return {
      valid: Boolean(result['valid']),
      ttl: (result['ttl'] as number) ?? 0,
    };
  }

  // -- Logging --

  private async _log(level: string, msg: string): Promise<void> {
    const tag = level.toUpperCase();
    await this._client.action('log', { message: `[${tag}] ${msg}`, level });
    console.log(`[${this._workerId}] ${tag}: ${msg}`);
  }

  async info(msg: string): Promise<void> {
    await this._log('info', msg);
  }

  async warn(msg: string): Promise<void> {
    await this._log('warn', msg);
  }

  async error(msg: string): Promise<void> {
    await this._log('error', msg);
  }

  // -- Inventory --

  get holding(): Record<string, unknown> | null {
    return this._holding;
  }

  get carrying(): Record<string, unknown> {
    return { ...this._inventory };
  }

  get currentNode(): string {
    return this._currentNode;
  }

  // -- Class metadata --

  /**
   * Returns the deploy-time requirements schema.
   * Called by app scanner to register with server.
   */
  static getSchema(): Record<string, unknown> {
    const cls = this as unknown as typeof WorkerClass;
    const fields = discoverFields(cls);

    // Default classId to lowercase class name if not set
    const classId = cls.classId || cls.name.toLowerCase();
    const className = cls.className || cls.name;
    const classIcon = cls.classIcon || 'Bot';

    const fieldSchemas: Record<string, FieldSchema> = {};
    for (const [name, field] of Object.entries(fields)) {
      fieldSchemas[name] = field.schema();
    }

    return {
      class_id: classId,
      class_name: className,
      class_icon: classIcon,
      fields: fieldSchemas,
      docstring: '',
    };
  }
}
