import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { type ComputeLabRunSnapshot, useGameStore } from '../store/gameStore';
import { apiFetch } from '../lib/api';
import { useT } from '../hooks/useT';
import {
  LoopTracks,
  VariableBoxes,
  useAvailableHeight,
  useChurningVariables,
  usePrefersReducedMotion,
} from './computeLab/stage';
import {
  type LoopInstance,
  indexLoops,
  iterationAt,
  orderedVariables,
  pythonValue,
  reduceExpression,
  trackEnd,
  visibleLoops,
} from './computeLab/stageModel';
import { EditorBridgePanel } from './computeLab/EditorBridgePanel';

type Run = ComputeLabRunSnapshot;
type Task = {
  taskId: string;
  description: string;
  params: Record<string, unknown>;
  difficulty: string;
  functionSignature: string;
  starterSource: string;
};
type TraceFrame = Run['frames'][number];
type SourceLocation = NonNullable<TraceFrame['location']>;
type StepCardProps = {
  frame: TraceFrame;
  source: string;
  stale: boolean;
  t: ReturnType<typeof useT>;
};

function sourceExcerpt(source: string, location: SourceLocation) {
  const lines = source.split('\n');
  const startLine = lines[location.lineno - 1];
  const endLine = lines[location.end_lineno - 1];
  if (startLine === undefined || endLine === undefined) return null;

  // CPython reports UTF-8 byte offsets; JavaScript slices UTF-16 code units.
  // Convert each endpoint independently and retain intervening newlines so
  // multiline expressions can be highlighted as one source range.
  const byteColumnToCodeUnit = (line: string, byteColumn: number) => {
    let bytes = 0;
    let codeUnits = 0;
    for (const character of line) {
      if (bytes >= byteColumn) break;
      bytes += new TextEncoder().encode(character).length;
      codeUnits += character.length;
    }
    return bytes === byteColumn ? codeUnits : null;
  };
  const startColumn = byteColumnToCodeUnit(startLine, location.col_offset);
  const endColumn = byteColumnToCodeUnit(endLine, location.end_col_offset);
  if (startColumn === null || endColumn === null) return null;

  const selectedLines = lines.slice(location.lineno - 1, location.end_lineno);
  if (selectedLines.length === 1) {
    return {
      before: startLine.slice(0, startColumn),
      selected: startLine.slice(startColumn, endColumn),
      after: startLine.slice(endColumn),
    };
  }
  selectedLines[0] = selectedLines[0].slice(startColumn);
  selectedLines[selectedLines.length - 1] = selectedLines[selectedLines.length - 1].slice(0, endColumn);
  return {
    before: startLine.slice(0, startColumn),
    selected: selectedLines.join('\n'),
    after: endLine.slice(endColumn),
  };
}

/**
 * The player's own line, with the sub-expressions that have already been
 * evaluated replaced by what they produced.
 *
 * This is the whole of "the expression animates", and it costs nothing on the
 * wire: the runner already emits one `value` frame per evaluated sub-expression,
 * each carrying its own range, so stepping through them reduces the line
 * inside-out in the player's own text until only the value that decided it is
 * left. A trace the draft has moved past reduces nothing and says so.
 */
function StepSource({ frame, source, stale, t }: StepCardProps) {
  if (frame.source === undefined || frame.location === undefined) return null;
  if (stale)
    return (
      <div>
        <small>{t('compute_lab.old_trace')}</small>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{frame.source}</pre>
      </div>
    );
  const excerpt = sourceExcerpt(source, frame.location);
  return excerpt ? (
    <pre style={{ whiteSpace: 'pre-wrap' }}>
      {excerpt.before}
      <mark>{excerpt.selected}</mark>
      {excerpt.after}
    </pre>
  ) : (
    <pre style={{ whiteSpace: 'pre-wrap' }}>{frame.source}</pre>
  );
}

