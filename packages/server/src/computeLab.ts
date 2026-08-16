import { randomUUID } from 'crypto';
import { broadcast } from './websocket.js';

export const TRACE_LIMITS = { maxEvents: 1200, maxValueDepth: 4, maxValueBytes: 4096, timeoutMs: 2000 };

export type SourceLocation = {
  lineno: number;
  col_offset: number;
  end_lineno: number;
  end_col_offset: number;
};

type ComputeLabFrameBase = {
  sequence: number;
  line?: number;
  locals?: Record<string, unknown>;
  changed?: string[];
};

type TargetBindings = Record<string, unknown>;

type ComputeLabControl = {
  node_type: 'For' | 'While' | 'If' | string;
  location: SourceLocation;
} & (
  | { event: 'enter' | 'exit' }
  | { event: 'iteration'; iteration: number; target?: string; targetBindings?: TargetBindings }
  | { event: 'test'; test: boolean }
  | { event: 'branch'; branch: 'body' | 'else' | 'none' }
);

export type ComputeLabFrame = ComputeLabFrameBase &
  (
    | { phase: 'line' }
    | {
        phase: 'eval';
        expression: { node_type: string; source: string; location: SourceLocation; value: unknown };
      }
    | {
        phase: 'control';
        control: ComputeLabControl;
      }
    | { phase: 'return'; value: unknown }
    | { phase: 'error' | 'limit'; error: { message: string; line?: number; kind?: string } }
  );

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

type FrameAcceptance =
  | { ok: true; run: ComputeLabRun }
  | { ok: false; reason: 'stale_execution' }
  | { ok: false; reason: 'invalid_trace_frame'; run: ComputeLabRun };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown, minimum = 0): value is number {
  return Number.isInteger(value) && (value as number) >= minimum;
}

function normalizeLocation(value: unknown): SourceLocation | undefined {
  if (!isRecord(value)) return undefined;
  const { lineno, col_offset, end_lineno, end_col_offset } = value;
  if (
    !isInteger(lineno, 1) ||
    !isInteger(col_offset) ||
    !isInteger(end_lineno, 1) ||
    !isInteger(end_col_offset) ||
    end_lineno < lineno ||
    (end_lineno === lineno && end_col_offset < col_offset)
  )
    return undefined;
  return { lineno, col_offset, end_lineno, end_col_offset };
}

function normalizeFrameBase(value: Record<string, unknown>): ComputeLabFrameBase | undefined {
  if (!isInteger(value.sequence)) return undefined;
  if (value.line !== undefined && !isInteger(value.line, 1)) return undefined;
  if (value.locals !== undefined && !isRecord(value.locals)) return undefined;
  if (
    value.changed !== undefined &&
    (!Array.isArray(value.changed) || !value.changed.every(item => typeof item === 'string'))
  )
    return undefined;
  return {
    sequence: value.sequence,
    ...(value.line === undefined ? {} : { line: value.line }),
    ...(value.locals === undefined ? {} : { locals: value.locals }),
    ...(value.changed === undefined ? {} : { changed: value.changed }),
  };
}

