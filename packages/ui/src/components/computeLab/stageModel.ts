/*
 * What the stage draws, derived from frames alone.
 *
 * Every function here is pure and keyed on a frame's semantic `kind` — never on
 * which parser class produced it. `for`, `while`, a comprehension and a
 * repeating construct nobody has written yet all reach the same track, because
 * the only thing consulted is that they emitted `repetition`.
 *
 * The other rule this file exists to hold: the state at step N is computed from
 * an index built once per run, never by replaying steps 1..N-1. A player dragging
 * the timeline to step 900 pays a binary search, not 900 frames.
 */
import type { ComputeLabFrame, ComputeLabRunStatus, ComputeLabSourceLocation } from '../../store/gameStore';

export type Frame = ComputeLabFrame;
export type Location = ComputeLabSourceLocation;

/**
 * One live run of one repeating statement.
 *
 * Not one *loop in the source*: an inner loop is a different instance on every
 * outer iteration, and the count that used to be kept per source location is
 * exactly why a nested `range(3)` could report iteration 87.
 */
export type LoopInstance = {
  id: number;
  source: string;
  location: Location;
  /** How far it will go, when the runner could measure it without running player code. */
  extent?: number;
  /** Frame index of each observed iteration, so iteration N is at `iterations[N - 1]`. */
  iterations: number[];
  exitIndex?: number;
  exitedUnwinding: boolean;
  parentId?: number;
  /** Which iteration of the parent this instance ran inside. */
  parentIteration?: number;
  /** Completed inner instances, recorded on the parent so the outer track keeps a history. */
  innerRuns: { iteration: number; count: number }[];
};

/**
 * The five ways a track ends, and every one of them is derivable from `kind`
 * plus the run's own terminal status.
 *
 * `early` is the one that is easy to get wrong: `block_exit` is emitted as a
 * statement *after* the loop, so a `break` reaches it and a `return` does not. A
 * loop the player returned out of is over, not still going and not truncated.
 */
export type TrackEnd = 'finished' | 'early' | 'running' | 'cut' | 'broke';

export type LoopIndex = {
  instances: LoopInstance[];
  byId: Map<number, LoopInstance>;
};

function locationOf(frame: Frame): Location | undefined {
  return frame.location;
}

/** Build the whole run's loop geometry in one pass. Called once per trace, not per step. */
export function indexLoops(frames: readonly Frame[]): LoopIndex {
  const byId = new Map<number, LoopInstance>();
  const instances: LoopInstance[] = [];
  const open: LoopInstance[] = [];
  frames.forEach((frame, index) => {
    const detail = frame.detail;
    const id = detail?.loop;
    if (typeof id !== 'number') return;
    if (frame.kind === 'repetition') {
      let instance = byId.get(id);
      if (!instance) {
        const parent = open[open.length - 1];
        instance = {
          id,
          source: frame.source || '',
          location: locationOf(frame) as Location,
          iterations: [],
          exitedUnwinding: false,
          parentId: parent?.id,
          parentIteration: parent?.iterations.length,
          innerRuns: [],
        };
        byId.set(id, instance);
        instances.push(instance);
        open.push(instance);
      }
      instance.iterations.push(index);
      if (typeof detail?.extent === 'number') instance.extent = detail.extent;
      return;
    }
    if (frame.kind !== 'block_exit') return;
    const instance = byId.get(id);
    if (!instance) return;
    instance.exitIndex = index;
    instance.exitedUnwinding = detail?.error !== undefined;
    const position = open.indexOf(instance);
    if (position >= 0) open.splice(position, 1);
    const parent = instance.parentId === undefined ? undefined : byId.get(instance.parentId);
    if (parent && instance.parentIteration !== undefined)
      parent.innerRuns.push({ iteration: instance.parentIteration, count: instance.iterations.length });
  });
  return { instances, byId };
}

/**
 * The chain of tracks to draw at this step: outermost first, current innermost last.
 *
 * A loop stays on screen after it exits, because "it finished" and "we stopped
 * watching" are facts the player reads *at the end*, and a track that vanished
 * on exit could never show either.
 */
export function visibleLoops(index: LoopIndex, frameIndex: number): LoopInstance[] {
  let current: LoopInstance | undefined;
  for (const instance of index.instances) {
    if (instance.iterations[0] > frameIndex) continue;
    current = instance;
  }
  const chain: LoopInstance[] = [];
  let walk = current;
  const guard = new Set<number>();
  while (walk && !guard.has(walk.id)) {
    guard.add(walk.id);
    chain.unshift(walk);
    walk = walk.parentId === undefined ? undefined : index.byId.get(walk.parentId);
  }
  return chain;
}

