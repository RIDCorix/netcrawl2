/*
 * The focused Compute Lab contract, plus as much of R-21's acceptance list as can
 * be decided without a browser.
 *
 * What this file CANNOT decide, and which must be checked by a human against a
 * running build (R-21 #4's "one screen", #6's responsiveness, #14's observer,
 * #17's screen reader and 1280x720 layout):
 *   - #4  the skipped branch is shown *in place and dimmed* rather than merely
 *         named by the decision frame's `taken` detail
 *   - #6  RUN to interactive trace within 3s, and no interaction over 200ms
 *   - #14 an observer who has not read the source cannot tell which construct
 *         was anticipated — the structural half is checked here and in
 *         ComputeLabTransport.test.tsx; the human half stays human
 *   - #17 keyboard-only entry and screen-reader announcement
 * The 1280x720 layout is no longer on that list: `scripts/verify-stage-layout.mjs`
 * drives the real Lab in a real browser and asserts, on both axes, that every
 * track's end state is on screen. It needs a browser and a live runtime, so it
 * runs as `pnpm verify:lab-stage` rather than here.
 * Everything else below is decided here or in the transport, runtime and Python
 * suites, and each assertion names the criterion it settles.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../packages/ui/src/components/ComputeLabScreen.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../packages/server/src/routes/computeLabRoutes.ts', import.meta.url), 'utf8');
const normalizer = readFileSync(new URL('../packages/server/src/computeLab.ts', import.meta.url), 'utf8');
const deployRoutes = readFileSync(new URL('../packages/server/src/routes/deployRoutes.ts', import.meta.url), 'utf8');
const nodeDetail = readFileSync(new URL('../packages/ui/src/components/NodeDetailPanel.tsx', import.meta.url), 'utf8');
const nodeTypeInfo = readFileSync(
  new URL('../packages/ui/src/components/nodeDetail/NodeTypeInfo.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(new URL('../packages/ui/src/styles.css', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../packages/sdk-python/netcrawl/compute_lab_runner.py', import.meta.url), 'utf8');
const daemon = readFileSync(new URL('../packages/sdk-python/netcrawl/app.py', import.meta.url), 'utf8');
const localeNames = ['en', 'ja', 'zh-TW'];
const locales = localeNames.map(locale =>
  readFileSync(new URL(`../packages/ui/src/i18n/${locale}.ts`, import.meta.url), 'utf8'),
);
const translation = (locale, key) =>
  locale.match(new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*\\n?\\s*'((?:[^'\\\\]|\\\\.)*)'`))?.[1];

// ── the screen is still the focused workspace it was ────────────────────────
assert.match(screen, /role="dialog"/);
assert.match(screen, /aria-modal="true"/);
assert.match(screen, /textarea/);
assert.match(screen, /compute-lab\/tasks/);
assert.match(screen, /compute-lab\/runs/);
assert.match(screen, /compute_lab\.submit_correct/);
assert.match(screen, /submissionSuccess/);
assert.match(screen, /compute_lab\.operators_progress/);
assert.match(screen, /compute_lab\.operators_completed/);
assert.match(screen, /compute_lab\.task_load_failed/);
assert.match(screen, /SUBMIT LAST RUN|compute_lab\.submit/);
assert.match(screen, /type="range"/);
assert.match(screen, /starterSource/);
assert.match(screen, /task\?\.description/);
assert.match(screen, /compute_lab\.task_description/);
assert.doesNotMatch(screen, /GraphCanvas|LAB_NODES|NodeDetailPanel|worker\.goto/);
assert.match(server, /compute-lab\/tasks/);
assert.match(server, /compute-lab\/submissions/);
assert.match(server, /getActiveComputeLabTask/);
assert.match(runner, /sys\.settrace/);
assert.match(runner, /InstrumentExecution/);
assert.match(runner, /attribute access is not allowed/);
assert.match(runner, /ProblemSolver/);
assert.match(nodeDetail, /eligibility=\{node\.type === 'compute' \? 'compute_automation' : undefined\}/);
assert.match(nodeTypeInfo, /AUTOMATE WITH WORKER|compute_lab\.automate/);
assert.match(nodeTypeInfo, /from workers\.solver import Solver/);
assert.match(deployRoutes, /compute_lab_required/);
assert.match(deployRoutes, /compute_worker_required/);
assert.match(screen, /compute_lab\.old_trace/);
assert.match(screen, /compute-lab-stale-trace/);

// ── R-21 #14: there is one card, and no table of anticipated constructs ─────
assert.doesNotMatch(
  screen,
  /EXPRESSION_CARD_REGISTRY|RegisteredExpressionCard|GenericExpressionCard/,
  '#14: deleting the registry must change nothing a player can name, so it is gone',
);
assert.match(screen, /data-testid="compute-lab-step"/);
assert.equal(
  screen.match(/data-testid="compute-lab-step"/g).length,
  1,
  '#14: exactly one card renders every construct, anticipated or not',
);

// ── R-21 #3: the parser's vocabulary never reaches the player ───────────────
// Scoped to the Lab's own strings: the game elsewhere teaches `node.node_type`
// as a quest, and that is the SDK's vocabulary, not the trace panel's.
const labStrings = locales.map(locale =>
  locale
    .split('\n')
    .filter(line => line.trimStart().startsWith("'compute_lab."))
    .join('\n'),
);
for (const parserWord of ['node_type', 'BinOp', 'BoolOp', 'Compare', 'Subscript', 'col_offset', 'end_lineno']) {
  for (const [index, strings] of labStrings.entries())
    assert.doesNotMatch(strings, new RegExp(parserWord), `#3: ${localeNames[index]} must not name ${parserWord}`);
}
assert.doesNotMatch(
  screen,
  /node_type/,
  '#3: the screen cannot print an AST class name it is never given',
);
assert.doesNotMatch(
  normalizer,
  /node_type/,
  '#3: an AST class name that never crosses the wire cannot leak to the player',
);
assert.doesNotMatch(runner, /"node_type"/, '#3: the runner reports what execution did, not which class did it');
assert.doesNotMatch(
  screen,
  /source_location|col_offset\}/,
  '#3: byte offsets are a debugger detail and are no longer rendered',
);

// ── R-21 #10: five terminal states, five explanations, five next actions ────
const TERMINAL_STATUSES = ['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected'];
for (const [index, locale] of locales.entries()) {
  const explanations = new Set();
  const actions = new Set();
  for (const status of TERMINAL_STATUSES) {
    const explanation = translation(locale, `compute_lab.outcome.${status}`);
    const action = translation(locale, `compute_lab.outcome_action.${status}`);
    assert.ok(explanation, `#10: ${localeNames[index]} must explain the ${status} outcome`);
    assert.ok(action, `#10: ${localeNames[index]} must give the ${status} outcome a next action`);
    assert.doesNotMatch(explanation, new RegExp(status), `#10: ${status} must not show its own raw status word`);
    explanations.add(explanation);
    actions.add(action);
  }
  assert.equal(explanations.size, TERMINAL_STATUSES.length, `#10: ${localeNames[index]} explanations must all differ`);
  assert.equal(actions.size, TERMINAL_STATUSES.length, `#10: ${localeNames[index]} next actions must all differ`);
}
assert.match(screen, /data-testid="compute-lab-outcome"/);
assert.match(screen, /compute_lab\.outcome\.\$\{terminal\}/);
assert.match(screen, /compute_lab\.outcome_action\.\$\{terminal\}/);
assert.doesNotMatch(
  screen,
  /\$\{run\.status\}|run\.status\}\s*·/,
  '#10: the raw status word is never rendered',
);

// ── R-21 #7, a release blocker on its own ──────────────────────────────────
for (const [index, locale] of locales.entries()) {
  const finished = translation(locale, 'compute_lab.outcome.trace_ready');
  const stopped = translation(locale, 'compute_lab.outcome.limit');
  assert.notEqual(finished, stopped, `#7: ${localeNames[index]} must not describe both the same way`);
  for (const sentence of [finished, stopped, translation(locale, 'compute_lab.outcome_action.limit')])
    assert.doesNotMatch(
      sentence,
      /1,?200/,
      `#7: ${localeNames[index]} must not require the reader to know what 1,200 means`,
    );
}
// #8's in-scope half: the loop it was in, its iteration count, the last line.
assert.match(screen, /compute_lab\.outcome_stopped_in/);
assert.match(screen, /compute_lab\.outcome_last_line/);
assert.match(screen, /lastRepetition/);

// ── R-21 #1: a finished run opens on the frame the player came for ─────────
assert.match(screen, /function landingFrame/);
assert.match(screen, /lastIndexOfKind\(frames, 'result'\)/, "#1: a successful run lands on its return");
assert.match(
  screen,
  /frames\[index\]\.source !== undefined\) return index/,
  '#10: a stopped run lands on the last step that names the player\'s code, not the terminal marker',
);

// ── R-21 #15: the only irreversible button states its price first ─────────
assert.match(screen, /data-testid="compute-lab-submit-cost"/);
assert.match(screen, /data-testid="compute-lab-cooldown"/);
assert.match(screen, /cooldownRemaining > 0/);
assert.match(server, /getComputeLabSubmitCost/);
for (const [index, locale] of locales.entries())
  for (const key of ['submit_cost', 'cooldown_remaining'])
    assert.ok(translation(locale, `compute_lab.${key}`), `#15: ${localeNames[index]} is missing ${key}`);

// ── R-21 #11 and #12: calls read as calls, and depth is summarised ─────────
assert.match(screen, /data-testid="compute-lab-call-stack"/, '#12: the call chain is shown, not inferred');
assert.match(screen, /function CallStack/);
assert.match(
  screen,
  /stack\s*\n?\s*\.slice\(1, -1\)/,
  '#12: only the outermost and the innermost are listed; the middle is a count',
);
assert.match(normalizer, /normalizeCallStack/, 'the call chain fails closed on a malformed shape, like a location');
assert.match(runner, /MAX_STACK_ENTRIES/, 'the runner chooses how much of the chain to show');
assert.ok(
  Number(normalizer.match(/MAX_CALL_STACK_ENTRIES = (\d+)/)[1]) >
    Number(runner.match(/^MAX_STACK_ENTRIES = (\d+)$/m)[1]),
  'the transport bound is looser than the presentation cap, so a runner that shows more is unfamiliar, not fatal',
);
assert.match(
  runner,
  /entries\[-1\]\["count"\] = entries\[-1\]\.get\("count", 1\) \+ 1/,
  '#12: adjacent identical calls collapse in the runner, so recursion never crosses the wire as a wall',
);
assert.match(
  runner,
  /def player_code_objects/,
  '#11: a helper is traced by its own code object, not by a single `solution` identity check',
);

// ── the sandbox locks, which this file also has to be able to see ──────────
assert.match(runner, /attribute access is not allowed/);
assert.match(
  runner,
  /isinstance\(node\.func, ast\.Name\)/,
  'the callee lock still requires a bare name; only *which* names widened',
);
assert.match(
  runner,
  /is a helper function and cannot be reassigned/,
  'a `def` name is bound once, which is why calling one adds no reachable value',
);
assert.match(runner, /class TraceLimit\(BaseException\)/, 'the event cap is not catchable by player code');
assert.match(runner, /ALLOWED_EXCEPTIONS/);
assert.doesNotMatch(
  runner,
  /"BaseException"|"SystemExit"|"KeyboardInterrupt"/,
  'only Exception subclasses are catchable, which is the other half of the uncatchable cap',
);

// ── "not hardcoded", as a property of each layer ───────────────────────────
assert.match(
  normalizer,
  /kind: string/,
  'an unfamiliar kind must reach the screen; only a malformed shape fails closed',
);
assert.match(normalizer, /FRAME_PROPERTIES/, 'shape still fails closed on an unknown property');
assert.match(normalizer, /maxValueBytes/, 'the declared byte budget is actually enforced');
assert.doesNotMatch(
  runner,
  /def visit_(If|While|For|With|Try)\b/,
  'blocks are derived from a node\'s own fields, not from a method per construct',
);
assert.match(runner, /_roles/);
assert.match(runner, /REPEATING_STATEMENTS/);
// The zero-frame timeout hole: a killed run still hands over what it produced.
assert.match(daemon, /_read_trace_stream/);
assert.match(daemon, /TimeoutExpired as expired/);
assert.match(daemon, /_publish_compute_lab_frames\(run_id, frames\)/);
assert.doesNotMatch(daemon, /"phase"/, 'the daemon reports the same semantic kind the runner does');

// ── every player-facing key exists in every locale ────────────────────────
const REQUIRED_KEYS = [
  'task_load_failed',
  'connection_lost',
  'run_start_failed',
  'submit_correct',
  'submit_wrong',
  'submit_failed',
  'submit_cost',
  'cooldown_remaining',
  'node_solve_count',
  'operators_progress',
  'operators_completed',
  'old_trace',
  'invalid_trace_frame',
  'step_position',
  'step.value',
  'step.binding',
  'step.block_enter',
  'step.block_exit',
  'step.decision',
  'step.repetition',
  'step.unwind',
  'step.step',
  'step.result',
  'step.unknown',
  'step.error',
  'step.limit',
  'detail.iteration',
  'detail.bindings',
  'detail.outcome',
  'detail.taken',
  'detail.error',
  'value.body',
  'value.alternative',
  'value.none',
  'outcome_stopped_in',
  'outcome_last_line',
  'stack.title',
  'stack.more',
  'stack.repeat',
  // R-33 #36: every string the stage can say exists in every locale the build
  // ships, not only in the two the issue happened to name.
  'stage.variables',
  'stage.loops',
  'stage.no_variables',
  'stage.more',
  'stage.fewer',
  'stage.expand_value',
  'stage.collapse_value',
  'stage.truncated',
  'stage.changed',
  'stage.churning',
  'stage.frozen',
  'stage.depth',
  'stage.inner_ran',
  'stage.iteration',
  'stage.iteration_of',
  'stage.length_unknown',
  'stage.scrub_loop',
  'stage.unwatched',
  // R-42 #3: the track's own second reference point, named where it appears.
  'stage.watched_to',
  'play',
  'pause',
  'pace_read',
  'pace_fast',
  'announcement',
  'announce_loop',
  'announce_loop_open',
  'announce_changed',
  'announce_unchanged',
];
// R-33 §3: the five ways a track ends are five words. A state a locale cannot
// say is a state that reads as colour alone in that locale.
for (const end of ['finished', 'early', 'running', 'cut', 'broke']) REQUIRED_KEYS.push(`stage.end.${end}`);
for (const key of REQUIRED_KEYS)
  for (const [index, locale] of locales.entries())
    assert.ok(translation(locale, `compute_lab.${key}`), `${localeNames[index]} is missing compute_lab.${key}`);

// The seven semantic words the runner can emit, and the fallback that makes the
// closed set safe to leave closed.
const runnerKinds = runner.match(/^CONTROL_KINDS = frozenset\(\{([^}]*)\}\)/m)[1].match(/"([a-z_]+)"/g);
for (const quoted of runnerKinds) {
  const kind = quoted.slice(1, -1);
  for (const [index, locale] of locales.entries())
    assert.ok(
      translation(locale, `compute_lab.step.${kind}`),
      `${localeNames[index]} has no word for the ${kind} step`,
    );
}
assert.equal(runnerKinds.length, 7, 'seven semantic kinds; a new construct is an arrangement of these, not an eighth');


// ── R-33: the stage keys on `kind`, and every state also carries a word ─────
const stageModel = readFileSync(new URL('../packages/ui/src/components/computeLab/stageModel.ts', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../packages/ui/src/components/computeLab/stage.tsx', import.meta.url), 'utf8');
for (const parserWord of ['node_type', 'BinOp', 'BoolOp', 'Compare', 'Subscript', 'ast.For', 'ast.While'])
  for (const [name, file] of [['stageModel', stageModel], ['stage', stage]])
    assert.doesNotMatch(file, new RegExp(parserWord), `the ${name} may key on kind, never on syntax: ${parserWord}`);
assert.match(stageModel, /frame\.kind === 'repetition'/, 'a track exists because execution repeated, not because a `for` was written');
assert.match(stageModel, /frame\.kind !== 'block_exit'/, 'a track closes on the scope closing, whatever opened it');
assert.doesNotMatch(
  stage,
  /kind === 'For'|isFor|isWhile|LOOP_KINDS/,
  'there is no per-construct branch in the stage, which is what makes an unanticipated repeat draw a track',
);
// #24: no invented total. An unmeasurable loop has no end number anywhere.
// #24: an unknown length is stated in words, never as a number — and the words
// sit under the track with the other end words rather than in the numeric
// gutter, which is one number wide and wrapped the sentence into six lines.
assert.match(stage, /measured && <div[^>]*>\{extent\}<\/div>/, '#24: the gutter carries a number or nothing');
assert.match(
  stage,
  /\{!measured && <div[^>]*>\{t\('compute_lab\.stage\.length_unknown'\)\}<\/div>\}/,
  '#24: and an unmeasurable loop says so in words where there is room to read them',
);
assert.match(stage, /if \(target > observed\) return;/, '#26: the unwatched remainder is inert, not clamped');
// #33: motion is a layer over an already-correct screen, removable with nothing lost.
assert.match(stage, /usePrefersReducedMotion/);
assert.match(styles, /prefers-reduced-motion: reduce\) \{\s*\n\s*\[data-testid='compute-lab-stage'\]/, '#33: reduced motion is enforced in CSS too, not only in a hook');
// ── R-42: the stage at 1280x720, and the two reference points on one screen ──
// #1: a track's height is the room the stage turned out to have, not a constant
// the layout is then asked to accommodate. The end states are the answer to "why
// did it stop"; a height chosen in the source puts them below the fold.
assert.match(stage, /export function useAvailableHeight/, 'R-42 #1: the room for the tracks is measured, not assumed');
assert.match(stage, /export function trackGeometry/, 'R-42 #1: the height that fits a nested pair is solved for, not constant');
assert.doesNotMatch(stage, /height: TRACK_HEIGHT,/, 'R-42 #1: no rail is drawn at a fixed height');
assert.match(screen, /available=\{tracksHeight\}/, 'R-42 #1: the screen tells the tracks how much room they have');
assert.match(
  screen,
  /const \[tracksRef, tracksHeight\] = useAvailableHeight\(\)/,
  'R-42 #1: and it measures that room from a box whose height does not depend on the tracks inside it',
);
// #2: the inner track hangs off the outer marker. A sibling laid out beside it
// says the two loops are peers, which is false — an inner loop is a different
// instance on every outer iteration.
assert.match(
  stage,
  /data-testid="compute-lab-track-attached"/,
  'R-42 #2: the inner track is attached to the outer marker, not laid out beside it',
);
assert.match(stage, /attachedTop/, 'R-42 #2: and it is attached at the marker position, pinned only when it would not fit');
// #3: the marker's number and the unwatched count are different reference points.
assert.match(
  stage,
  /compute_lab\.stage\.watched_to/,
  'R-42 #3: the track names the iteration its unwatched count is measured from',
);
// #4: an assignment does not restate its own boxes in the transport's dict syntax.
assert.match(
  screen,
  /function boxesAlreadyHold/,
  'R-42 #4: `bindings` is dropped where a box provably says it, not wherever a kind suggests one would',
);
// #5: the loop variable at the marker is the mockup's three-part box.
assert.match(
  stage,
  /function LoopVariableBox[\s\S]*?<Box\b/,
  'R-42 #5: the loop variable is the same box as every other variable, because it is the same kind of thing',
);

// #37: the announcement says the step, the loop position and what changed.
for (const part of ['{step}', '{action}', '{loop}', '{changed}'])
  assert.ok(translation(locales[0], 'compute_lab.announcement').includes(part), `#37: the announcement must carry ${part}`);
assert.match(screen, /data-testid="compute-lab-announcement"/);
assert.match(screen, /role="status" data-testid="compute-lab-announcement"/, '#37: the announcement is a live region');

console.log(
  `focused Compute Lab contract passed (${runnerKinds.length} semantic kinds, ${TERMINAL_STATUSES.length} explained terminal states)`,
);
