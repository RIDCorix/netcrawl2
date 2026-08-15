import { randomUUID } from 'crypto';
import { broadcast } from './websocket.js';

export const TRACE_LIMITS = { maxEvents: 300, maxValueDepth: 4, maxValueBytes: 4096, timeoutMs: 2000 };

export type ComputeLabFrame = {
  sequence: number;
  phase: 'line' | 'eval' | 'return' | 'error' | 'limit';
  line?: number;
  locals?: Record<string, unknown>;
  changed?: string[];
  expression?: { source: string; value: unknown };
  value?: unknown;
  error?: { message: string; line?: number; kind?: string };
};

export type ComputeLabRun = {
  id: string;
  userId?: string;
  nodeId: string;
  taskId: string;
  revision: number;
  source: string;
  sessionId: string;
  status: 'queued' | 'running' | 'trace_ready' | 'syntax' | 'runtime' | 'timeout' | 'limit' | 'disconnected';
  frames: ComputeLabFrame[];
  returnValue?: unknown;
  createdAt: number;
  updatedAt: number;
};

const runs = new Map<string, ComputeLabRun>();

function publish(run: ComputeLabRun) {
  broadcast({ type: 'COMPUTE_LAB_RUN', payload: publicRun(run) }, run.userId);
}

export function publicRun(run: ComputeLabRun) {
  const { source: _source, sessionId: _sessionId, ...safe } = run;
  return safe;
}

export function createComputeLabRun(
  input: Omit<ComputeLabRun, 'id' | 'status' | 'frames' | 'createdAt' | 'updatedAt'>,
) {
  const now = Date.now();
  const run: ComputeLabRun = {
    ...input,
    id: randomUUID(),
    status: 'queued',
    frames: [],
    createdAt: now,
    updatedAt: now,
  };
  runs.set(run.id, run);
  publish(run);
  return run;
}

export function getComputeLabRun(runId: string, userId?: string) {
  const run = runs.get(runId);
  if (!run || run.userId !== userId) return undefined;
  if (
    (run.status === 'queued' || run.status === 'running') &&
    Date.now() - run.updatedAt > TRACE_LIMITS.timeoutMs + 15_000
  ) {
    run.status = 'disconnected';
    run.updatedAt = Date.now();
    publish(run);
  }
  return run;
}

export function acceptComputeLabFrame(runId: string, frame: ComputeLabFrame, userId?: string) {
  const run = getComputeLabRun(runId, userId);
  if (!run || ['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected'].includes(run.status))
    return undefined;
  if (!Number.isInteger(frame.sequence) || frame.sequence !== run.frames.length) return undefined;
  if (run.frames.length >= TRACE_LIMITS.maxEvents) {
    run.status = 'limit';
    run.updatedAt = Date.now();
    publish(run);
    return run;
  }
  run.status = 'running';
  run.frames.push(frame);
  run.updatedAt = Date.now();
  publish(run);
  return run;
}

export function finishComputeLabRun(
  runId: string,
  result: { status: ComputeLabRun['status']; returnValue?: unknown; frame?: ComputeLabFrame },
  userId?: string,
) {
  const run = getComputeLabRun(runId, userId);
  if (!run || ['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected'].includes(run.status))
    return undefined;
  if (result.frame) {
    const expectedPhase = result.status === 'limit' ? 'limit' : 'error';
    if (result.frame.sequence !== run.frames.length || result.frame.phase !== expectedPhase || !result.frame.error)
      return undefined;
    // A single terminal status marker is not a replayable execution event, so it
    // remains visible after maxEvents without permitting additional trace steps.
    run.frames.push(result.frame);
  }
  run.status = result.status;
  run.returnValue = result.returnValue;
  run.updatedAt = Date.now();
  publish(run);
  return run;
}
