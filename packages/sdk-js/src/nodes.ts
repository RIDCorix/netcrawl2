/**
 * nodes.ts
 *
 * Typed node objects returned by WorkerClass.getCurrentNode().
 * Each node type exposes type-specific methods.
 */

import type { ApiClient } from './client.js';

export class NodeEdge {
  readonly id: string;
  readonly otherNode: string;

  constructor(id: string, otherNode: string) {
    this.id = id;
    this.otherNode = otherNode;
  }

  toString(): string {
    return `NodeEdge(id=${this.id}, otherNode=${this.otherNode})`;
  }
}

export class BaseNode {
  protected _info: Record<string, unknown>;
  protected _client: ApiClient;
  protected _workerId: string;
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly data: Record<string, unknown>;
  readonly edges: NodeEdge[];

  constructor(info: Record<string, unknown>, client: ApiClient, workerId: string) {
    this._info = info;
    this._client = client;
    this._workerId = workerId;
    this.id = info['id'] as string;
    this.type = info['type'] as string;
    this.label = (info['label'] as string) ?? '';
    this.data = (info['data'] as Record<string, unknown>) ?? {};
    const rawEdges = (info['edges'] as Array<{ id: string; otherNode: string }>) ?? [];
    this.edges = rawEdges.map(e => new NodeEdge(e.id, e.otherNode));
  }

  get isUnlocked(): boolean {
    return Boolean(this.data['unlocked']);
  }

  get isInfected(): boolean {
    return Boolean(this.data['infected']);
  }

  get upgradeLevel(): number {
    return (this.data['upgradeLevel'] as number) ?? 0;
  }

  toString(): string {
    return `${this.constructor.name}(id=${this.id}, label=${this.label})`;
  }
}

export class HubNode extends BaseNode {}

export class ResourceNode extends BaseNode {
  get resourceType(): string {
    return (this.data['resource'] as string) ?? '';
  }

  get rate(): number {
    return (this.data['rate'] as number) ?? 0;
  }

  get isMineable(): boolean {
    return Boolean(this.data['mineable']);
  }

  mine(): never {
    throw new Error(
      'Mining is done through equipment: self.pickaxe.mine(). ' +
      'The ResourceNode provides info about the node.'
    );
  }
}

export class ComputeNode extends BaseNode {
  get difficulty(): string {
    return (this.data['difficulty'] as string) ?? 'easy';
  }

  get rewardResource(): string {
    return (this.data['rewardResource'] as string) ?? 'data';
  }

  get solveCount(): number {
    return (this.data['solveCount'] as number) ?? 0;
  }

  async getTask(): Promise<ComputeTask> {
    const result = await this._client.action('compute', {});
    if (!result['ok']) {
      throw new Error(`getTask() failed: ${result['error']}`);
    }
    return new ComputeTask(
      result['taskId'] as string,
      result['params'] as Record<string, unknown>,
      (result['hint'] as string) ?? '',
      (result['difficulty'] as string) ?? 'easy',
    );
  }

  async submit(taskId: string, answer: unknown): Promise<Record<string, unknown>> {
    return this._client.action('submit', { taskId, answer });
  }
}

export class ComputeTask {
  readonly taskId: string;
  readonly parameters: Record<string, unknown>;
  readonly hint: string;
  readonly difficulty: string;

  constructor(taskId: string, parameters: Record<string, unknown>, hint: string, difficulty: string) {
    this.taskId = taskId;
    this.parameters = parameters;
    this.hint = hint;
    this.difficulty = difficulty;
  }

  toString(): string {
    return `ComputeTask(id=${this.taskId}, hint=${this.hint})`;
  }
}

export class APINode extends BaseNode {
  async pollForRequest(): Promise<APIRequestObj | null> {
    const result = await this._client.action('api_poll', {});
    if (!result['ok']) {
      return null;
    }
    const req = result['request'] as Record<string, unknown> | null;
    if (req == null) {
      return null;
    }
    return new APIRequestObj(
      req['id'] as string,
      req['type'] as string,
      (req['body'] as Record<string, unknown>) ?? {},
      Boolean(req['has_token']),
      (req['deadline_tick'] as number) ?? 0,
      (req['reward'] as Record<string, unknown>) ?? {},
    );
  }

  async respond(requestId: string, responseData: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._client.action('api_respond', {
      requestId,
      responseData,
    });
  }

  async getStats(): Promise<Record<string, unknown>> {
    return this._client.action('api_stats', {});
  }
}

export class APIRequestObj {
  readonly id: string;
  readonly type: string;
  readonly body: Record<string, unknown>;
  readonly hasToken: boolean;
  readonly deadlineTick: number;
  readonly reward: Record<string, unknown>;

  constructor(
    id: string,
    type: string,
    body: Record<string, unknown>,
    hasToken: boolean,
    deadlineTick: number,
    reward: Record<string, unknown>,
  ) {
    this.id = id;
    this.type = type;
    this.body = body;
    this.hasToken = hasToken;
    this.deadlineTick = deadlineTick;
    this.reward = reward;
  }

  toString(): string {
    const tokenStr = this.hasToken ? 'AUTH' : 'NO-AUTH';
    return `APIRequest(id=${this.id}, type=${this.type}, [${tokenStr}])`;
  }
}

export class CacheNodeType extends BaseNode {}
export class EmptyNode extends BaseNode {}
export class LockedNode extends BaseNode {}
export class InfectedNode extends BaseNode {}

// Factory

const NODE_TYPE_MAP: Record<string, new (info: Record<string, unknown>, client: ApiClient, workerId: string) => BaseNode> = {
  hub: HubNode,
  resource: ResourceNode,
  compute: ComputeNode,
  api: APINode,
  cache: CacheNodeType,
  empty: EmptyNode,
  locked: LockedNode,
  infected: InfectedNode,
};

export function createNode(info: Record<string, unknown>, client: ApiClient, workerId: string): BaseNode {
  const nodeType = (info['type'] as string) ?? '';
  const Cls = NODE_TYPE_MAP[nodeType] ?? BaseNode;
  return new Cls(info, client, workerId);
}
