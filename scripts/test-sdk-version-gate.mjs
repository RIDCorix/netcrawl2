/*
 * R-32: an outdated runtime must be refused with one actionable sentence, and
 * the starter workspace must be installable at a version this server accepts.
 *
 * The second half is the check whose absence let this reach a player first:
 * every existing test either builds the SDK from the tree or shadows the
 * installed one with PYTHONPATH, so nothing resolved the version a fresh clone
 * actually gets against the version this server actually requires.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.NETCRAWL_BUNDLED = 'true';
const testDir = mkdtempSync(join(tmpdir(), 'netcrawl-sdk-version-gate-'));
const { startServer } = await import('../packages/server/.test-dist/index.js');
const { getGameState, saveGameState } = await import('../packages/server/.test-dist/domain/gameState.js');
const { MIN_PYTHON_SDK_VERSION, RUNTIME_PROTOCOL_VERSION, compareSdkVersions, isSupportedSdkVersion } = await import(
  '../packages/server/.test-dist/runtimeProtocol.js'
);
const { server, port } = await startServer({ port: 0, dataDir: testDir });
const base = `http://127.0.0.1:${port}/api`;
const request = async (path, body) => {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};

let failure;
try {
  // ── The comparator ────────────────────────────────────────────────────────
  assert.ok(compareSdkVersions('1.2.9', '1.3.1') < 0);
  assert.ok(compareSdkVersions('1.3.1', '1.3.1') === 0);
  assert.ok(compareSdkVersions('1.10.0', '1.9.0') > 0, 'versions compare numerically, not lexically');
  assert.ok(compareSdkVersions('2.0', '1.3.1') > 0, 'a shorter version still compares by component');
  for (const unusable of [undefined, null, '', 'latest', '1.3.1rc1', 1.31, {}])
    assert.equal(isSupportedSdkVersion(unusable), false, `a version this server cannot read fails closed: ${unusable}`);
  assert.equal(isSupportedSdkVersion(MIN_PYTHON_SDK_VERSION), true);

  // ── The gate ──────────────────────────────────────────────────────────────
  const refusals = [
    ['a runtime too old to declare a version', { protocolVersion: 2, sessionId: 'a', classes: [] }],
    ['a runtime declaring an outdated version', { protocolVersion: 2, sdkVersion: '1.2.3', sessionId: 'b', classes: [] }],
    [
      'a current protocol carrying an outdated SDK',
      { protocolVersion: RUNTIME_PROTOCOL_VERSION, sdkVersion: '1.2.8', sessionId: 'c', classes: [] },
    ],
    [
      'a current SDK speaking a protocol this server retired',
      { protocolVersion: 2, sdkVersion: MIN_PYTHON_SDK_VERSION, sessionId: 'd', classes: [] },
    ],
  ];
  for (const [reason, payload] of refusals) {
    const response = await request('/runtime/register', payload);
    assert.equal(response.status, 426, reason);
    assert.equal(response.body.reason, 'sdk_outdated', reason);
    // One sentence a player can act on: what is wrong, and the command that fixes it.
    assert.match(response.body.error, /netcrawl-sdk/, reason);
    assert.match(response.body.error, /uv sync --upgrade-package netcrawl-sdk/, reason);
    assert.match(response.body.error, new RegExp(MIN_PYTHON_SDK_VERSION.replace(/\./g, '\\.')), reason);
    assert.equal(response.body.error.trim().split('\n').length, 1, `${reason}: the refusal is one sentence`);
  }
  const declared = await request('/runtime/register', {
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    sdkVersion: '1.2.3',
    sessionId: 'e',
    classes: [],
  });
  assert.match(declared.body.error, /1\.2\.3/, 'the refusal names the version the player is actually running');

  // A refused runtime must never look connected. This is what stops a Lab run
  // from being queued for a runtime that would misread it: the player is told
  // to reconnect, instead of watching "step 1 of 0" forever.
  assert.equal((await request('/state')).body.codeServerConnected, false);
  const state = getGameState();
  saveGameState({
    ...state,
    nodes: state.nodes.map(node => (node.id === 'e_op_add' ? { ...node, data: { ...node.data, unlocked: true } } : node)),
  });
  const blockedRun = await request('/compute-lab/runs', {
    nodeId: 'e_op_add',
    taskId: 'any-task',
    source: 'return 1',
    revision: 1,
  });
  assert.equal(blockedRun.status, 409);
  assert.equal(blockedRun.body.reason, 'disconnected');

  const accepted = await request('/runtime/register', {
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    sdkVersion: MIN_PYTHON_SDK_VERSION,
    sessionId: 'current',
    classes: [],
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.ok, true);
  assert.equal((await request('/state')).body.codeServerConnected, true);

  // ── Every SDK in this repo declares what the server actually accepts ──────
  // The JS SDK carries its own copy of both constants. Without this check a
  // protocol bump would lock it out of its own server, silently.
  const jsSdk = readFileSync(resolve('packages/sdk-js/src/app.ts'), 'utf8');
  assert.equal(
    Number(jsSdk.match(/RUNTIME_PROTOCOL_VERSION = (\d+)/)?.[1]),
    RUNTIME_PROTOCOL_VERSION,
    'packages/sdk-js declares a protocol version this server would refuse',
  );
  assert.equal(
    isSupportedSdkVersion(jsSdk.match(/RUNTIME_SDK_VERSION = '([\d.]+)'/)?.[1]),
    true,
    'packages/sdk-js declares an SDK version this server would refuse',
  );
  const pythonSdkVersion = readFileSync(resolve('packages/sdk-python/netcrawl/version.py'), 'utf8').match(
    /__version__ = "([\d.]+)"/,
  )?.[1];
  assert.equal(
    isSupportedSdkVersion(pythonSdkVersion),
    true,
    `packages/sdk-python is ${pythonSdkVersion}, which its own server would refuse`,
  );

  // ── The floor is not below the frame shape the UI reads ───────────────────
  /*
   * R-50: `detail.loop` was added to the runner without moving the release
   * number, so the 1.4.1 on PyPI and the deployed UI disagreed about the frame
   * while both reporting 1.4.1 — the compare below returned 0, the runtime was
   * admitted, and the loop track was absent with nothing anywhere failing.
   *
   * `sinceVersion` names the release that first emits the declared shape. Holding
   * the floor at or above it is what makes the rest of this file load-bearing for
   * frames too: the starter's specifier and lock are then forced to that release,
   * and a release that was never published cannot be locked. So a shape change
   * that skips its publish now fails here instead of reaching a player.
   */
  const frameContract = JSON.parse(readFileSync(resolve('packages/sdk-python/frame_contract.json'), 'utf8'));
  assert.ok(
    compareSdkVersions(MIN_PYTHON_SDK_VERSION, frameContract.sinceVersion) >= 0,
    `this server accepts netcrawl-sdk ${MIN_PYTHON_SDK_VERSION}, but the Lab UI reads the frame shape that ` +
      `frame_contract.json declares from ${frameContract.sinceVersion}. Every player between those two versions ` +
      'gets a Lab that draws nothing and reports nothing — raise MIN_PYTHON_SDK_VERSION to ' +
      `${frameContract.sinceVersion}.`,
  );

  // ── The starter workspace resolves to a version this server accepts ───────
  const workspace = resolve(process.env.NETCRAWL_WORKSPACE_DIR || '../netcrawl-workspace');
  assert.equal(
    existsSync(workspace),
    true,
    `NETCRAWL_WORKSPACE_DIR must point to netcrawl-workspace: ${workspace}`,
  );

  const specifier = readFileSync(join(workspace, 'pyproject.toml'), 'utf8').match(
    /["']netcrawl-sdk\s*([^"']*)["']/,
  )?.[1];
  assert.ok(specifier !== undefined, "the starter workspace must depend on netcrawl-sdk");
  const clauses = specifier
    .split(',')
    .map(clause => clause.trim())
    .filter(Boolean)
    .map(clause => {
      const parsed = clause.match(/^(==|>=|<=|!=|<|>)\s*([\d.]+)$/);
      assert.ok(parsed, `unsupported version specifier "${clause}" — teach this check before using it`);
      return { operator: parsed[1], version: parsed[2] };
    });
  const admits = version =>
    clauses.every(({ operator, version: bound }) => {
      const order = compareSdkVersions(version, bound);
      if (operator === '==') return order === 0;
      if (operator === '!=') return order !== 0;
      if (operator === '>=') return order >= 0;
      if (operator === '<=') return order <= 0;
      if (operator === '>') return order > 0;
      return order < 0;
    });

  assert.equal(
    admits(MIN_PYTHON_SDK_VERSION),
    true,
    `the starter pins "netcrawl-sdk${specifier}", which cannot install the ${MIN_PYTHON_SDK_VERSION} this server requires`,
  );
  const older = MIN_PYTHON_SDK_VERSION.replace(/(\d+)$/, digits => String(Math.max(0, Number(digits) - 1)));
  assert.equal(admits(older), false, `the starter must not admit ${older}, which this server refuses`);
  // An exact pin is the defect this issue was filed about: it breaks on every
  // protocol bump and cannot be fixed from the player's side.
  const nextPatch = MIN_PYTHON_SDK_VERSION.replace(/(\d+)$/, digits => String(Number(digits) + 1));
  assert.equal(
    admits(nextPatch),
    true,
    `the starter must accept a future ${nextPatch} without an edit — "==" is what broke this`,
  );

  const lockVersion = readFileSync(join(workspace, 'uv.lock'), 'utf8')
    .split(/\[\[package\]\]/)
    .find(block => /name = "netcrawl-sdk"/.test(block))
    ?.match(/version = "([\d.]+)"/)?.[1];
  assert.ok(lockVersion, 'the starter workspace must lock a netcrawl-sdk version');
  // `uv sync --frozen` in the devcontainer installs the LOCK, not the range —
  // so the lock, not just the specifier, is what a fresh Codespace really gets.
  assert.equal(
    isSupportedSdkVersion(lockVersion),
    true,
    `uv.lock resolves netcrawl-sdk ${lockVersion}, which this server refuses (needs >= ${MIN_PYTHON_SDK_VERSION})`,
  );

  console.log(
    `SDK version gate passed (server requires >= ${MIN_PYTHON_SDK_VERSION}; starter pins "${specifier}", locked at ${lockVersion})`,
  );
} catch (error) {
  failure = error;
  console.error(error);
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(testDir, { recursive: true, force: true });
}

process.exit(failure ? 1 : 0);
