/*
 * The stage: boxes hold values, tracks hold position.
 *
 * Nothing in this file asks what construct it is drawing. A track is drawn
 * because frames said `repetition`; a box is drawn because a frame said what the
 * player is holding. `for`, `while`, a comprehension and a repeating construct
 * nobody has written yet all arrive here identically.
 *
 * Two rules govern every visual below:
 *   - No state is signalled by colour alone. Three themes ship, and a player who
 *     cannot separate two hues still has to read the screen — so each state also
 *     differs in shape and carries a word.
 *   - Motion is a layer on top of an already-correct screen. At frame 0 of any
 *     animation the state is already right, which is why `prefers-reduced-motion`
 *     can remove all of it and lose nothing.
 */
import { useEffect, useRef, useState } from 'react';
import {
  type Frame,
  type LoopInstance,
  type TrackEnd,
  iterationAt,
  pythonValue,
  type VariableBox as VariableBoxModel,
} from './stageModel';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const TRACK_HEIGHT = 168;
/** How many iterations of an unmeasurable loop are on the rail before it rolls over. */
const OPEN_TRACK_WINDOW = 12;
const VALUE_LIMIT = 26;
const BOXES_BEFORE_OVERFLOW = 6;
/** §4's budget: a value lands in under 200ms, a marker travels in under 300ms. */
const VALUE_MS = 180;
const MARKER_MS = 280;
/**
 * How long a variable's recent changes are remembered when deciding that it is
 * churning rather than changing.
 *
 * Calibrated against the playback the player actually has, not against a frame
 * count. A loop body puts two or three frames between consecutive `binding`s, so
 * at the fast pace an accumulator changes roughly every third step and three of
 * those land inside this window — one sustained thing. At the reading pace the
 * same three take several seconds and stay separate, which is correct: at a pace
 * chosen for reading, every change *is* an event the player is watching.
 */
const CHURN_WINDOW_MS = 1200;
const CHURN_CHANGES = 3;

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/**
 * Which variables are *churning* — one continuous changing thing rather than a
 * run of separate events.
 *
 * An accumulator inside a 399-iteration loop is not 399 things happening; drawing
 * it as 399 flashes is both a lie and a strobe. The trigger is therefore a rate
 * over wall-clock, and deliberately not a count of consecutive steps: a loop body
 * puts `repetition`, `value` and `decision` frames between two `binding`s, so
 * "consecutive" would never fire on the case this exists for.
 */
export function useChurningVariables(frames: readonly Frame[], frameIndex: number) {
  const history = useRef(new Map<string, number[]>());
  const lastIndex = useRef(frameIndex);
  const [churning, setChurning] = useState<readonly string[]>([]);
  useEffect(() => {
    const step = frameIndex - lastIndex.current;
    lastIndex.current = frameIndex;
    if (Math.abs(step) !== 1) {
      // A jump is not playback: nothing is moving, so nothing is churning.
      // A *streaming* run re-runs this with no step at all, so the empty result
      // is only written when it is actually a change — otherwise every arriving
      // frame would re-render the stage for nothing.
      history.current.clear();
      setChurning(previous => (previous.length === 0 ? previous : []));
      return;
    }
    const now = Date.now();
    for (const name of frames[frameIndex]?.changed || [])
      history.current.set(name, [...(history.current.get(name) || []), now]);
    const settle = () => {
      const moment = Date.now();
      const active: string[] = [];
      for (const [name, times] of history.current) {
        const recent = times.filter(time => moment - time <= CHURN_WINDOW_MS);
        if (recent.length === 0) history.current.delete(name);
        else history.current.set(name, recent);
        if (recent.length >= CHURN_CHANGES) active.push(name);
      }
      setChurning(previous =>
        previous.length === active.length && previous.every(name => active.includes(name)) ? previous : active,
      );
    };
    settle();
    // Churn is a property of motion, so it has to decay when the motion stops.
    const timer = setTimeout(settle, CHURN_WINDOW_MS + 20);
    return () => clearTimeout(timer);
  }, [frameIndex, frames]);
  return churning;
}

function transition(properties: string, ms: number, enabled: boolean) {
  return enabled ? `${properties} ${ms}ms ease-out` : 'none';
}

// ── variable boxes ─────────────────────────────────────────────────────────