/** Which iteration of this instance the run is on at `frameIndex`. Binary search, not a walk. */
export function iterationAt(instance: LoopInstance, frameIndex: number): number {
  let low = 0;
  let high = instance.iterations.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (instance.iterations[middle] <= frameIndex) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function trackEnd(instance: LoopInstance, status: ComputeLabRunStatus | undefined, terminal: boolean): TrackEnd {
  if (instance.exitedUnwinding) return 'broke';
  if (instance.exitIndex !== undefined) {
    // Closed. A `while` has no extent to fall short of, so reaching its own exit
    // *is* finishing; a counted loop that stopped short was left by a `break`.
    if (instance.extent === undefined) return 'finished';
    return instance.iterations.length >= instance.extent ? 'finished' : 'early';
  }
  // Never closed. Observation stopping and the program stopping are different
  // facts and must not share a shape.
  if (status === 'limit' || status === 'timeout' || status === 'disconnected') return 'cut';
  if (status === 'runtime') return 'broke';
  if (!terminal) return 'running';
  // Terminal, never closed, and observation did not stop: the loop was left from
  // the inside, by a `return`. Over — not still going, and not truncated either.
  return 'early';
}

// ── the player's own source, sliced by the runner's byte ranges ─────────────

/**
 * CPython reports UTF-8 byte offsets; JavaScript slices UTF-16 code units.
 * Returns the absolute index into `source`, or null when the range does not fit
 * the draft on screen — which is what happens to a trace the player has since
 * edited past.
 */
function charIndex(lines: readonly string[], lineno: number, byteColumn: number): number | null {
  const line = lines[lineno - 1];
  if (line === undefined) return null;
  let bytes = 0;
  let codeUnits = 0;
  for (const character of line) {
    if (bytes >= byteColumn) break;
    bytes += new TextEncoder().encode(character).length;
    codeUnits += character.length;
  }
  if (bytes !== byteColumn) return null;
  let offset = 0;
  for (let position = 0; position < lineno - 1; position++) offset += lines[position].length + 1;
  return offset + codeUnits;
}

export function sourceRange(source: string, location: Location): { start: number; end: number } | null {
  const lines = source.split('\n');
  const start = charIndex(lines, location.lineno, location.col_offset);
  const end = charIndex(lines, location.end_lineno, location.end_col_offset);
  return start === null || end === null || end < start ? null : { start, end };
}

export function containsLocation(outer: Location, inner: Location) {
  const startsBefore =
    outer.lineno < inner.lineno || (outer.lineno === inner.lineno && outer.col_offset <= inner.col_offset);
  const endsAfter =
    outer.end_lineno > inner.end_lineno ||
    (outer.end_lineno === inner.end_lineno && outer.end_col_offset >= inner.end_col_offset);
  return startsBefore && endsAfter;
}

/**
 * How far ahead to look for the statement enclosing the current step.
 *
 * One statement's sub-expressions are adjacent in the stream, so the enclosing
 * frame is always a few steps away; the bound only stops a step with no
 * enclosing statement from scanning the rest of a 1,200-frame run.
 */
const ENCLOSING_SCAN = 64;

export type ReductionSegment = { text: string; reduced: boolean };
export type Reduction = { before: string; segments: ReductionSegment[]; after: string };

/**
 * The current expression, reduced in place.
 *
 * The runner already emits one `value` frame per evaluated sub-expression, each
 * carrying its own source range, so this needs nothing new on the wire: replace
 * each range that has already produced a value with the value it produced, and
 * the player watches their own line collapse inside-out to the thing that
 * decided it.
 *
 * The enclosing statement is found by containment, never by asking what kind of
 * statement it is — the frames of one statement nest, and the first frame that
 * does not contain the previous one belongs to the next statement.
 */
export function reduceExpression(
  frames: readonly Frame[],
  frameIndex: number,
  source: string,
  format: (value: unknown) => string,
): Reduction | null {
  const current = frames[frameIndex];
  const currentLocation = locationOf(current);
  if (!currentLocation) return null;

  // The enclosing statement, found by containment alone — never by asking what
  // kind of statement it is.
  //
  // A candidate encloses the current step when it contains that step *and*
  // everything evaluated between the two, which is what separates a real
  // enclosing expression from the next statement along. Frames that neither
  // contain nor are contained are skipped rather than ending the search:
  // `index < len(nums)` and `nums[index] >= 0` are siblings under one `and`, and
  // stopping at the first sibling would leave the `and` itself never found.
  let anchorIndex = frameIndex;
  for (let position = frameIndex + 1; position < Math.min(frames.length, frameIndex + ENCLOSING_SCAN); position++) {
    const candidate = locationOf(frames[position]);
    if (!candidate) break;
    if (!containsLocation(candidate, locationOf(frames[anchorIndex]) as Location)) continue;
    let enclosesEverythingBetween = true;
    for (let between = anchorIndex + 1; between < position && enclosesEverythingBetween; between++) {
      const middle = locationOf(frames[between]);
      if (!middle || !containsLocation(candidate, middle)) enclosesEverythingBetween = false;
    }
    if (enclosesEverythingBetween) anchorIndex = position;
  }
  const anchor = frames[anchorIndex];
  const anchorLocation = locationOf(anchor) as Location;
  let start = anchorIndex;
  while (start > 0) {
    const previous = locationOf(frames[start - 1]);
    if (!previous || !containsLocation(anchorLocation, previous)) break;
    start--;
  }

  const range = sourceRange(source, anchorLocation);
  if (!range) return null;
  const applied: { start: number; end: number; text: string }[] = [];
  for (let position = start; position <= frameIndex; position++) {
    const frame = frames[position];
    if (frame.kind !== 'value' || !Object.prototype.hasOwnProperty.call(frame, 'value')) continue;
    const where = locationOf(frame);
    if (!where) continue;
    const bounds = sourceRange(source, where);
    if (!bounds || bounds.start < range.start || bounds.end > range.end) continue;
    // A sub-expression standing alone does not replace itself. Reduction shows a
    // value *in the place it came from*, so when there is no enclosing statement
    // on screen the player keeps the expression they wrote — the value is beside
    // it, and swapping the two would leave nothing to have reduced.
    const wholeAnchor = bounds.start === range.start && bounds.end === range.end;
    if (wholeAnchor && position === anchorIndex) continue;
    applied.push({ ...bounds, text: format(frame.value) });
  }
  // Outermost wins: once `total == a + b` has reduced to True, the `a + b`
  // inside it is no longer on screen to reduce.
  applied.sort((left, right) => left.start - right.start || right.end - left.end);

  const segments: ReductionSegment[] = [];
  let cursor = range.start;
  for (const substitution of applied) {
    if (substitution.start < cursor) continue;
    if (substitution.start > cursor) segments.push({ text: source.slice(cursor, substitution.start), reduced: false });
    segments.push({ text: substitution.text, reduced: true });
    cursor = substitution.end;
  }
  if (cursor < range.end) segments.push({ text: source.slice(cursor, range.end), reduced: false });
  if (segments.length === 0) segments.push({ text: source.slice(range.start, range.end), reduced: false });

  const lineStart = source.lastIndexOf('\n', range.start - 1) + 1;
  const lineEnd = source.indexOf('\n', range.end);
  return {
    before: source.slice(lineStart, range.start),
    segments,
    after: source.slice(range.end, lineEnd === -1 ? source.length : lineEnd),
  };
}

export type AssignmentTransfer = {
  source: string;
  evaluationSource: string;
  evaluatedValue: string;
  references: { name: string; value: string }[];
  targets: { name: string; value: string; previousValue?: string }[];
};

/**
 * Build the assignment animation protocol only from semantic trace evidence.
 *
 * The binding frame identifies destinations and final values. The closest
 * preceding contained `value` frame identifies the RHS range and evaluated
 * value. Exact identifier spans inside that range may point back to variable
 * rectangles that were observed before the binding. Missing any of those facts
 * returns null, leaving the ordinary static trace untouched.
 */
export function assignmentTransferAt(
  frames: readonly Frame[],
  frameIndex: number,
  source: string,
  format: (value: unknown) => string,
): AssignmentTransfer | null {
  const binding = frames[frameIndex];
  if (!binding || binding.kind !== 'binding' || !binding.location) return null;
  const rawBindings = binding.detail?.bindings;
  if (!rawBindings || typeof rawBindings !== 'object' || Array.isArray(rawBindings)) return null;
  const heldBefore = frames[frameIndex - 1]?.locals || {};
  const targets = Object.entries(rawBindings as Record<string, unknown>).map(([name, value]) => ({
    name,
    value: format(value),
    ...(Object.prototype.hasOwnProperty.call(heldBefore, name) ? { previousValue: format(heldBefore[name]) } : {}),
  }));
  if (targets.length === 0) return null;

  let evaluation: Frame | undefined;
  for (let position = frameIndex - 1; position >= Math.max(0, frameIndex - ENCLOSING_SCAN); position--) {
    const candidate = frames[position];
    if (!candidate.location) break;
    if (!containsLocation(binding.location, candidate.location)) break;
    if (!evaluation && candidate.kind === 'value' && Object.prototype.hasOwnProperty.call(candidate, 'value'))
      evaluation = candidate;
  }
  if (!evaluation?.location || !Object.prototype.hasOwnProperty.call(evaluation, 'value')) return null;
  const evaluationRange = sourceRange(source, evaluation.location);
  if (!evaluationRange) return null;
  const evaluationSource = source.slice(evaluationRange.start, evaluationRange.end);
  if (!evaluationSource.trim()) return null;

  // A reference is semantic only when the runner identifies a Name load and
  // gives its exact source span. Text scanning cannot distinguish `a = b` from
  // `a = "b"`, a comment, or future syntax with identifier-looking content.
  const referenceEvidence = evaluation.detail?.references;
  if (!Array.isArray(referenceEvidence)) return null;
  const references: { name: string; value: string }[] = [];
  const seen = new Set<string>();
  for (const evidence of referenceEvidence) {
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) continue;
    const name = (evidence as Record<string, unknown>).name;
    const location = (evidence as Record<string, unknown>).location;
    if (typeof name !== 'string' || !location || typeof location !== 'object' || Array.isArray(location)) continue;
    const bounds = sourceRange(source, location as Location);
    if (!bounds || !containsLocation(evaluation.location, location as Location)) continue;
    if (source.slice(bounds.start, bounds.end) !== name) continue;
    if (seen.has(name) || !Object.prototype.hasOwnProperty.call(heldBefore, name)) continue;
    seen.add(name);
    references.push({ name, value: format(heldBefore[name]) });
  }
  return {
    source: binding.source || evaluationSource,
    evaluationSource,
    evaluatedValue: format(evaluation.value),
    references,
    targets,
  };
}