/** Validate and copy the runner-owned payload before it enters replay state or WebSocket output. */
export function normalizeComputeLabFrame(value: unknown): ComputeLabFrame | undefined {
  if (!isRecord(value) || typeof value.phase !== 'string') return undefined;
  const base = normalizeFrameBase(value);
  if (!base) return undefined;

  switch (value.phase) {
    case 'line':
      return { ...base, phase: 'line' };
    case 'eval': {
      if (!isRecord(value.expression)) return undefined;
      const { node_type, source, location } = value.expression;
      const normalizedLocation = normalizeLocation(location);
      if (typeof node_type !== 'string' || !node_type || typeof source !== 'string' || !normalizedLocation)
        return undefined;
      if (!Object.prototype.hasOwnProperty.call(value.expression, 'value')) return undefined;
      return {
        ...base,
        phase: 'eval',
        expression: { node_type, source, location: normalizedLocation, value: value.expression.value },
      };
    }
    case 'control': {
      if (!isRecord(value.control)) return undefined;
      const { node_type, location, event, iteration, test, branch, target, targetBindings } = value.control;
      const normalizedLocation = normalizeLocation(location);
      if (typeof node_type !== 'string' || !node_type || !normalizedLocation) return undefined;
      const details = { node_type, location: normalizedLocation };
      if (event === 'enter' || event === 'exit') {
        if ([iteration, test, branch, target, targetBindings].some(item => item !== undefined)) return undefined;
        return { ...base, phase: 'control', control: { ...details, event } };
      }
      if (event === 'iteration') {
        if (
          !isInteger(iteration, 1) ||
          (node_type === 'For' && !isRecord(targetBindings)) ||
          (node_type !== 'For' && target !== undefined) ||
          (targetBindings !== undefined && !isRecord(targetBindings)) ||
          (target !== undefined && typeof target !== 'string') ||
          test !== undefined ||
          branch !== undefined
        )
          return undefined;
        return {
          ...base,
          phase: 'control',
          control: {
            ...details,
            event,
            iteration,
            ...(targetBindings === undefined ? {} : { targetBindings: targetBindings as TargetBindings }),
            ...(target === undefined ? {} : { target }),
          },
        };
      }
      if (event === 'test') {
        if (typeof test !== 'boolean' || [iteration, branch, target, targetBindings].some(item => item !== undefined))
          return undefined;
        return { ...base, phase: 'control', control: { ...details, event, test } };
      }
      if (event === 'branch') {
        if (
          !['body', 'else', 'none'].includes(String(branch)) ||
          [iteration, test, target, targetBindings].some(item => item !== undefined)
        )
          return undefined;
        return {
          ...base,
          phase: 'control',
          control: { ...details, event, branch: branch as 'body' | 'else' | 'none' },
        };
      }
      return undefined;
    }
    case 'return':
      if (!Object.prototype.hasOwnProperty.call(value, 'value')) return undefined;
      return { ...base, phase: 'return', value: value.value };
    case 'error':
    case 'limit': {
      if (!isRecord(value.error) || typeof value.error.message !== 'string') return undefined;
      const { message, line, kind } = value.error;
      if ((line !== undefined && !isInteger(line, 1)) || (kind !== undefined && typeof kind !== 'string'))
        return undefined;
      return {
        ...base,
        phase: value.phase,
        error: {
          message,
          ...(line === undefined ? {} : { line }),
          ...(kind === undefined ? {} : { kind }),
        },
      };
    }
    default:
      return undefined;
  }
}

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

function rejectInvalidFrame(run: ComputeLabRun): FrameAcceptance {
  run.frames.push({
    sequence: run.frames.length,
    phase: 'error',
    error: { message: 'Unsupported trace frame received', kind: 'invalid_trace_frame' },
  });
  run.status = 'runtime';
  run.updatedAt = Date.now();
  publish(run);
  return { ok: false, reason: 'invalid_trace_frame', run };
}

export function acceptComputeLabFrame(runId: string, input: unknown, userId?: string): FrameAcceptance {
  const run = getComputeLabRun(runId, userId);
  if (!run || ['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected'].includes(run.status))
    return { ok: false, reason: 'stale_execution' };
  const frame = normalizeComputeLabFrame(input);
  if (!frame) return rejectInvalidFrame(run);
  if (frame.sequence !== run.frames.length) return { ok: false, reason: 'stale_execution' };
  if (run.frames.length >= TRACE_LIMITS.maxEvents) {
    run.status = 'limit';
    run.updatedAt = Date.now();
    publish(run);
    return { ok: true, run };
  }
  run.status = 'running';
  run.frames.push(frame);
  run.updatedAt = Date.now();
  publish(run);
  return { ok: true, run };
}

export function finishComputeLabRun(
  runId: string,
  result: { status: ComputeLabRun['status']; returnValue?: unknown; frame?: unknown },
  userId?: string,
): FrameAcceptance {
  const run = getComputeLabRun(runId, userId);
  if (!run || ['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected'].includes(run.status))
    return { ok: false, reason: 'stale_execution' };
  if (result.frame !== undefined) {
    const frame = normalizeComputeLabFrame(result.frame);
    if (!frame) return rejectInvalidFrame(run);
    const expectedPhase = result.status === 'limit' ? 'limit' : 'error';
    if (frame.sequence !== run.frames.length || frame.phase !== expectedPhase || !('error' in frame) || !frame.error)
      return rejectInvalidFrame(run);
    // A single terminal status marker is not a replayable execution event, so it
    // remains visible after maxEvents without permitting additional trace steps.
    run.frames.push(frame);
  }
  run.status = result.status;
  run.returnValue = result.returnValue;
  run.updatedAt = Date.now();
  publish(run);
  return { ok: true, run };
}
