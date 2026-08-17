/*
 * The stage: boxes hold values, tracks hold position.
 *
 * Nothing in this file asks what construct it is drawing. A track is drawn
 * because frames said `repetition`; a box is drawn because a frame said what the
 * player is holding. `for`, `while`, a comprehension and a repeating construct
 * nobody has written yet all arrive here identically.
 *
 * Two rules govern every visual below:
 *   - No state is signalled by colour alone. Eight themes ship, three of them
 *     light, and a player who cannot separate two hues still has to read the
 *     screen — so each state also differs in shape and carries a word.
 *   - Motion is a layer on top of an already-correct screen. At frame 0 of any
 *     animation the state is already right, which is why `prefers-reduced-motion`
 *     can remove all of it and lose nothing.
 */
import { type ComponentProps, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  type Frame,
  type LoopInstance,
  type TrackEnd,
  iterationAt,
  pythonValue,
  truncationOf,
  type VariableBox as VariableBoxModel,
} from './stageModel';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** The most a track is ever drawn at, however much room the stage turns out to have. */
const TRACK_HEIGHT = 168;
/**
 * The height below which a rail stops being a rail.
 *
 * Deliberately low, and the first draft of this had it at 76 — which made a
 * stage with room for 60 draw 76 and push its own end words off the bottom,
 * which is the defect this issue opens with wearing a different hat. A short
 * rail still says where the marker is; an end state nobody can see says nothing,
 * so when the two compete the rail gives way.
 */
const MIN_TRACK_HEIGHT = 28;
/** The header line above a rail, and the end words below it — measured in the layout, not drawn by it. */
const TRACK_HEADER = 22;
const TRACK_END = 58;
const RAIL_WIDTH = 16;
const RAIL_GAP = 8;
/**
 * The gutter the start and end numbers sit in, on the rail's own side.
 *
 * They shared the marker's column until a `range(10000)` label wrapped under its
 * box on a short rail and landed on top of the extent — two facts in one place,
 * on the track whose whole job is to be read at a glance.
 */
const EXTENT_WIDTH = 44;
/** The column the marker's own label lives in, beside the rail. */
const LABEL_WIDTH = 170;
const ATTACH_GAP = 16;
/** Where an inner track hangs, measured from the outer track's left edge. */
const ATTACH_X = EXTENT_WIDTH + RAIL_WIDTH + RAIL_GAP + LABEL_WIDTH + ATTACH_GAP;
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
 * How much vertical room the stage actually has for its tracks.
 *
 * A track's end is where its five end states are written, and the end states are
 * the answer to "why did it stop" — so a height chosen in the source and left to
 * whatever the layout gives it puts the answer below the fold on the short
 * viewport and calls that a pass. The element observed here is a flex child with
 * a definite height, so what it reports never depends on what the track drawn
 * inside it decides to be.
 *
 * Zero means "not measured" — a server render, a test, a browser with no
 * `ResizeObserver` — and every caller reads that as the full height rather than
 * as no room.
 *
 * A *callback* ref, not a mount effect: the box being measured only exists once
 * the run has a loop in it, which is long after this component mounted. A
 * `useEffect(…, [])` reading `ref.current` finds null, never runs again, and
 * leaves every track drawn at the constant height this hook exists to replace —
 * silently, because a track at the wrong height still looks like a track.
 */
export function useAvailableHeight() {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!element) return;
    // `clientHeight`, not the bounding box: where the tracks scrolled sideways
    // the box includes the scrollbar's own strip, and a track sized to include
    // it is a track whose end words sit under it.
    const measure = () => setHeight(element.clientHeight);
    measure();
    if (typeof ResizeObserver !== 'function') return;
    observer.current = new ResizeObserver(measure);
    observer.current.observe(element);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, height] as const;
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
        borderRadius: 'var(--radius-sm)',
        padding: '5px 8px',
        minWidth: 74,
        maxWidth: 220,
        background: 'var(--bg-secondary)',
        // The one state that is also a glow: what just changed is what the
        // player is looking for. Shape and word still carry it (R-33 §2).
        boxShadow: state === 'changed' ? '0 0 10px var(--accent-glow)' : 'none',
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

/**
 * Where the marker sits, and how much of the rail was watched.
 *
 * Shared rather than recomputed, because the inner track hangs at exactly the
 * outer marker's position: two copies of this arithmetic is two chances for the
 * attachment to drift off the thing it is claiming to be attached to.
 */
function placement(instance: LoopInstance, iteration: number) {
  const extent = instance.extent;
  const measured = typeof extent === 'number' && extent > 0;
  // An unmeasurable loop never draws a full-length bar and never shows an end
  // number: the marker walks a fixed pitch and the numbers roll under it, so
  // motion still means progress without implying a fraction of anything.
  const slot = measured ? 0 : ((Math.max(1, iteration) - 1) % OPEN_TRACK_WINDOW) + 1;
  return {
    measured,
    extent,
    slot,
    markerFraction: measured ? Math.min(1, iteration / (extent as number)) : slot / OPEN_TRACK_WINDOW,
    observedFraction: measured ? Math.min(1, instance.iterations.length / (extent as number)) : 1,
  };
}