function ReducingExpression({
  frames,
  index,
  source,
  stale,
  t,
}: {
  frames: readonly TraceFrame[];
  index: number;
  source: string;
  stale: boolean;
  t: ReturnType<typeof useT>;
}) {
  const frame = frames[index];
  const reduction = stale
    ? null
    : reduceExpression(frames, index, source, value => pythonValue(value, t('compute_lab.stage.truncated')));
  if (!reduction) return <StepSource frame={frame} source={source} stale={stale} t={t} />;
  return (
    <pre data-testid="compute-lab-expression" style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>
      {reduction.before}
      <mark>
        {reduction.segments.map((segment, position) =>
          segment.reduced ? (
            <strong key={position} style={{ fontStyle: 'normal', textDecoration: 'underline' }}>
              {segment.text}
            </strong>
          ) : (
            <Fragment key={position}>{segment.text}</Fragment>
          ),
        )}
      </mark>
      {reduction.after}
    </pre>
  );
}

/**
 * Translate a semantic word, and say so plainly when there is no translation.
 *
 * This is the only place the screen knows any vocabulary at all. Delete every
 * entry behind it and each card still renders the same structure with the same
 * source, values and locals — only the words get less specific. That property,
 * not a longer table, is what makes a construct nobody anticipated look exactly
 * like one that was.
 */
