/*
 * The stage at 1280x720, against the running build.
 *
 * R-33 #37 was verified as `scrollWidth === clientWidth`, which is horizontal
 * overflow only — so a track whose end ran off the *bottom* of a 720px viewport
 * passed the criteria while hiding the five end states the track exists to
 * carry. This drives the real Lab in a real browser, runs five programs through
 * the real Code Server, and asserts at four viewports that every track's end is
 * on screen without scrolling, and that the words above the stage did not pay
 * for it.
 *
 * Needs `pnpm verify:lab-host` on 4800, a UI dev server, and a Chrome started
 * with `--remote-debugging-port=9222`. Not part of the test suite: it needs a
 * browser and a live runtime, which is exactly why the gap it closes existed.
 */
import assert from 'node:assert/strict';
import { attach, sleep } from './cdp.mjs';

const url = process.env.NETCRAWL_UI_URL || 'http://localhost:5173/';
const shots = process.env.NETCRAWL_SHOT_DIR || '.';
const page = await attach(url);

const PROGRAMS = {
  nested: `class ProblemSolver:
    def solution(self, a, b):
        c = 0
        for i in range(30):
            for j in range(3):
                c = c + 1
        return c
`,
  deep: `class ProblemSolver:
    def solution(self, a, b):
        c = 0
        for i in range(4):
            for j in range(3):
                for k in range(2):
                    c = c + 1
        return c
`,
  open: `class ProblemSolver:
    def solution(self, a, b):
        n = 0
        while n < 12:
            n = n + 1
        return n
`,
  truncated: `class ProblemSolver:
    def solution(self, a, b):
        t = 0
        for i in range(10000):
            t = t + i
        return t
`,
  broke: `class ProblemSolver:
    def solution(self, a, b):
        c = 0
        for i in range(30):
            c = c + b // (a - a)
        return c
`,
};

const VIEWPORTS = [
  [1280, 720, 'the viewport the criteria name'],
  [1280, 900, 'a taller window'],
  [1280, 620, 'shorter than the criteria name'],
  [1024, 720, 'a narrow window, where a nested pair is wider than its column'],
];