// ── values, in the language the player wrote them in ───────────────────────

export type TruncationMarker = { truncated: true; reason?: string; type?: string };

export function truncationOf(value: unknown): TruncationMarker | null {
  return typeof value === 'object' && value !== null && (value as TruncationMarker).truncated === true
    ? (value as TruncationMarker)
    : null;
}

/**
 * A value spelled the way the player would type it.
 *
 * The wire is JSON, so a Python `True` arrives as `true` and `None` as `null`.
 * Showing the player the transport's spelling of their own value is the same
 * mistake as showing them a parser class name.
 */
export function pythonValue(value: unknown, truncatedWord: string): string {
  if (truncationOf(value)) return truncatedWord;
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) return `[${value.map(item => pythonValue(item, truncatedWord)).join(', ')}]`;
  if (typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `'${key}': ${pythonValue(item, truncatedWord)}`)
      .join(', ')}}`;
  return String(value);
}

// ── the variable boxes ─────────────────────────────────────────────────────

export type VariableBox = {
  name: string;
  value: string;
  type?: string;
  changed: boolean;
  truncated: boolean;
};

/**
 * Most-recently-changed first, then the order the player's own frame reports.
 *
 * Recency is read from a bounded window of preceding frames rather than an index
 * over the whole run: the window is what "recently" means to a reader, and it
 * keeps the cost of drawing step 900 independent of there being 900 steps.
 */
export function orderedVariables(
  frames: readonly Frame[],
  frameIndex: number,
  truncatedWord: string,
  window = 300,
): VariableBox[] {
  const frame = frames[frameIndex];
  if (!frame) return [];
  const held = frame.locals || {};
  const types = frame.types || {};
  const changed = new Set(frame.changed || []);
  const recency = new Map<string, number>();
  for (let position = frameIndex; position >= Math.max(0, frameIndex - window); position--)
    for (const name of frames[position].changed || []) if (!recency.has(name)) recency.set(name, position);
  const names = Object.keys(held);
  return names
    .map((name, position) => ({ name, position }))
    .sort((left, right) => {
      const leftSeen = recency.get(left.name);
      const rightSeen = recency.get(right.name);
      if (leftSeen !== rightSeen) return (rightSeen ?? -1) - (leftSeen ?? -1);
      return left.position - right.position;
    })
    .map(({ name }) => ({
      name,
      value: pythonValue(held[name], truncatedWord),
      type: types[name],
      changed: changed.has(name),
      truncated: truncationOf(held[name]) !== null,
    }));
}