export type TrackGeometry = { height: number; attachedTop: number };

/**
 * The height to draw a track at, so that its end is on screen.
 *
 * A nested pair costs `markerFraction × height` more than a lone track, because
 * the inner one starts at the outer marker — so the height that fits both is the
 * solution of `height × (1 + markerFraction) + chrome ≤ available`, not a
 * constant with a nested case bolted on.
 *
 * When even the shortest readable track will not fit, the inner one is *pinned*
 * rather than allowed to run off the bottom: its end cap and the word beside it
 * stay in view and the connector lengthens to say so. The middle of a track is
 * the part a player can infer; the end is the part they came for.
 */
export function trackGeometry(
  available: number,
  markerFraction: number,
  nested: boolean,
  noted = false,
): TrackGeometry {
  if (!available) {
    const height = TRACK_HEIGHT;
    return { height, attachedTop: nested ? markerFraction * height : 0 };
  }
  const chrome = TRACK_HEADER + TRACK_END + (nested ? TRACK_HEADER : 0) + (noted ? TRACK_HEADER : 0);
  const fits = (available - chrome) / (nested ? 1 + markerFraction : 1);
  const height = Math.max(MIN_TRACK_HEIGHT, Math.min(TRACK_HEIGHT, Math.floor(fits)));
  if (!nested) return { height, attachedTop: 0 };
  const room = available - TRACK_HEADER - ((noted ? TRACK_HEADER : 0) + TRACK_HEADER + height + TRACK_END);
  return { height, attachedTop: Math.max(0, Math.min(markerFraction * height, room)) };
}

/**
 * The loop's own variable at the marker — the same three-part box as every other
 * variable, because it is the same kind of thing as every other variable.
 *
 * Corix's mockup draws `i` hanging off the marker exactly as it draws `total` in
 * the variables row. Rendering one as a box and the other as a one-line chip
 * would say the two are different kinds of thing.
 */
