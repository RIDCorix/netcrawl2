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

// ── The frame's own fields, held by the compiler rather than by a scan ──────
/*
 * `detail` was only half the wire. `1a92eed` added `detail["loop"]` and
 * `frame["types"]` together, the 1.4.1 on PyPI emits neither, and `stage.tsx`
 * reads `frame?.types?.[name]` for the chip under every variable box — so that
 * chip was silently absent for every player too, on the same forgotten publish.
 * A contract over `detail` alone would have called R-50 closed with its second
 * face still live.
 *
 * These fields get a better check than a regex. `ComputeLabFrame` declares them,
 * so reading one it does not name is a compile error, and CI compiles the UI —
 * `pnpm --filter @netcrawl/desktop build` runs `pnpm --filter ui build`, which is
 * `tsc && vite build`. All that is missing is the link from that interface to the
 * runner, which is this: the two must name the same set. Adding a field to the
 * interface then forces `sinceVersion`, the floor, the starter lock and the
 * publish, instead of shipping a read of something nobody sends.
 */
/**
 * The interface's own field names, by brace depth rather than by regex.
 *
 * `error?: { message: string; … }` is nested, and a pattern loose enough to span
 * it picks up `message` as a frame field the moment someone wraps that line
 * across three — a red build whose message names a field nobody wrote. Depth is
 * the thing being asked about, so count it.
 */
function fieldsOfComputeLabFrame(source) {
  const opening = source.indexOf('{', source.indexOf('export interface ComputeLabFrame'));
  assert.notEqual(opening, -1, 'could not find interface ComputeLabFrame in gameStore.ts — teach this check');
  const fields = new Set();
  let depth = 0;
  for (let index = opening, lineStart = true; index < source.length; index++) {
    const character = source[index];
    if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return fields;
    else if (character === '\n') lineStart = true;
    else if (depth === 1 && lineStart && /\S/.test(character)) {
      lineStart = false;
      const declaration = source.slice(index).match(/^(\w+)\??:/);
      if (declaration) fields.add(declaration[1]);
    }
  }
  throw new Error('interface ComputeLabFrame is never closed');
}

const store = readFileSync(resolve('packages/ui/src/store/gameStore.ts'), 'utf8');
const declaredByUi = fieldsOfComputeLabFrame(store);
const declaredByRunner = new Set([
  ...contract.frame.required,
  ...contract.frame.optional,
  ...contract.frame.terminalOnly,
]);
assert.ok(declaredByUi.size > 5, `only parsed ${declaredByUi.size} fields off ComputeLabFrame — the parse broke`);
for (const bucket of ['required', 'optional', 'terminalOnly'])
  assert.ok(Array.isArray(contract.frame[bucket]), `frame.${bucket} must be a list`);
const overlap = contract.frame.required.filter(field => contract.frame.optional.includes(field));
assert.deepEqual(overlap, [], `frame declares ${overlap} as both required and optional`);

assert.deepEqual(
  [...declaredByUi].sort(),
  [...declaredByRunner].sort(),
  'interface ComputeLabFrame and frame_contract.json name different frame fields. A field the UI declares but no ' +
    'runner sends reaches production as a read of undefined — silently, exactly as detail.loop and frame.types did. ' +
    'Declare it in frame_contract.json, move sinceVersion to the release that will emit it, and raise ' +
    'MIN_PYTHON_SDK_VERSION to that release.',
);

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
  `Frame contract passed (declared since ${contract.sinceVersion}; ${declaredByRunner.size} frame fields agree with ` +
    `ComputeLabFrame; the Lab UI reads detail.${[...reads.keys()].sort().join(', detail.')})`,
);