const waitFor = async (expression, label, tries = 120) => {
  for (let attempt = 0; attempt < tries; attempt++) {
    if (await page.evaluate(expression)) return true;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
};

const frameCount = `Number(document.querySelector('input[type="range"]')?.max ?? -1)`;

const enterLab = async () => {
  await page.evaluate(`(() => { document.body.click(); return 1 })()`);
  await sleep(800);
  await page.evaluate(
    `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip tutorial'); if (b) b.click(); return 1 })()`,
  );
  await sleep(1200);
  await page.evaluate(`
    (() => {
      const node = document.querySelector('[data-id="e_op_add"]');
      const box = node.getBoundingClientRect();
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }));
      return 1;
    })()
  `);
  await sleep(1000);
  await page.evaluate(
    `(() => { [...document.querySelectorAll('button')].find(x => /ENTER COMPUTE LAB/i.test(x.textContent)).click(); return 1 })()`,
  );
  await waitFor(`!!document.getElementById('compute-lab-editor')`, 'the Lab');
  await waitFor(
    `![...document.querySelectorAll('button')].find(b => /^RUN$/i.test(b.textContent.trim()))?.disabled`,
    'a loaded task and a live Code Server',
  );
};

const runSource = async source => {
  // Typed through the browser's own input pipeline rather than assigned: a value
  // written past React's tracker leaves the editor showing one program and the
  // run executing another, which is how the first draft of this traced the
  // starter source and reported it as a pass.
  await page.evaluate(
    `(() => { const e = document.getElementById('compute-lab-editor'); e.focus(); e.setSelectionRange(0, e.value.length); return 1 })()`,
  );
  await page.send('Input.insertText', { text: source });
  await sleep(300);
  const typed = await page.evaluate(`document.getElementById('compute-lab-editor').value`);
  assert.equal(typed.trim(), source.trim(), 'the editor holds the program under test');

  const before = await page.evaluate(frameCount);
  await page.evaluate(
    `(() => { [...document.querySelectorAll('button')].find(b => /^RUN$/i.test(b.textContent.trim())).click(); return 1 })()`,
  );
  // A run is over when the panel says so, not when *a* track exists — the
  // previous run's track is still on screen the moment RUN is pressed.
  await waitFor(`${frameCount} !== ${before}`, 'a new trace');
  await waitFor(`!!document.querySelector('[data-testid="compute-lab-outcome"]')`, 'a terminal outcome');
  await sleep(800);
};

const seekFraction = async fraction => {
  await page.evaluate(`
    (() => {
      const slider = document.querySelector('input[type="range"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(slider, String(Math.floor(slider.max * ${fraction})));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);
  await sleep(600);
};

/**
 * Visibility measured against the box an element actually sits in, not the
 * window: something clipped by a scroll container still reports a rect inside
 * the viewport, which is the shape of mistake this whole issue is about.
 */
const MEASURE = `
  (() => {
    const view = { width: innerWidth, height: innerHeight };
    const clipped = (node, box) => {
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.overflowY === 'visible' && style.overflowX === 'visible') continue;
        const bounds = parent.getBoundingClientRect();
        if (box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1) return true;
      }
      return box.top < -1 || box.bottom > view.height + 1;
    };
    const seen = node => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        text: node.textContent.trim().slice(0, 80),
        visible: !clipped(node, box),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
      };
    };
    const loops = document.querySelector('[data-testid="compute-lab-loops"]');
    const dialog = document.querySelector('[role="dialog"]');
    const stage = document.querySelector('[data-testid="compute-lab-stage"]');
    const upper = stage ? stage.previousElementSibling : null;
    const tracksBox = loops ? loops.parentElement : null;
    return {
      view,
      ends: [...document.querySelectorAll('[data-testid="compute-lab-track-end"]')].map(node => ({
        end: node.dataset.end,
        ...seen(node),
      })),
      tracks: document.querySelectorAll('[data-testid="compute-lab-track-end"]').length,
      attached: document.querySelectorAll('[data-testid="compute-lab-track-attached"]').length,
      sliders: document.querySelectorAll('[data-testid="compute-lab-loops"] [role="slider"]').length,
      loopBoxes: document.querySelectorAll(
        '[data-testid="compute-lab-loops"] [data-testid="compute-lab-variable"]',
      ).length,
      step: seen(document.querySelector('[data-testid="compute-lab-step"]')),
      outcome: seen(document.querySelector('[data-testid="compute-lab-outcome"]')),
      panelText: document.querySelector('[data-testid="compute-lab-step"]').innerText,
      loopsText: loops ? loops.innerText.split(String.fromCharCode(10)).join(' | ') : '',
      pageScrolls: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight,
      horizontal: { scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth },
      tracksScrollY: tracksBox ? tracksBox.scrollHeight > tracksBox.clientHeight : null,
      upperScrolls: upper ? upper.scrollHeight > upper.clientHeight : null,
    };
  })()
`;

const failures = [];
const check = (label, condition, detail) => {
  if (!condition) failures.push(`${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
};

await page.resize(1280, 720);
await sleep(1500);
await enterLab();