function LoopVariableBox({ frame, t }: { frame: Frame | undefined; t: Translate }) {
  const bindings = frame?.detail?.bindings;
  if (!bindings || typeof bindings !== 'object') return null;
  const entries = Object.entries(bindings as Record<string, unknown>);
  if (entries.length === 0) return null;
  const truncated = t('compute_lab.stage.truncated');
  return (
    <>
      {entries.map(([name, value]) => (
        <Box
          key={name}
          animated={false}
          state="settled"
          t={t}
          box={{
            name,
            value: pythonValue(value, truncated),
            type: frame?.types?.[name],
            changed: false,
            truncated: truncationOf(value) !== null,
          }}
        />
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
  height = TRACK_HEIGHT,
  attached,
  attachedTop = 0,
}: {
  view: TrackView;
  frames: readonly Frame[];
  animated: boolean;
  onSeek: (frameIndex: number) => void;
  t: Translate;
  height?: number;
  attached?: ReactNode;
  attachedTop?: number;
}) {
  const { instance, iteration, end } = view;
  const observed = instance.iterations.length;
  const { measured, extent, slot, markerFraction, observedFraction } = placement(instance, iteration);
  const torn = end === 'cut';
  const closed = end === 'finished' || end === 'early';
  const markerTop = markerFraction * height;
  const [labelRef, labelHeight] = useAvailableHeight();

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
    <div style={{ width: attached ? ATTACH_X * 2 : ATTACH_X, flex: '0 0 auto' }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          height: TRACK_HEADER,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {t('compute_lab.step.repetition')} <code style={{ color: 'var(--text-primary)' }}>{instance.source}</code>
      </div>
      <div style={{ display: 'flex', gap: RAIL_GAP, position: 'relative', height }}>
        <div
          style={{
            position: 'relative',
            width: EXTENT_WIDTH,
            height: '100%',
            flex: '0 0 auto',
            fontSize: 11,
            textAlign: 'right',
            color: 'var(--text-muted)',
            marginRight: -RAIL_GAP + 4,
          }}
        >
          <div style={{ position: 'absolute', top: -2, right: 0 }}>{measured ? 0 : iteration - slot + 1}</div>
          {/* A number, or nothing. The gutter is as wide as a number needs to be,
              so the sentence an unmeasurable loop ends with goes under the track
              with the other end words, where there is room to read it. */}
          {measured && <div style={{ position: 'absolute', bottom: -2, right: 0 }}>{extent}</div>}
        </div>
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
            width: RAIL_WIDTH,
            height: '100%',
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
              borderRadius: 2,
              height: '100%',
              background: 'var(--border-bright)',
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
              borderRadius: 2,
              height: `${observedFraction * 100}%`,
              background: end === 'broke' ? 'var(--text-secondary)' : 'var(--accent)',
              boxShadow: end === 'broke' ? 'none' : '0 0 6px var(--accent-glow)',
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
              borderRadius: 3,
              border: '2px solid var(--text-primary)',
              background: 'var(--bg-primary)',
              boxShadow: '0 0 8px var(--accent-glow)',
              transition: transition('top', MARKER_MS, animated),
            }}
          />
        </div>
        <div style={{ position: 'relative', height: '100%', width: LABEL_WIDTH, flex: '0 0 auto', fontSize: 11 }}>
          {/* Held inside the rail's own box rather than hung freely from the
              marker: a three-part box is most of a short rail's height, so at
              either end it would otherwise cover the track's header or be
              clipped by the stage. Its own height is measured, because the
              label is one line beside the box or two under it depending on how
              long `repeat 399 of 10000` turns out to be. */}
          <div
            ref={labelRef}
            style={{
              position: 'absolute',
              top: Math.max(0, Math.min(markerTop - 8, height - labelHeight)),
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
        </div>
        {/* An inner loop is a different instance on every outer iteration, so its
            track hangs off this marker rather than standing beside it. The
            connector is the containment: a track drawn as a sibling says the two
            loops are peers, which is false. */}
        {attached && (
          <>
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: ATTACH_X - ATTACH_GAP,
                top: markerTop,
                width: ATTACH_GAP,
                height: 1,
                background: 'var(--accent-secondary)',
                transition: transition('top', MARKER_MS, animated),
              }}
            />
            {/* The spine runs the length of the inner rail, so the attachment
                reads as containment rather than as a stray dash beside two
                tracks — and when the pair had to be pinned it is the spine that
                lengthens, which is what says the inner one belongs further up. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: ATTACH_X - ATTACH_GAP,
                top: Math.min(markerTop, attachedTop),
                width: 1,
                height: Math.abs(markerTop - attachedTop) + TRACK_HEADER + height,
                background: 'var(--accent-secondary)',
                transition: transition('top', MARKER_MS, animated),
              }}
            />
            <div
              data-testid="compute-lab-track-attached"
              style={{
                position: 'absolute',
                left: ATTACH_X,
                top: attachedTop,
                width: ATTACH_X,
                transition: transition('top', MARKER_MS, animated),
              }}
            >
              {attached}
            </div>
          </>
        )}
      </div>
      <div
        data-testid="compute-lab-track-end"
        data-end={end}
        style={{ fontSize: 11, marginTop: 4, width: EXTENT_WIDTH + RAIL_WIDTH + RAIL_GAP + LABEL_WIDTH }}
      >
        {t(`compute_lab.stage.end.${end}`)}
        {!measured && <div style={{ color: 'var(--text-muted)' }}>{t('compute_lab.stage.length_unknown')}</div>}
        {/* The marker's number is the playhead; this one is the last iteration
            anyone watched. Both are true and they are different things, so the
            second one is named where it appears rather than left for the player
            to subtract the first from the extent and get a number that is not on
            the screen. */}
        {torn && measured && (
          <>
            <div style={{ color: 'var(--text-muted)' }}>
              {t('compute_lab.stage.watched_to', { iteration: observed })}
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              {t('compute_lab.stage.unwatched', { count: (extent as number) - observed })}
            </div>
          </>
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
  available = 0,
}: {
  chain: readonly LoopInstance[];
  frames: readonly Frame[];
  frameIndex: number;
  animated: boolean;
  onSeek: (frameIndex: number) => void;
  t: Translate;
  endOf: (instance: LoopInstance) => TrackEnd;
  /** How much vertical room the stage has for the tracks; 0 means unmeasured. */
  available?: number;
}) {
  if (chain.length === 0) return null;
  const drawn = chain.length <= 2 ? chain : [chain[0], chain[chain.length - 1]];
  const between = chain.length - drawn.length;
  const outer = drawn[0];
  const outerIteration = Math.max(1, iterationAt(outer, frameIndex));
  const inner = drawn.length > 1 ? drawn[1] : undefined;
  const { height, attachedTop } = trackGeometry(
    available,
    placement(outer, outerIteration).markerFraction,
    Boolean(inner),
    between > 0,
  );
  const track = (instance: LoopInstance, extra: Partial<ComponentProps<typeof Track>> = {}) => (
    <Track
      view={{ instance, iteration: Math.max(1, iterationAt(instance, frameIndex)), end: endOf(instance) }}
      frames={frames}
      animated={animated}
      onSeek={onSeek}
      t={t}
      height={height}
      {...extra}
    />
  );
  return (
    <div data-testid="compute-lab-loops" style={{ display: 'flex', alignItems: 'start' }}>
      {track(outer, {
        attached: inner ? (
          <>
            {/* Its own line above the inner track, not a suffix on that track's
                header: the header is the player's own source, and a header that
                has to ellipsise the source to fit a count has lost the more
                important of the two. */}
            {between > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', height: TRACK_HEADER, overflow: 'hidden' }}>
                {t('compute_lab.stage.depth', { count: between })}
              </div>
            )}
            {track(inner)}
          </>
        ) : undefined,
        attachedTop,
      })}
    </div>
  );
}
