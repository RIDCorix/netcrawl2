/* global console, process */
/*
 * The reader's half of `packages/sdk-python/frame_contract.json`: the UI may not
 * read a `detail` key nobody declares it will be sent.
 *
 * R-50 broke in the other direction — the runner emitted `detail.loop`, the
 * release number did not move, and the 1.4.1 on PyPI never emitted it, so
 * `indexLoops` skipped every repetition frame and the loop track was absent with
 * no error anywhere. The emitter's half is asserted in Python; the floor that
 * forces the publish is asserted in `test-sdk-version-gate.mjs`. What is left is
 * this direction: a `detail.somethingNew` added here reaches production as a
 * feature that silently does nothing, because an undeclared key is one the runner
 * has never promised to send.
 *
 * This is a source scan, deliberately: `ComputeLabFrame.detail` is
 * `Record<string, unknown>` on purpose — a runner reporting a key this build has
 * never heard of must still render it as a chip rather than vanish — so there is
 * no type for the compiler to check. A scan is what is left, and the guard
 * against a scan that quietly matches nothing is
 * `assertTheScanFoundTheKeyThisIssueWasAbout` at the end.
 *
 * Two things this cannot see, both stated so a green result is not read as more
 * than it is. A read is a bare key with no kind attached, so it is checked
 * against every key the contract declares for *any* kind rather than the kind it
 * will actually arrive on — deleting `loop` from `repetition.required` slips past
 * here, and that specific guarantee is held by name in `test_frame_contract.py`,
 * which asserts a `for` loop's frames carry it whatever the declaration says.
 * And a key reached some way none of the three patterns below match — through a
 * helper taking `detail` as a parameter, say — is not seen at all; the patterns
 * cover the forms these files actually use, and adding a fourth means teaching
 * this scan first.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const contract = JSON.parse(readFileSync(resolve('packages/sdk-python/frame_contract.json'), 'utf8'));

/* Files that turn a frame into what the player sees. A `detail` read anywhere
 * else in the UI would be outside the Lab and outside this contract. */
const READERS = [
  'packages/ui/src/components/ComputeLabScreen.tsx',
  'packages/ui/src/components/computeLab/stage.tsx',
  'packages/ui/src/components/computeLab/stageModel.ts',
];

// ── The declaration itself ──────────────────────────────────────────────────
const declared = new Set();
for (const [kind, keys] of Object.entries(contract.kinds)) {
  assert.deepEqual(Object.keys(keys).sort(), ['optional', 'required'], `${kind} must declare both required and optional`);
  for (const bucket of ['required', 'optional']) {
    assert.ok(Array.isArray(keys[bucket]), `${kind}.${bucket} must be a list`);
    assert.equal(new Set(keys[bucket]).size, keys[bucket].length, `${kind}.${bucket} repeats a key`);
    for (const key of keys[bucket]) declared.add(key);
  }
  const both = keys.required.filter(key => keys.optional.includes(key));
  assert.deepEqual(both, [], `${kind} declares ${both} as both required and optional`);
}
assert.match(contract.sinceVersion, /^\d+(\.\d+)*$/, 'sinceVersion must be a dotted release number');

// ── Every named `detail` read in the Lab UI ─────────────────────────────────
/*
 * Two forms reach a frame's detail, and both have to be found:
 *   frame.detail?.loop        — read straight off the frame
 *   const detail = frame.detail;  … detail?.loop
 * The second is why aliases are collected per file rather than assumed: the name
 * `detail` is also bound to an array of rendered entries in ComputeLabScreen, and
 * counting that array's `.length` as a frame key would fail this test for no
 * reason. An alias is only a name assigned *from* `.detail`.
 */
const reads = new Map(); // key → the files that read it
const record = (key, file) => reads.set(key, [...(reads.get(key) || []), file]);

for (const file of READERS) {
  const source = readFileSync(resolve(file), 'utf8');

  for (const match of source.matchAll(/\.detail\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g)) record(match[1], file);
  for (const match of source.matchAll(/\.detail\s*(?:\?\.)?\[\s*['"]([^'"]+)['"]\s*\]/g)) record(match[1], file);
  for (const match of source.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*(?::[^=\n]+)?=\s*[\w$?.]+\.detail\b/g))
    for (const name of match[1].split(',').map(part => part.split(':')[0].trim()).filter(Boolean)) record(name, file);

  const aliases = [...source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*[\w$?.]+\.detail\s*(?:;|$|\n)/gm)]
    .map(match => match[1]);
  for (const alias of new Set(aliases))
    for (const match of source.matchAll(new RegExp(`\\b${alias}\\s*(?:\\?\\.|\\.)\\s*([A-Za-z_$][\\w$]*)`, 'g')))
      record(match[1], file);
}

for (const [key, files] of [...reads].sort()) {
  assert.ok(
    declared.has(key),
    `${files.join(', ')} reads detail.${key}, which packages/sdk-python/frame_contract.json does not declare. ` +
      'Declare it there, move sinceVersion to the release that will emit it, and raise MIN_PYTHON_SDK_VERSION to ' +
      'that release — otherwise every player on an older runtime gets a screen that draws nothing and says nothing.',
  );
}

// ── The scan has to have worked ─────────────────────────────────────────────
function assertTheScanFoundTheKeyThisIssueWasAbout() {
  // A regex that matches nothing passes every assertion above. `loop` is the key
  // R-50 was filed about and the one the track cannot be drawn without, so its
  // absence from the scan means the scan broke, not that the UI stopped reading it.
  assert.ok(
    reads.has('loop'),
    'this scan found no detail.loop read in the Lab UI — either the track was removed, or the scan no longer matches ' +
      'how these files reach a frame. Fix the scan before trusting a green result from it.',
  );
}
assertTheScanFoundTheKeyThisIssueWasAbout();

console.log(
  `Frame contract passed (declared since ${contract.sinceVersion}; the Lab UI reads ${[...reads.keys()].sort().join(', ')})`,
);