function word(t: ReturnType<typeof useT>, namespace: string, name: string, fallback: string) {
  const key = `compute_lab.${namespace}.${name}`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

/**
 * Detail values are the runner's data, so a bare one reads as the runner's word:
 * "Went to none" rather than "Went to neither part". Strings pass through the
 * same translate-or-show-plainly rule as every other word on this card, so an
 * unfamiliar one is still shown rather than dropped.
 */
function formatDetail(t: ReturnType<typeof useT>, value: unknown) {
  // Anything that is not one of the runner's own words is one of the player's
  // values, and it is spelled the way they wrote it. `True` is not `true`, and
  // showing them the transport's spelling of their own data is the same mistake
  // as showing them a parser class name.
  return typeof value === 'string'
    ? word(t, 'value', value, value)
    : pythonValue(value, t('compute_lab.stage.truncated'));
}

/**
 * Where in its own calls the run currently is.
 *
 * R-21 #12: the outermost and the innermost are both visible at once, and the
 * middle is a count rather than a list — so recursion 400 deep reads in two
 * lines instead of scrolling past four hundred identical ones. Rendered only
 * when the runner sent a chain, and keyed on nothing but the entry's own shape,
 * so it is not a rendering rule per construct.
 */
function CallStack({ stack, t }: { stack: NonNullable<TraceFrame['stack']>; t: ReturnType<typeof useT> }) {
  const between = stack
    .slice(1, -1)
    .reduce((total, entry) => total + ('hidden' in entry ? entry.hidden : (entry.count ?? 1)), 0);
  const label = (entry: NonNullable<TraceFrame['stack']>[number]) =>
    'hidden' in entry
      ? t('compute_lab.stack.more', { count: entry.hidden })
      : entry.count && entry.count > 1
        ? `${entry.source} ${t('compute_lab.stack.repeat', { count: entry.count })}`
        : entry.source;
  return (
    <div data-testid="compute-lab-call-stack" style={{ color: 'var(--text-muted)', margin: '6px 0' }}>
      <small>{t('compute_lab.stack.title')}</small>
      <div>
        <code>{label(stack[0])}</code>
      </div>
      {between > 0 && <div>{t('compute_lab.stack.more', { count: between })}</div>}
      {stack.length > 1 && (
        <div>
          <code>{label(stack[stack.length - 1])}</code>
        </div>
      )}
    </div>
  );
}

/**
 * Details the stage's geometry has already drawn.
 *
 * `iteration` and `bindings` are the marker and the box attached to it; `loop`
 * and `extent` are how the track knows which instance it is and how long. Naming
 * them again in a list would be the same fact twice, and one of them would be in
 * the runner's spelling rather than the picture's.
 */
const GEOMETRY_DETAILS = new Set(['iteration', 'bindings']);
/**
 * Which loop instance a frame belongs to, and how long that loop is. Both are
 * the track's own bookkeeping and neither is a sentence, so they are never shown
 * as text whether or not a track was drawn.
 */
const TRACK_IDENTITY_DETAILS = new Set(['loop', 'extent']);

/** Whether every name a `bindings` detail carries already has a box of its own on screen. */
function boxesAlreadyHold(frame: TraceFrame, bindings: unknown) {
  if (!bindings || typeof bindings !== 'object') return false;
  const held = frame.locals || {};
  return Object.keys(bindings as Record<string, unknown>).every(name =>
    Object.prototype.hasOwnProperty.call(held, name),
  );
}

/**
 * Whether the picture has already said this detail, so the list does not say it
 * again in the runner's spelling.
 *
 * On a `repetition` the marker owns both — drawn there when the runner sent a
 * loop identity, and kept in the list when it did not, because a runner older
 * than this build draws no track for the fact to live on.
 *
 * Everywhere else `bindings` is an assignment restating its own variable boxes,
 * one line above and in the transport's `{'t': 19701}` dict syntax rather than
 * the box's name / value / type. The boxes are the better rendering of the same
 * fact — but only of the names they actually carry, so the test is that they do
 * rather than that a runner of the right vintage would have made it so. A name
 * with no box (the runner drops a helper the player assigned to a variable) has
 * nowhere else to go and stays in the list.
 */
function detailIsDrawn(frame: TraceFrame, name: string) {
  if (TRACK_IDENTITY_DETAILS.has(name)) return true;
  if (!GEOMETRY_DETAILS.has(name)) return false;
  if (frame.kind === 'repetition') return typeof frame.detail?.loop === 'number';
  return name === 'bindings' && boxesAlreadyHold(frame, frame.detail?.bindings);
}

/**
 * The whole trace. One card, every construct, anticipated or not.
 *
 * The card became the stage's caption rather than surviving beside it — two
 * views of one step is exactly the confusion this phase exists to remove. Its
 * parts did not disappear: the semantic word is here, the source range still
 * drives the highlight, the values landed in the boxes and the geometry, and a
 * construct nobody anticipated still arrives with a word, a highlight and a
 * value, which is the whole of criterion #14.
 */
function StepCard(props: StepCardProps & { frames: readonly TraceFrame[]; index: number }) {
  const { frame, t, frames, index, source, stale } = props;
  const detail = Object.entries(frame.detail || {}).filter(([name]) => !detailIsDrawn(frame, name));
  return (
    <div
      data-testid="compute-lab-step"
      className="compute-lab-card compute-lab-card-current"
      style={{ padding: 10, marginTop: 8, display: 'grid', gap: 4 }}
    >
      <strong
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.06em',
          color: 'var(--accent)',
        }}
      >
        {word(t, 'step', frame.kind, t('compute_lab.step.unknown'))}
        {frame.source === undefined ? '' : ` ${frame.source}`}
      </strong>
      {frame.stack && frame.stack.length > 0 && <CallStack stack={frame.stack} t={t} />}
      <ReducingExpression frames={frames} index={index} source={source} stale={stale} t={t} />
      {Object.prototype.hasOwnProperty.call(frame, 'value') && (
        <div>
          <code style={{ color: 'var(--accent)', fontWeight: 700 }}>
            → {pythonValue(frame.value, t('compute_lab.stage.truncated'))}
          </code>
        </div>
      )}
      {detail.length > 0 && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', margin: '8px 0 0' }}>
          {detail.map(([name, value]) => (
            <Fragment key={name}>
              <dt style={{ color: 'var(--text-muted)' }}>{word(t, 'detail', name, name)}</dt>
              <dd style={{ margin: 0 }}>
                <code>{formatDetail(t, value)}</code>
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * The floor the stage keeps for itself when the words above it would rather have
 * the room.
 *
 * Deliberately only what one track and its end words need, not what a nested
 * pair does: the stage takes whatever the words above it did not want anyway, so
 * a floor set at the nested figure buys nothing and costs the step card — it
 * forces a scroll on the run whose outcome panel runs to four lines, which is
 * exactly the truncated run this issue is about.
 */
const STAGE_MIN_HEIGHT = 264;
/**
 * The room the tracks keep whatever the variable boxes would rather have.
 *
 * A run that ended in an error puts an extra word in every box, which turns one
 * row of boxes into two and pushed the track's end off the bottom — the same
 * defect, reached from the other side of the stage. The boxes already promote
 * whatever changed at this step to the front, so a row that has to scroll still
 * shows the one the player is looking for; a track's end has no such fallback.
 */
const TRACKS_MIN_HEIGHT = 160;

const TERMINAL_STATUSES = ['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected'] as const;
/** A stable empty trace, so the loop index is not rebuilt on every unrelated render. */
const EMPTY_FRAMES: readonly TraceFrame[] = [];

function lastIndexOfKind(frames: readonly TraceFrame[], kind: string) {
  for (let index = frames.length - 1; index >= 0; index--) if (frames[index].kind === kind) return index;
  return -1;
}

/**
 * Where a finished run should open.
 *
 * A run that succeeded is about its answer, so it opens on the return. A run
 * that stopped is about where it stopped — which is the last step that names a
 * piece of the player's code, not the terminal marker that follows it. The
 * marker carries only a status message, and the outcome panel above already
 * says that in words; landing on it would show the player a card with no code
 * in it at the exact moment they need to see where things went wrong.
 */
function landingFrame(frames: readonly TraceFrame[]) {
  const returned = lastIndexOfKind(frames, 'result');
  if (returned >= 0) return returned;
  for (let index = frames.length - 1; index >= 0; index--) if (frames[index].source !== undefined) return index;
  return Math.max(0, frames.length - 1);
}

/**
 * What a stopped run was doing when observation ended.
 *
 * R-21 #7: "the loop finished" and "we stopped watching" must be different
 * sentences, and neither may require the reader to know what 1,200 means.
 */
function lastRepetition(frames: readonly TraceFrame[]) {
  const index = lastIndexOfKind(frames, 'repetition');
  if (index < 0) return undefined;
  const frame = frames[index];
  const iteration = frame.detail?.iteration;
  return { loop: frame.source || '', iteration: typeof iteration === 'number' ? iteration : 0 };
}

/** Focused code workspace. Its only visual model is program state, never map geography. */
export function ComputeLabScreen() {
  const {
    computeLabOpen,
    computeLabSourceNodeId,
    nodes,
    closeComputeLab,
    connected,
    computeLabRuns,
    upsertComputeLabRun,
    editorRunStarted,
    setEditorRunStarted,
  } = useGameStore();
  const t = useT();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sourceNode = nodes.find(node => node.id === computeLabSourceNodeId);
  const available = sourceNode?.type === 'compute' && sourceNode.data.unlocked === true;
  const [task, setTask] = useState<Task | null>(null);
  const [source, setSource] = useState('');
  const [revision, setRevision] = useState(0);
  const [draftNodeId, setDraftNodeId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  // R-21 asked for "a pace the player chooses", and one fixed speed is not a
  // choice: one slow enough to read a step, one fast enough to cross a loop.
  const [pace, setPace] = useState<'read' | 'fast'>('read');
  // Set where the step changes, not derived after it: adjacency is a property of
  // *the move*, and a screen that re-renders for some other reason must not
  // quietly re-arm motion the move had already ruled out.
  const [adjacentStep, setAdjacentStep] = useState(false);
  const [message, setMessage] = useState<{ key: string; vars?: Record<string, string | number> } | null>(null);
  const wasConnected = useRef(connected);
  const run = runId ? (computeLabRuns[runId] as Run | undefined) : undefined;

  useEffect(() => {
    if (!computeLabOpen || !available || !sourceNode) return;
    let cancelled = false;
    const key = `netcrawl-compute-lab:${sourceNode.id}`;
    const saved = localStorage.getItem(key);
    const savedRevision = Number(localStorage.getItem(`${key}:revision`));
    setTask(null);
    setRunId(null);
    setFrameIndex(0);
    setRevision(Number.isSafeInteger(savedRevision) && savedRevision >= 0 ? savedRevision : 0);
    setDraftNodeId(sourceNode.id);
    setSource(saved ?? '');
    closeRef.current?.focus();
    apiFetch('/api/compute-lab/tasks', { method: 'POST', body: JSON.stringify({ nodeId: sourceNode.id }) })
      .then(async response => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok) throw new Error(body.error || 'Unable to load task');
        setTask(body);
        if (saved === null) setSource(body.starterSource);
        setMessage(null);
      })
      .catch(() => {
        if (!cancelled) setMessage({ key: 'compute_lab.task_load_failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [computeLabOpen, available, sourceNode?.id]);

  useEffect(() => {
    if (!sourceNode || !computeLabOpen || draftNodeId !== sourceNode.id) return;
    const key = `netcrawl-compute-lab:${sourceNode.id}`;
    localStorage.setItem(key, source);
    localStorage.setItem(`${key}:revision`, String(revision));
  }, [source, revision, sourceNode?.id, computeLabOpen, draftNodeId]);

  useEffect(() => {
    if (!editorRunStarted || !sourceNode || !task) return;
    if (editorRunStarted.run.nodeId !== sourceNode.id || editorRunStarted.run.taskId !== task.taskId) return;
    setSource(editorRunStarted.source);
    setRevision(editorRunStarted.run.revision);
    setRunId(editorRunStarted.run.id);
    setFrameIndex(0);
    setMessage({ key: 'compute_lab.editor.source_synced' });
    setEditorRunStarted(null);
  }, [editorRunStarted, sourceNode?.id, task?.taskId, setEditorRunStarted]);

  useEffect(() => {
    const reconnected = !wasConnected.current && connected;
    wasConnected.current = connected;
    if (!runId || (run && !reconnected)) return;
    apiFetch(`/api/compute-lab/runs/${runId}`)
      .then(response => response.json())
      .then(body => {
        if (body.run) upsertComputeLabRun(body.run);
      })
      .catch(() => setMessage({ key: 'compute_lab.connection_lost' }));
  }, [connected, run, runId, upsertComputeLabRun]);

  useEffect(() => {
    if (!computeLabOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeComputeLab();
      }
      if (event.key === 'Tab') {
        // The scrubbers are part of the trace, not decoration on it: a
        // keyboard-only player who can reach RUN but not the thing that moves
        // through the run cannot read their own program.
        const items = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [role="slider"]',
          ) || [],
        );
        const current = items.indexOf(document.activeElement as HTMLElement);
        if (items.length) {
          event.preventDefault();
          items[(current + (event.shiftKey ? items.length - 1 : 1)) % items.length].focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [computeLabOpen, closeComputeLab]);

  useEffect(() => {
    if (!run || !(TERMINAL_STATUSES as readonly string[]).includes(run.status)) return;
    // Arriving at a finished run is not a transition the player made, so it cuts.
    setAdjacentStep(false);
    setFrameIndex(landingFrame(run.frames));
  }, [run?.status, run?.frames.length]);

  // Playback is the only thing that produces a run of *adjacent* transitions,
  // which is the only thing the stage animates. It never queues: any seek stops
  // it, so there is no catch-up to sit through.
  const frameCount = run?.frames.length || 0;
  useEffect(() => {
    if (!playing || frameCount === 0) return;
    const timer = setInterval(
      () => {
        setAdjacentStep(true);
        setFrameIndex(current => {
          if (current >= frameCount - 1) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        });
      },
      pace === 'read' ? 700 : 90,
    );
    return () => clearInterval(timer);
  }, [playing, pace, frameCount]);

  const frames = run?.frames || EMPTY_FRAMES;
  // Built once per trace, not once per step: the state at step 900 costs a
  // binary search, never a walk over the 899 steps in front of it.
  const loops = useMemo(() => indexLoops(frames), [frames]);
  const reducedMotion = usePrefersReducedMotion();
  const animated = adjacentStep && !reducedMotion;
  const churning = useChurningVariables(frames, frameIndex);
  const [tracksRef, tracksHeight] = useAvailableHeight();

  if (!computeLabOpen) return null;
  const stale = Boolean(
    run &&
    (!sourceNode || !task || run.nodeId !== sourceNode.id || run.taskId !== task.taskId || run.revision !== revision),
  );
  const frame = run?.frames[frameIndex];
  const frameError = frame?.error;
  const terminal = run && (TERMINAL_STATUSES as readonly string[]).includes(run.status) ? run.status : undefined;
  const stoppedAt = terminal === 'limit' || terminal === 'timeout' ? lastRepetition(run?.frames || []) : undefined;
  // Every seek stops playback, so a drag lands on its destination and stays
  // there — nothing catches up behind it.
  const seek = (target: number) => {
    setPlaying(false);
    const landing = Math.min(Math.max(0, target), Math.max(0, frames.length - 1));
    setAdjacentStep(Math.abs(landing - frameIndex) === 1);
    setFrameIndex(landing);
  };
  const chain = visibleLoops(loops, frameIndex);
  const endOf = (instance: LoopInstance) => trackEnd(instance, run?.status, terminal !== undefined);
  // The boxes are the state *at the moment it broke*, not the current state of
  // anything, and a run that ended in an error must never be able to look like
  // a run that finished.
  const frozen = terminal === 'runtime';
  const boxes = frame ? orderedVariables(frames, frameIndex, t('compute_lab.stage.truncated')) : [];
  const innermost = chain[chain.length - 1];
  const innermostIteration = innermost ? Math.max(1, iterationAt(innermost, frameIndex)) : 0;
  const announcement = !frame
    ? ''
    : t('compute_lab.announcement', {
        step: frameIndex + 1,
        total: frames.length,
        action: `${word(t, 'step', frame.kind, t('compute_lab.step.unknown'))} ${frame.source || ''}`.trim(),
        loop: !innermost
          ? ''
          : innermost.extent
            ? t('compute_lab.announce_loop', {
                loop: innermost.source,
                iteration: innermostIteration,
                extent: innermost.extent,
              })
            : t('compute_lab.announce_loop_open', { loop: innermost.source, iteration: innermostIteration }),
        changed: (frame.changed || []).length
          ? t('compute_lab.announce_changed', { names: (frame.changed || []).join(', ') })
          : t('compute_lab.announce_unchanged'),
      });
  const localProblemPath = sourceNode ? `problems/${sourceNode.id}.py` : '';

  return (
    <div
      ref={dialogRef}
      className="compute-lab"
      role="dialog"
      aria-modal="true"
      aria-label={t('compute_lab.title')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        // The Lab is bounded by the viewport rather than by its own content, and
        // each column scrolls inside it. A page that grows past the fold is what
        // put the tracks' end states — the answer to "why did it stop" — below
        // it at 1280x720, on a screen whose own criteria only ever checked the
        // horizontal axis.
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // The game's own modal-over-the-map treatment, not a hand-mixed navy:
        // eight themes ship and three are light, so a literal here is a screen
        // that belongs to the game in exactly one of them.
        background: 'var(--bg-glass-heavy)',
        backdropFilter: 'blur(24px)',
        padding: '10px max(18px, 4vw)',
        color: 'var(--text-primary)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'center',
          marginBottom: 8,
          flex: '0 0 auto',
        }}
      >
        <div>
          <strong className="compute-lab-title">{t('compute_lab.title')}</strong>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {t('compute_lab.workspace_subtitle')}
          </div>
        </div>
        <button ref={closeRef} onClick={closeComputeLab} style={{ minWidth: 44, minHeight: 44 }}>
          {t('compute_lab.exit')}
        </button>
      </header>
      {!available ? (
        <main role="status" className="compute-lab-status" style={{ alignSelf: 'start' }}>
          {t('compute_lab.locked')}
        </main>
      ) : (
        <main
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 1fr) minmax(300px, 1fr)',
            gap: 18,
            flex: '1 1 auto',
            minHeight: 0,
            overflowX: 'auto',
            overflowY: 'hidden',
          }}
        >
          <section style={{ display: 'grid', gap: 12, alignContent: 'start', minHeight: 0, overflowY: 'auto' }}>
            <div className="compute-lab-panel" style={{ padding: 12, display: 'grid', gap: 8 }}>
              <strong className="compute-lab-heading">{t('compute_lab.challenge')}</strong>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                {t('compute_lab.task_description', { description: task?.description || '' })}
              </p>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(task?.params || {}, null, 2)}</pre>
            </div>
            <div className="compute-lab-panel compute-lab-local-first" data-testid="compute-lab-local-first">
              <strong className="compute-lab-heading">{t('compute_lab.local_first.title')}</strong>
              <p>{t('compute_lab.local_first.instructions')}</p>
              <label className="compute-lab-path-label" htmlFor="compute-lab-local-path">
                {t('compute_lab.local_first.path')}
              </label>
              <input
                id="compute-lab-local-path"
                readOnly
                value={localProblemPath}
                aria-label={t('compute_lab.local_first.path')}
              />
              <pre>{task?.functionSignature || 'class ProblemSolver:'}</pre>
              <pre>{`uv run python ${localProblemPath}`}</pre>
              <div role="status" className="compute-lab-status compute-lab-status-alert">
                {t('compute_lab.local_first.limitation')}
              </div>
              <p className="compute-lab-local-retry">{t('compute_lab.local_first.retry')}</p>
            </div>
            {task && sourceNode && (
              <EditorBridgePanel
                nodeId={sourceNode.id}
                taskId={task.taskId}
                source={source}
                revision={revision}
                selection={!stale ? frame?.location : undefined}
              />
            )}
            {message && (
              <div role="status" className="compute-lab-status">
                {t(message.key, message.vars)}
              </div>
            )}
          </section>
          <section
            aria-label={t('compute_lab.trace')}
            className="compute-lab-panel"
            style={{
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {/* Everything the run says in words scrolls; the stage below it does
                not, because a track whose end has to be scrolled to is a track
                that has not answered the question it exists to answer. */}
            <div style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
              {/* The panel's name and where in the run it is are one line, not
                  two: at 1280x720 a spare line here is a line the step card's
                  own value does not get. */}
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  marginBottom: 8,
                }}
              >
                <strong className="compute-lab-heading">{t('compute_lab.trace')}</strong>
                <span className="compute-lab-trace-view-only">{t('compute_lab.local_first.trace_view_only')}</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {run
                    ? t('compute_lab.step_position', { current: frameIndex + 1, total: run.frames.length })
                    : t('compute_lab.run_to_trace')}
                </span>
              </div>
              {terminal && (
                <div
                  role="status"
                  data-testid="compute-lab-outcome"
                  className="compute-lab-card compute-lab-outcome"
                  style={{
                    padding: 8,
                    marginBottom: 10,
                    display: 'grid',
                    gap: 2,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span className="compute-lab-heading">{t('compute_lab.outcome_label')}</span>
                  <strong style={{ color: 'var(--text-primary)', fontSize: 12, letterSpacing: '0.06em' }}>
                    {t(`compute_lab.outcome.${terminal}`)}
                  </strong>
                  <div>{t(`compute_lab.outcome_action.${terminal}`)}</div>
                  {stoppedAt && stoppedAt.iteration > 0 && (
                    <div>
                      {t('compute_lab.outcome_stopped_in', { loop: stoppedAt.loop, iteration: stoppedAt.iteration })}
                    </div>
                  )}
                  {terminal !== 'trace_ready' && frame?.line !== undefined && (
                    <div>{t('compute_lab.outcome_last_line', { line: frame.line })}</div>
                  )}
                </div>
              )}
              {stale && (
                <div
                  role="status"
                  data-testid="compute-lab-stale-trace"
                  className="compute-lab-status"
                  style={{ marginBottom: 10 }}
                >
                  {t('compute_lab.old_trace')}
                </div>
              )}
              {/* The timeline reaches steps outside every loop, so it stays even
                once the tracks give the run a spatial index of its own. */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => seek(0)} disabled={!run?.frames.length}>
                  |&lt;
                </button>
                <button onClick={() => seek(frameIndex - 1)} disabled={!run?.frames.length}>
                  ‹
                </button>
                <input
                  aria-label="Trace step"
                  type="range"
                  min="0"
                  max={Math.max(0, (run?.frames.length || 1) - 1)}
                  value={frameIndex}
                  onChange={event => seek(Number(event.target.value))}
                  disabled={!run?.frames.length}
                />
                <button onClick={() => seek(frameIndex + 1)} disabled={!run?.frames.length}>
                  ›
                </button>
                <button onClick={() => seek(Math.max(0, (run?.frames.length || 1) - 1))} disabled={!run?.frames.length}>
                  &gt;|
                </button>
                <button
                  data-testid="compute-lab-play"
                  onClick={() => setPlaying(current => !current)}
                  disabled={!run?.frames.length}
                >
                  {t(playing ? 'compute_lab.pause' : 'compute_lab.play')}
                </button>
                <button
                  data-testid="compute-lab-pace"
                  onClick={() => setPace(current => (current === 'read' ? 'fast' : 'read'))}
                  disabled={!run?.frames.length}
                >
                  {t(pace === 'read' ? 'compute_lab.pace_read' : 'compute_lab.pace_fast')}
                </button>
              </div>
              {frame && (
                <StepCard frame={frame} source={source} stale={stale} t={t} frames={frames} index={frameIndex} />
              )}
            </div>
            {frame ? (
              <>
                <div
                  data-testid="compute-lab-stage"
                  data-animated={animated}
                  style={{
                    display: 'grid',
                    gridTemplateRows: chain.length > 0 ? `minmax(0, auto) minmax(${TRACKS_MIN_HEIGHT}px, 1fr)` : 'auto',
                    gap: 10,
                    marginTop: 10,
                    // Grows into whatever the words above did not want, and never
                    // shrinks below what one track and its end words need. A basis
                    // of `auto` would make the split depend on the height the
                    // tracks chose from the split, which is a loop.
                    flex: `1 0 ${STAGE_MIN_HEIGHT}px`,
                    minHeight: STAGE_MIN_HEIGHT,
                  }}
                >
                  <div style={{ minHeight: 0, overflowY: 'auto' }}>
                    <div className="compute-lab-heading" style={{ marginBottom: 6 }}>
                      {t('compute_lab.stage.variables')}
                    </div>
                    <VariableBoxes boxes={boxes} churning={churning} frozen={frozen} animated={animated} t={t} />
                  </div>
                  {chain.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      <div className="compute-lab-heading" style={{ marginBottom: 6, flex: '0 0 auto' }}>
                        {t('compute_lab.stage.loops')}
                      </div>
                      {/* The measured box, not the tracks themselves: what it
                          reports is the room the layout gave the stage, and it
                          must not depend on what the tracks inside it drew. */}
                      {/* Vertically the tracks are sized to fit, so there is
                          nothing to scroll to. Horizontally a nested pair is
                          wider than a narrow window's right column, and clipping
                          it would lose the inner track outright — so that one
                          axis stays reachable. At 1280x720 it fits and no
                          scrollbar appears, which R-21 #17 requires. */}
                      <div
                        ref={tracksRef}
                        style={{ flex: '1 1 auto', minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}
                      >
                        <LoopTracks
                          chain={chain}
                          frames={frames}
                          frameIndex={frameIndex}
                          animated={animated}
                          onSeek={seek}
                          t={t}
                          endOf={endOf}
                          available={tracksHeight}
                        />
                      </div>
                    </div>
                  )}
                </div>
                {/* One sentence per step: what happened, where in the loop, and
                    what changed — the picture said in words, for a player who
                    cannot see it. */}
                <div role="status" data-testid="compute-lab-announcement" className="sr-only">
                  {announcement}
                </div>
                {frameError && (
                  <div role="alert" className="compute-lab-status compute-lab-status-alert" style={{ marginTop: 8 }}>
                    {frameError.kind === 'invalid_trace_frame'
                      ? t('compute_lab.invalid_trace_frame')
                      : frameError.message}
                  </div>
                )}
              </>
            ) : (
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  padding: '24px 0',
                }}
              >
                {t('compute_lab.run_to_trace')}
              </p>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
