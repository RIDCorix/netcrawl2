import { randomUUID } from 'crypto';
import { broadcast } from './websocket.js';

export const TRACE_LIMITS = { maxEvents: 1200, maxValueDepth: 4, maxValueBytes: 4096, timeoutMs: 2000 };

export type SourceLocation = {
  lineno: number;
  col_offset: number;
  end_lineno: number;
  end_col_offset: number;
};

/**
 * One execution step, as the player is shown it.
 *
 * `kind` says what execution *did* — it is never a parser class name, and it is
 * deliberately typed open. A runner that reports a step this build has never
 * heard of must still reach the screen Located, Named and Valued, because the
 * alternative is that a construct nobody anticipated silently kills the run.
 * What is *not* open is the shape: an unknown property, a malformed location or
 * an error payload on a non-terminal step still fails the frame closed.
 */
export const TERMINAL_FRAME_KINDS = ['error', 'limit'] as const;

/**
 * One call the run is inside, outermost first.
 *
 * `count` folds adjacent identical calls — recursion is otherwise a wall of the
 * same line — and a `hidden` entry stands for the calls between the outermost
 * and the innermost that were left out, so the player is never shown a depth
 * they have to scroll.
 */
export type CallStackEntry = { source: string; line?: number; count?: number } | { hidden: number };

/**
 * A transport guard, not the presentation choice.
 *
 * The runner collapses to far fewer than this before it sends anything; this
 * only stops an unbounded array from entering replay state. Deliberately far
 * above the runner's own cap so that a runner which chooses to show more is
 * *unfamiliar* rather than *malformed* — a version skew must not cost the player
 * their whole run.
 */
export const MAX_CALL_STACK_ENTRIES = 64;

export type ComputeLabFrame = {
  sequence: number;
  kind: string;
  line?: number;
  source?: string;
  location?: SourceLocation;
  locals?: Record<string, unknown>;
  changed?: string[];
  stack?: CallStackEntry[];
  detail?: Record<string, unknown>;
  value?: unknown;
  error?: { message: string; line?: number; kind?: string };
};

const FRAME_PROPERTIES = new Set([
  'sequence',
  'kind',
  'line',
  'source',
  'location',
  'locals',
  'changed',
  'stack',
  'detail',
  'value',
  'error',
]);

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

/**
 * The call chain is shape, not payload, so it fails closed like a location does.
 *
 * A stack the screen cannot read is worse than no stack: it would render the
 * outermost and innermost of something that is not a stack. Length and bytes are
 * bounded separately from the shape — an over-long chain is not malformed, so it
 * collapses to a count rather than costing the player the frame.
 */
function normalizeCallStack(value: unknown): CallStackEntry[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CALL_STACK_ENTRIES) return undefined;
  const entries: CallStackEntry[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    if (typeof item.source === 'string' && item.source) {
      if (!Object.keys(item).every(key => ['source', 'line', 'count'].includes(key))) return undefined;
      if (item.line !== undefined && !isInteger(item.line, 1)) return undefined;
      if (item.count !== undefined && !isInteger(item.count, 2)) return undefined;
      entries.push({
        source: item.source,
        ...(item.line === undefined ? {} : { line: item.line as number }),
        ...(item.count === undefined ? {} : { count: item.count as number }),
      });
      continue;
    }
    if (Object.keys(item).length !== 1 || !isInteger(item.hidden, 1)) return undefined;
    entries.push({ hidden: item.hidden as number });
  }
  // Every entry quotes a line of the player's own file, so a chain is several
  // times the size of the one segment the frame already carries. Over budget, it
  // becomes the one fact that still fits: how deep the run was.
  return Buffer.byteLength(JSON.stringify(entries), 'utf8') <= TRACE_LIMITS.maxValueBytes
    ? entries
    : [
        {
          hidden: entries.reduce((total, entry) => total + ('hidden' in entry ? entry.hidden : (entry.count ?? 1)), 0),
        },
      ];
}

/**
 * Replace an oversized open payload rather than failing the run.
 *
 * `value`, `detail` and `locals` carry whatever the player's own data happens to
 * be, so their size is not a protocol error and must not cost the player their
 * whole trace. The runner already bounds depth and width; this bounds bytes,
 * which is the limit `TRACE_LIMITS.maxValueBytes` has always declared.
 */
