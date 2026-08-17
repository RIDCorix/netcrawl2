/*
 * Screenshots of the Lab at 1280x720, against the running build.
 *
 * Takes the three shots R-45 asks for plus one outside panel to hold them
 * against, under a label so a before/after pair can be laid side by side.
 * Same driving recipe as `verify-stage-layout.mjs`; this one only looks.
 */
import { attach, sleep } from './cdp.mjs';

const url = process.env.NETCRAWL_UI_URL || 'http://localhost:5173/';
const shots = process.env.NETCRAWL_SHOT_DIR || '.';
const label = process.env.NETCRAWL_SHOT_LABEL || 'after';
const page = await attach(url);

const NESTED = `class ProblemSolver:
    def solution(self, a, b):
        total = 0
        for i in range(30):
            for j in range(3):
                total = total + i * j
        return total
`;

const step = message => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);

const waitFor = async (expression, what, tries = 80) => {
  for (let attempt = 0; attempt < tries; attempt++) {
    if (await page.evaluate(expression)) return true;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}`);
};

const frameCount = `Number(document.querySelector('input[type="range"]')?.max ?? -1)`;

await page.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 720,
  deviceScaleFactor: 2,
  mobile: false,
});

/*
 * The Lab is shot first, from the tutorial's opening state.
 *
 * Order is load-bearing: the deploy stages install a click guard that swallows
 * clicks on the map, so the node has to be reached before the tutorial advances
 * past the cold open. The outside panel is therefore captured last, after this
 * run has deliberately walked the tutorial forward to a stage that draws one.
 */
step('clicked into the game');
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
step('entering the Lab');
await waitFor(`!!document.getElementById('compute-lab-editor')`, 'the Lab');
await waitFor(
  `![...document.querySelectorAll('button')].find(b => /^RUN$/i.test(b.textContent.trim()))?.disabled`,
  'a loaded task and a live Code Server',
);
await sleep(600);
step('shot 1: Lab on open');
await page.screenshot(`${shots}/${label}-1-lab-on-open.png`);

await page.evaluate(
  `(() => { const e = document.getElementById('compute-lab-editor'); e.focus(); e.setSelectionRange(0, e.value.length); return 1 })()`,
);
await page.send('Input.insertText', { text: NESTED });
await sleep(300);
const before = await page.evaluate(frameCount);
await page.evaluate(
  `(() => { [...document.querySelectorAll('button')].find(b => /^RUN$/i.test(b.textContent.trim())).click(); return 1 })()`,
);
step('ran the nested program, waiting for a trace');
await waitFor(`${frameCount} !== ${before}`, 'a new trace');
await waitFor(`!!document.querySelector('[data-testid="compute-lab-outcome"]')`, 'a terminal outcome');
await sleep(900);

// Mid-scrub, on a step whose card is actually showing a highlighted range —
// a shot of `mark` has to contain a `mark`, so it is sought rather than hoped
// for. Nested tracks are on screen at the same step, so one seek serves both.
const seek = async fraction => {
  await page.evaluate(`
    (() => {
      const slider = document.querySelector('input[type="range"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(slider, String(Math.floor(slider.max * ${fraction})));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);
  await sleep(500);
};

let landed = null;
for (const fraction of [0.45, 0.5, 0.4, 0.55, 0.35, 0.6, 0.3, 0.65, 0.7]) {
  await seek(fraction);
  const state = await page.evaluate(`
    (() => ({
      mark: !!document.querySelector('[data-testid="compute-lab-step"] mark'),
      tracks: document.querySelectorAll('[data-testid="compute-lab-track-end"]').length,
      attached: document.querySelectorAll('[data-testid="compute-lab-track-attached"]').length,
    }))()
  `);
  if (state.mark && state.attached > 0) {
    landed = { fraction, ...state };
    break;
  }
}
step('seeking for a step with a highlight and a nested track');
if (!landed) throw new Error('never found a step with both a highlighted range and a nested track');
await sleep(400);
await page.screenshot(`${shots}/${label}-2-trace-card-with-mark.png`);

const measured = await page.evaluate(`
  (() => {
    const mark = document.querySelector('[data-testid="compute-lab-step"] mark');
    const style = mark ? getComputedStyle(mark) : null;
    return JSON.stringify({
      markBackground: style?.backgroundColor,
      markColor: style?.color,
      markBorderLeft: style?.borderLeftWidth + ' ' + style?.borderLeftColor,
      tracks: document.querySelectorAll('[data-testid="compute-lab-track-end"]').length,
      attached: document.querySelectorAll('[data-testid="compute-lab-track-attached"]').length,
      panelFont: getComputedStyle(document.querySelector('[data-testid="compute-lab-step"]')).fontFamily,
    });
  })()
`);
console.log(`shot at fraction ${landed.fraction}: ${measured}`);

/*
 * The outside panel, last.
 *
 * The pair the issue asks for needs a shot of the game that is not the Lab, and
 * it has to be a real one: the tutorial is walked forward through the server's
 * own stage endpoint until it draws the deploy dialog over the map, rather than
 * hiding an overlay to photograph what is behind it.
 */
step('closing the Lab and walking the tutorial to a panel');
await page.evaluate(
  `(() => { const b = [...document.querySelectorAll('button')].find(x => /^EXIT$/i.test(x.textContent.trim())); if (b) b.click(); return 1 })()`,
);
await sleep(600);
const advance = async to =>
  page.evaluate(`
    (async () => {
      const r = await fetch('/api/tutorial/chapter-zero/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: ${JSON.stringify(to) === '"skip"' ? "'skip'" : "'advance'"}, to: ${JSON.stringify(to)} }),
      });
      const body = await r.json();
      return body.stage;
    })()
  `);
await advance('skip');
for (const stage of ['hello_deploy_open', 'hello_deploy_confirm']) {
  const reached = await advance(stage);
  if (reached !== stage) console.log(`tutorial stopped at ${reached}, wanted ${stage}`);
}
await page.send('Page.reload', {});
await sleep(4000);
await waitFor(`!!document.querySelector('.chapter0-deploy-guide')`, 'the deploy panel');
await sleep(900);
step('shot 3: outside panel (deploy dialog + guide over the map)');
await page.screenshot(`${shots}/${label}-3-outside-panel.png`);

console.log(`wrote ${label}-1, -2, -3 to ${shots}`);

await page.close();
process.exit(0);