function Box({
  box,
  state,
  animated,
  t,
}: {
  box: VariableBoxModel;
  state: 'settled' | 'changed' | 'churning' | 'frozen';
  animated: boolean;
  t: Translate;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = box.value.length > VALUE_LIMIT;
  const shown = long && !expanded ? `${box.value.slice(0, VALUE_LIMIT)}…` : box.value;
  // Shape carries the state, not only colour: the border thickens and its style
  // changes, and the word below says the same thing again in text.
  const outline =
    state === 'changed'
      ? '2px solid var(--accent)'
      : state === 'churning'
        ? '2px dashed var(--accent-secondary)'
        : state === 'frozen'
          ? '1px dotted var(--text-muted)'
          : '1px solid var(--border-bright)';
  return (
    <div
      data-testid="compute-lab-variable"
      data-state={state}
      style={{
        border: outline,
        padding: '4px 8px',
        minWidth: 74,
        maxWidth: 220,
        background: 'var(--bg-secondary)',
        transform: state === 'changed' && animated ? 'translateY(-2px)' : 'none',
        transition: transition('transform', VALUE_MS, animated),
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{box.name}</div>
      <div style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{shown}</div>
      {box.type && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{box.type}</div>}
      {(long || box.truncated) && (
        <div style={{ fontSize: 10 }}>
          <span style={{ color: 'var(--text-muted)' }}>{t('compute_lab.stage.truncated')}</span>{' '}
          {long && (
            <button
              onClick={() => setExpanded(current => !current)}
              style={{ fontSize: 10, padding: '0 4px', minHeight: 0 }}
            >
              {t(expanded ? 'compute_lab.stage.collapse_value' : 'compute_lab.stage.expand_value')}
            </button>
          )}
        </div>
      )}
      {state !== 'settled' && (
        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{t(`compute_lab.stage.${state}`)}</div>
      )}
    </div>
  );
}

export function VariableBoxes({
  boxes,
  churning,
  frozen,
  animated,
  t,
}: {
  boxes: readonly VariableBoxModel[];
  churning: readonly string[];
  frozen: boolean;
  animated: boolean;
  t: Translate;
}) {
  const [showAll, setShowAll] = useState(false);
  if (boxes.length === 0)
    return (
      <div style={{ color: 'var(--text-muted)' }}>
        <small>{t('compute_lab.stage.no_variables')}</small>
      </div>
    );
  // A variable that is moving at this step — changed here, or churning through a
  // loop — is never the one hidden behind "N more". It is the one the player is
  // looking for.
  const moving = (box: VariableBoxModel) => box.changed || churning.includes(box.name);
  const promoted = showAll
    ? boxes
    : [...boxes.filter(moving), ...boxes.filter(box => !moving(box))].slice(0, BOXES_BEFORE_OVERFLOW);
  const hidden = boxes.length - promoted.length;
  return (
    <div data-testid="compute-lab-variables" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'start' }}>
      {promoted.map(box => (
        <Box
          key={box.name}
          box={box}
          animated={animated}
          t={t}
          state={frozen ? 'frozen' : churning.includes(box.name) ? 'churning' : box.changed ? 'changed' : 'settled'}
        />
      ))}
      {(hidden > 0 || showAll) && (
        <button onClick={() => setShowAll(current => !current)} style={{ alignSelf: 'center', minHeight: 32 }}>
          {showAll ? t('compute_lab.stage.fewer') : t('compute_lab.stage.more', { count: hidden })}
        </button>
      )}
    </div>
  );
}

// ── loop tracks ────────────────────────────────────────────────────────────

/** A torn edge, drawn as geometry so it reads as *torn* before any word is read. */
function tearClip() {
  const teeth = 6;
  const points: string[] = ['0% 0%', '100% 0%'];
  for (let tooth = teeth; tooth >= 0; tooth--)
    points.push(`${(tooth / teeth) * 100}% ${tooth % 2 === 0 ? '100%' : '35%'}`);
  return `polygon(${points.join(', ')})`;
}

export type TrackView = {
  instance: LoopInstance;
  iteration: number;
  end: TrackEnd;
};

function LoopVariableBox({ frame, t }: { frame: Frame | undefined; t: Translate }) {
  const bindings = frame?.detail?.bindings;
  if (!bindings || typeof bindings !== 'object') return null;
  const entries = Object.entries(bindings as Record<string, unknown>);
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(([name, value]) => (
        <span
          key={name}
          style={{
            border: '1px solid var(--border-bright)',
            background: 'var(--bg-secondary)',
            padding: '1px 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          {name} {pythonValue(value, t('compute_lab.stage.truncated'))}
          <span style={{ color: 'var(--text-muted)' }}> {frame?.types?.[name] || ''}</span>
        </span>
      ))}
    </>
  );
}

function Track({
  view,
  frames,
  animated,
  onSeek,
  t,
}: {
  view: TrackView;
  frames: readonly Frame[];
  animated: boolean;
  onSeek: (frameIndex: number) => void;
  t: Translate;
}) {
  const { instance, iteration, end } = view;
  const observed = instance.iterations.length;
  const extent = instance.extent;
  const measured = typeof extent === 'number' && extent > 0;
  // An unmeasurable loop never draws a full-length bar and never shows an end
  // number: the marker walks a fixed pitch and the numbers roll under it, so
  // motion still means progress without implying a fraction of anything.
  const slot = measured ? 0 : ((Math.max(1, iteration) - 1) % OPEN_TRACK_WINDOW) + 1;
  const markerFraction = measured ? Math.min(1, iteration / (extent as number)) : slot / OPEN_TRACK_WINDOW;
  const observedFraction = measured ? Math.min(1, observed / (extent as number)) : 1;
  const torn = end === 'cut';
  const closed = end === 'finished' || end === 'early';

  const seekTo = (target: number) => {
    const clamped = Math.min(observed, Math.max(1, Math.round(target)));
    onSeek(instance.iterations[clamped - 1]);
  };
  const fromPointer = (event: { currentTarget: HTMLElement; clientY: number }) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    if (!measured) {
      seekTo(iteration - slot + fraction * OPEN_TRACK_WINDOW);
      return;
    }
    // The unwatched remainder past a tear is inert, and not by clamping: landing
    // on the last observed iteration would still be a seek, and a control that
    // moves the run when pointed at a place with no data is the truncation lie
    // in a different costume. Pointing there does nothing at all.
    const target = fraction * (extent as number);
    if (target > observed) return;
    seekTo(target);
  };

  return (
    <div style={{ minWidth: 126, flex: '0 1 auto' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {t('compute_lab.step.repetition')} <code style={{ color: 'var(--text-primary)' }}>{instance.source}</code>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('compute_lab.stage.scrub_loop', { loop: instance.source })}
          aria-valuemin={1}
          aria-valuemax={observed}
          aria-valuenow={Math.max(1, iteration)}
          aria-valuetext={
            measured
              ? t('compute_lab.stage.iteration_of', { iteration, extent: extent as number })
              : t('compute_lab.stage.iteration', { iteration })
          }
          onPointerDown={event => {
            event.currentTarget.setPointerCapture(event.pointerId);
            fromPointer(event);
          }}
          onPointerMove={event => {
            if (event.buttons === 1) fromPointer(event);
          }}
          onKeyDown={event => {
            const jump = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
            if (jump) {
              event.preventDefault();
              seekTo(iteration + jump);
            }
            if (event.key === 'Home') {
              event.preventDefault();
              seekTo(1);
            }
            if (event.key === 'End') {
              event.preventDefault();
              seekTo(observed);
            }
          }}
          style={{
            position: 'relative',
            width: 16,
            height: TRACK_HEIGHT,
            cursor: 'pointer',
            flex: '0 0 auto',
          }}
        >
          {/* the whole extent, drawn even where it was never watched */}
          <div
            style={{
              position: 'absolute',
              left: 6,
              top: 0,
              width: 4,
              height: '100%',
              background: 'var(--border)',
              opacity: measured ? 1 : 0.35,
            }}
          />
          {/* the part that actually ran */}
          <div
            style={{
              position: 'absolute',
              left: 6,
              top: 0,
              width: 4,
              height: `${observedFraction * 100}%`,
              background: end === 'broke' ? 'var(--text-secondary)' : 'var(--accent)',
              maskImage: end === 'running' && !measured ? 'linear-gradient(var(--bg-primary), transparent)' : undefined,
            }}
          />
          {/* The tear is its own fixed-size mark rather than a clip on the bar:
              `range(10000)` observed to 399 is a 4% stub, and a torn edge clipped
              into two pixels of it is not a torn edge anyone can see. */}
          {torn && (
            <div
              style={{
                position: 'absolute',
                left: 3,
                top: `calc(${observedFraction * 100}% - 4px)`,
                width: 10,
                height: 9,
                background: 'var(--accent)',
                clipPath: tearClip(),
              }}
            />
          )}
          {closed && (
            <div
              style={{
                position: 'absolute',
                left: 2,
                top: `calc(${observedFraction * 100}% - 1px)`,
                width: 12,
                height: 3,
                background: 'var(--accent)',
              }}
            />
          )}
          {end === 'broke' && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: `calc(${observedFraction * 100}% - 6px)`,
                fontSize: 13,
                lineHeight: '12px',
                color: 'var(--text-primary)',
              }}
              aria-hidden
            >
              ✕
            </div>
          )}
          {/* every completed inner instance, as a mark on this track */}
          {instance.innerRuns.slice(0, 60).map(run => (
            <div
              key={run.iteration}
              style={{
                position: 'absolute',
                left: 3,
                top: `${measured ? (run.iteration / (extent as number)) * 100 : 0}%`,
                width: 10,
                height: 1,
                background: 'var(--accent-secondary)',
              }}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              left: 1,
              top: `calc(${markerFraction * 100}% - 5px)`,
              width: 14,
              height: 10,
              border: '2px solid var(--text-primary)',
              background: 'var(--bg-primary)',
              transition: transition('top', MARKER_MS, animated),
            }}
          />
        </div>
        <div style={{ position: 'relative', height: TRACK_HEIGHT, flex: '1 1 auto', fontSize: 11 }}>
          <div style={{ position: 'absolute', top: -2, color: 'var(--text-muted)' }}>
            {measured ? 0 : iteration - slot + 1}
          </div>
          <div
            style={{
              position: 'absolute',
              top: `calc(${markerFraction * 100}% - 8px)`,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              flexWrap: 'wrap',
              transition: transition('top', MARKER_MS, animated),
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }} aria-hidden>
              ←
            </span>
            <LoopVariableBox frame={frames[instance.iterations[Math.max(0, iteration - 1)]]} t={t} />
            <span style={{ color: 'var(--text-secondary)' }}>
              {measured
                ? t('compute_lab.stage.iteration_of', { iteration, extent: extent as number })
                : t('compute_lab.stage.iteration', { iteration })}
            </span>
          </div>
          <div style={{ position: 'absolute', bottom: -2, color: 'var(--text-muted)' }}>
            {measured ? extent : t('compute_lab.stage.length_unknown')}
          </div>
        </div>
      </div>
      <div data-testid="compute-lab-track-end" data-end={end} style={{ fontSize: 11, marginTop: 4 }}>
        {t(`compute_lab.stage.end.${end}`)}
        {torn && measured && (
          <div style={{ color: 'var(--text-muted)' }}>
            {t('compute_lab.stage.unwatched', { count: (extent as number) - observed })}
          </div>
        )}
        {instance.innerRuns.length > 0 && (
          <div style={{ color: 'var(--text-muted)' }}>
            {t('compute_lab.stage.inner_ran', {
              count: instance.innerRuns[instance.innerRuns.length - 1].count,
              times: instance.innerRuns.length,
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * At most two tracks: the outermost and the current innermost, with everything
 * between them reduced to a count — the same rule the call stack already applies
 * to call depth, because there is one rule for depth on this screen, not two.
 */
export function LoopTracks({
  chain,
  frames,
  frameIndex,
  animated,
  onSeek,
  t,
  endOf,
}: {
  chain: readonly LoopInstance[];
  frames: readonly Frame[];
  frameIndex: number;
  animated: boolean;
  onSeek: (frameIndex: number) => void;
  t: Translate;
  endOf: (instance: LoopInstance) => TrackEnd;
}) {
  if (chain.length === 0) return null;
  const drawn = chain.length <= 2 ? chain : [chain[0], chain[chain.length - 1]];
  const between = chain.length - drawn.length;
  const outer = drawn[0];
  const outerIteration = Math.max(1, iterationAt(outer, frameIndex));
  // The inner track hangs off the outer marker rather than standing beside it,
  // because an inner loop is a different instance on every outer iteration and
  // drawing it as a permanent sibling would say otherwise.
  const hangs = outer.extent && outer.extent > 0 ? Math.min(1, outerIteration / outer.extent) * (TRACK_HEIGHT - 40) : 0;
  return (
    <div data-testid="compute-lab-loops" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'start' }}>
      {drawn.map((instance, position) => (
        <div
          key={instance.id}
          style={{ display: 'flex', gap: 10, alignItems: 'start', marginTop: position > 0 ? hangs : 0 }}
        >
          {position > 0 && between > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 90 }}>
              {t('compute_lab.stage.depth', { count: between })}
            </div>
          )}
          <Track
            view={{ instance, iteration: Math.max(1, iterationAt(instance, frameIndex)), end: endOf(instance) }}
            frames={frames}
            animated={animated}
            onSeek={onSeek}
            t={t}
          />
        </div>
      ))}
    </div>
  );
}