function withinValueBudget<T>(value: T): T | { truncated: true; reason: 'max_bytes' } {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? '';
  } catch {
    return { truncated: true, reason: 'max_bytes' };
  }
  return Buffer.byteLength(serialized, 'utf8') <= TRACE_LIMITS.maxValueBytes
    ? value
    : { truncated: true, reason: 'max_bytes' };
}

/** Validate and copy the runner-owned payload before it enters replay state or WebSocket output. */
export function normalizeComputeLabFrame(value: unknown): ComputeLabFrame | undefined {
  if (!isRecord(value)) return undefined;
  if (!Object.keys(value).every(key => FRAME_PROPERTIES.has(key))) return undefined;
  if (!isInteger(value.sequence)) return undefined;
  if (typeof value.kind !== 'string' || !value.kind) return undefined;
  if (value.line !== undefined && !isInteger(value.line, 1)) return undefined;
  if (value.locals !== undefined && !isRecord(value.locals)) return undefined;
  if (value.detail !== undefined && !isRecord(value.detail)) return undefined;
  if (
    value.changed !== undefined &&
    (!Array.isArray(value.changed) || !value.changed.every(item => typeof item === 'string'))
  )
    return undefined;
  const stack = value.stack === undefined ? undefined : normalizeCallStack(value.stack);
  if (value.stack !== undefined && !stack) return undefined;

  // A step is Located or it is not; a source segment with no range cannot be
  // highlighted in the player's editor, and a range with no segment cannot be
  // shown when the draft has moved on.
  const location = value.location === undefined ? undefined : normalizeLocation(value.location);
  if (value.location !== undefined && !location) return undefined;
  if (typeof value.source !== 'string' && value.source !== undefined) return undefined;
  if ((value.source === undefined) !== (location === undefined)) return undefined;

  const terminal = (TERMINAL_FRAME_KINDS as readonly string[]).includes(value.kind);
  if (terminal) {
    if (!isRecord(value.error) || typeof value.error.message !== 'string') return undefined;
    const { line, kind } = value.error;
    if ((line !== undefined && !isInteger(line, 1)) || (kind !== undefined && typeof kind !== 'string'))
      return undefined;
  } else if (value.error !== undefined) return undefined;

  return {
    sequence: value.sequence,
    kind: value.kind,
    ...(value.line === undefined ? {} : { line: value.line }),
    ...(location === undefined ? {} : { source: value.source as string, location }),
    // Per variable, not per snapshot: one oversized list must not blank out every
    // other value the player was holding at that step.
    ...(value.locals === undefined
      ? {}
      : {
          locals: Object.fromEntries(
            Object.entries(value.locals).map(([name, held]) => [name, withinValueBudget(held)]),
          ),
        }),
    ...(value.changed === undefined ? {} : { changed: value.changed }),
    ...(stack === undefined ? {} : { stack }),
    ...(value.detail === undefined ? {} : { detail: withinValueBudget(value.detail) as Record<string, unknown> }),
    ...(Object.prototype.hasOwnProperty.call(value, 'value') ? { value: withinValueBudget(value.value) } : {}),
    ...(terminal
      ? {
          error: {
            message: (value.error as Record<string, unknown>).message as string,
            ...((value.error as Record<string, unknown>).line === undefined
              ? {}
              : { line: (value.error as Record<string, unknown>).line as number }),
            ...((value.error as Record<string, unknown>).kind === undefined
              ? {}
              : { kind: (value.error as Record<string, unknown>).kind as string }),
          },
        }
      : {}),
  };
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
    kind: 'error',
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
  if ((TERMINAL_FRAME_KINDS as readonly string[]).includes(frame.kind)) return rejectInvalidFrame(run);
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
  const frame = result.frame === undefined ? undefined : normalizeComputeLabFrame(result.frame);
  if (result.frame !== undefined && !frame) return rejectInvalidFrame(run);
  const expectedKind =
    result.status === 'syntax' || result.status === 'runtime'
      ? 'error'
      : result.status === 'limit'
        ? 'limit'
        : undefined;
  if (
    (expectedKind === undefined && frame !== undefined) ||
    (expectedKind !== undefined &&
      (!frame || frame.sequence !== run.frames.length || frame.kind !== expectedKind || !('error' in frame)))
  )
    return rejectInvalidFrame(run);
  if (frame) {
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
