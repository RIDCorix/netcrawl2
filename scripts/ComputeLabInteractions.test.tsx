import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('packages/ui/src/components/ComputeLabScreen.tsx', 'utf8');

assert.match(source, /localStorage\.setItem/);
assert.match(source, /run\.revision !== revision/);
assert.match(source, /disabled=\{!run \|\| run\.status !== 'trace_ready' \|\| stale \|\| cooldownRemaining > 0\}/);
// R-21 #15: SUBMIT consumes the task either way, so its price is on screen
// before it is pressed, and the cooldown it starts is visible while it runs.
assert.match(source, /compute_lab\.submit_cost/);
assert.match(source, /compute_lab\.cooldown_remaining/);
assert.match(source, /setCooldownUntil\(Date\.now\(\) \+ task\.cost\.cooldownSeconds \* 1000\)/);
assert.match(source, /event\.key === 'Escape'/);
// R-33 #37: the scrubbers are how a player moves through their own run, so the
// Tab cycle has to contain them. A keyboard-only player who can reach RUN but
// not the timeline or a loop track cannot read the trace at all.
assert.match(source, /'button:not\(\[disabled\]\), textarea:not\(\[disabled\]\), input:not\(\[disabled\]\), \[role="slider"\]'/);
// Every seek goes through one function, and that function stops playback — which
// is what makes R-33 #32's "drag mid-animation lands immediately" true by
// construction rather than by timing.
assert.match(source, /const seek = \(target: number\) => \{\s*\n\s*setPlaying\(false\);/);
assert.match(source, /const landing = Math\.min\(Math\.max\(0, target\), Math\.max\(0, frames\.length - 1\)\);/);
// R-33 #31: adjacency is decided by the move itself, not derived after it — a
// re-render for some other reason must not re-arm motion the move ruled out.
assert.match(source, /setAdjacentStep\(Math\.abs\(landing - frameIndex\) === 1\);/);
assert.match(source, /data-animated=\{animated\}/);
assert.match(source, /onClick=\{\(\) => seek\(frameIndex - 1\)\}/);
assert.match(source, /onClick=\{\(\) => seek\(Math\.max\(0, \(run\?\.frames\.length \|\| 1\) - 1\)\)\}/);
assert.match(source, /onChange=\{event => seek\(Number\(event\.target\.value\)\)\}/);
// R-33 #32: at least two playback paces, because "a pace the player chooses" is
// not satisfied by one speed.
assert.match(source, /pace === 'read' \? 700 : 90/);
assert.match(source, /compute_lab\.pace_read/);
assert.match(source, /compute_lab\.pace_fast/);
console.log('Compute Lab draft, stale-submit, replay, playback, and focus contracts passed');