for (const [name, source] of Object.entries(PROGRAMS)) {
  await page.resize(1280, 720);
  await sleep(400);
  await runSource(source);
  // Mid-run, so a nested pair is live and the outer marker is off its own start.
  if (name === 'nested' || name === 'deep') await seekFraction(0.35);

  for (const [width, height, why] of VIEWPORTS) {
    await page.resize(width, height);
    await sleep(700);
    const state = await page.evaluate(MEASURE);
    const at = `${name} @ ${width}x${height} (${why})`;

    // #1 — the defect this issue opens with.
    for (const end of state.ends) check(`#1 ${at}: track end "${end.end}" is off screen`, end.visible, end);
    check(`#1 ${at}: the tracks had to scroll vertically`, state.tracksScrollY !== true);
    check(`${at}: the page grew past the window`, !state.pageScrolls);
    check(
      `R-21 #17 ${at}: the dialog scrolls horizontally`,
      state.horizontal.scrollWidth <= state.horizontal.clientWidth,
      state.horizontal,
    );
    // The words above the stage are a scroll region and can be scrolled back to.
    // At the viewport this issue is about, they must not have to be.
    if (width === 1280 && height === 720) {
      check(`${at}: the step card was pushed out of its own box`, state.step.visible, state.step);
      check(`${at}: the outcome was pushed out of its own box`, state.outcome.visible, state.outcome);
      check(`${at}: the words above the stage scroll`, state.upperScrolls === false);
    }

    // #4 — no assignment restates its own boxes in the transport's dict syntax.
    check(`#4 ${at}: a dict repr reached the player`, !state.panelText.includes("{'"), state.panelText.slice(0, 160));
    check(`#4 ${at}: "Now holding" on a frame whose boxes already say it`, !state.panelText.includes('Now holding'));

    // #2 — the inner track hangs off the outer marker rather than beside it.
    if (name === 'nested' || name === 'deep') {
      check(`#2 ${at}: no inner track attached to the outer marker`, state.attached === 1, state.attached);
      check(`#2 ${at}: not exactly two tracks drawn`, state.tracks === 2, state.tracks);
    }
    // R-33 #29: three deep is two tracks and a count, never three.
    if (name === 'deep')
      check(
        `#29 ${at}: the middle loop is not summarised as a count`,
        state.loopsText.includes('in between'),
        state.loopsText,
      );
    // R-33 #24: no invented total on an unmeasurable loop.
    if (name === 'open')
      check(
        `#24 ${at}: an unmeasurable loop must say so in words`,
        state.loopsText.includes('not known'),
        state.loopsText,
      );
    // #3 — the unwatched count names the repeat it is measured from.
    if (name === 'truncated') {
      check(
        `#3 ${at}: no second reference point named`,
        state.loopsText.includes('watched up to repeat'),
        state.loopsText,
      );
      check(
        `${at}: the cut end was lost`,
        state.ends.some(end => end.end === 'cut'),
        state.ends,
      );
    }
    if (name === 'broke')
      check(
        `R-33 #35 ${at}: the broken track lost its end`,
        state.ends.some(end => end.end === 'broke'),
        state.ends,
      );
    // #5 — the loop's own variable is the same three-part box as every other.
    if (name !== 'open')
      check(`#5 ${at}: the loop variable is not a name/value/type box`, state.loopBoxes > 0, state.loopBoxes);
    // R-33 #37: every track is still a keyboard-reachable scrubber.
    check(`#37 ${at}: a track lost its slider`, state.sliders === state.tracks, state);

    if (width === 1280 && height === 720) await page.screenshot(`${shots}/stage-${name}-1280x720.png`);
    else if (name === 'nested') await page.screenshot(`${shots}/stage-nested-${width}x${height}.png`);
  }
}

// ── R-33 #33: reduced motion removes the motion and none of the facts ───────
await page.resize(1280, 720);
await page.send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
});
await sleep(900);
const still = await page.evaluate(MEASURE);
for (const end of still.ends) check('#33 reduced motion: track end off screen', end.visible, end);
check(
  '#33 reduced motion: a transition survived on the stage',
  await page.evaluate(`
    [...document.querySelectorAll('[data-testid="compute-lab-loops"] *')]
      .every(node => getComputedStyle(node).transitionDuration === '0s')
  `),
);
await page.screenshot(`${shots}/stage-reduced-motion-1280x720.png`);
await page.send('Emulation.setEmulatedMedia', { features: [] });

await page.close();
if (failures.length) {
  console.error(`stage layout verification FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  x ${failure}`);
  process.exit(1);
}
console.log(
  `stage layout verification passed: ${Object.keys(PROGRAMS).length} programs x ${VIEWPORTS.length} viewports, plus reduced motion`,
);
