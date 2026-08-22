/* global process */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

process.env.NETCRAWL_MULTI_USER = 'true';
process.env.JWT_SECRET = 'editor-bridge-test-secret-that-is-long-enough';
process.env.NETCRAWL_BUNDLED = '1';

const extensionManifest = JSON.parse(fs.readFileSync('packages/vscode-extension/package.json', 'utf8'));
const extensionSource = fs.readFileSync('packages/vscode-extension/src/extension.ts', 'utf8');
for (const entry of ['main', 'browser']) {
  assert.equal(typeof extensionManifest[entry], 'string', `the VSIX must expose a ${entry} entry point`);
  assert.ok(
    extensionManifest.files.includes(extensionManifest[entry].replace(/^\.\//, '')),
    `the VSIX must include its ${entry} bundle`,
  );
}
assert.match(extensionSource, /createTextEditorDecorationType/);
assert.match(extensionSource, /latestLiveExecutionLocation/);
assert.match(extensionSource, /revealRange\(selection/);
assert.match(extensionSource, /activeExecutionRunId === runId/);
assert.match(extensionSource, /if \(ownedVisualization\)/);
assert.match(extensionSource, /if \(!activeExecutionRunId\) status\.text/);
assert.match(extensionSource, /clearExecutionHighlight\(\)/);
assert.match(extensionSource, /command\.type === 'run_problem'/);
assert.match(extensionSource, /registerTreeDataProvider\('netcrawl\.computeNodes'/);
assert.match(extensionSource, /\/api\/editor\/handoffs/);
assert.match(extensionSource, /'editor-handoff'/);
assert.doesNotMatch(extensionSource, /editor-handoff[^\n]+connection\.token/);
assert.ok(extensionManifest.files.includes('media/netcrawl.svg'));

const serverDist = path.resolve('packages/server/.test-dist');
const bridge = await import(pathToFileURL(path.join(serverDist, 'editorBridge.js')));
const tracker = await import(pathToFileURL(path.join(serverDist, 'codeServerTracker.js')));

bridge.resetEditorBridgeForTests();
const ticket = bridge.createEditorPairingTicket('user-a', 1_000, 'ABCD-2345');
assert.equal(ticket.code, 'ABCD-2345');
assert.deepEqual(bridge.consumeEditorPairingTicket('abcd 2345', 1_001), { ok: true, userId: 'user-a' });
assert.equal(bridge.consumeEditorPairingTicket('ABCD-2345', 1_002).reason, 'pairing_used');
bridge.createEditorPairingTicket('user-a', 1_000, 'WXYZ-6789');
assert.equal(bridge.consumeEditorPairingTicket('WXYZ-6789', ticket.expiresAt + 1).reason, 'pairing_expired');

const runtime = tracker.claimCodeServerLease(undefined, 'user-a');
assert.equal(runtime.ok, true);
const desktop = bridge.registerEditorSession(
  { sessionId: 'desktop-session', label: 'Desktop VS Code', kind: 'desktop', workspaceFolders: ['game'] },
  'user-a',
  2_000,
);
const codespace = bridge.registerEditorSession(
  { sessionId: 'codespace-session', label: 'GitHub Codespaces', kind: 'codespaces', workspaceFolders: ['cloud'] },
  'user-a',
  2_000,
);
assert.equal(bridge.listEditorSessions('user-a', 2_001).length, 2, 'multiple editors coexist');
assert.equal(
  tracker.claimCodeServerLease('different-runtime', 'user-a').reason,
  'code_server_conflict',
  'editor registration never changes the sole Code Server lease',
);

const relativePath = bridge.problemRelativePath('e_op_add', 'task-1');
assert.equal(relativePath, 'netcrawl/problems/e_op_add/task-1.py');
for (const unsafe of [
  '/etc/passwd',
  '../outside.py',
  'netcrawl/problems/../../outside.py',
  'netcrawl\\problems\\task.py',
  'netcrawl/problems//task.py',
  'other/problems/task.py',
]) {
  assert.equal(bridge.isSafeProblemRelativePath(unsafe), false, unsafe);
}
assert.equal(bridge.isSafeProblemRelativePath(relativePath), true);
assert.deepEqual(
  bridge.normalizeEditorSelection('one\ntwo\nthree', { lineno: 2, col_offset: 0, end_lineno: 2, end_col_offset: 3 }),
  {
    lineno: 2,
    col_offset: 0,
    end_lineno: 2,
    end_col_offset: 3,
  },
);
assert.equal(
  bridge.normalizeEditorSelection('one', { lineno: 1, col_offset: 0, end_lineno: 4, end_col_offset: 0 }),
  undefined,
);
assert.equal(
  bridge.normalizeEditorSelection('one', { lineno: 1, col_offset: 0, end_lineno: 1, end_col_offset: 4 }),
  undefined,
  'columns cannot extend beyond the selected source line',
);

const command = bridge.enqueueOpenProblem(
  {
    sessionId: desktop.id,
    nodeId: 'e_op_add',
    taskId: 'task-1',
    relativePath,
    source: 'class ProblemSolver:\n    pass\n',
    revision: 3,
  },
  'user-a',
  2_002,
);
assert.ok(command);
assert.equal(bridge.leaseEditorCommands(codespace.id, 'user-a', 2_003).length, 0, 'commands are targeted');
assert.equal(bridge.leaseEditorCommands(desktop.id, 'user-a', 2_003).length, 1);
assert.equal(
  bridge.getEditorProblemBinding(desktop.id, relativePath, 'user-a', 2_004),
  undefined,
  'a file is not bound until the editor confirms it opened',
);
assert.equal(bridge.getEditorProblemBinding(codespace.id, relativePath, 'user-a', 2_004), undefined);
assert.equal(
  bridge.acknowledgeEditorCommand(command.id, desktop.id, 'opened', undefined, 'user-a', 2_005).duplicate,
  false,
);
assert.equal(
  bridge.acknowledgeEditorCommand(command.id, desktop.id, 'opened', undefined, 'user-a', 2_006).duplicate,
  true,
);
assert.equal(bridge.getPublicEditorCommand(command.id, 'user-a').outcome, 'opened');
assert.equal(bridge.getEditorProblemBinding(desktop.id, relativePath, 'user-a', 2_007).taskId, 'task-1');
const handoff = bridge.createEditorHandoff(
  { sessionId: desktop.id, nodeId: 'e_op_add', taskId: 'task-1' },
  'user-a',
  2_008,
  'handoff-token-that-is-long-enough-0001',
);
assert.ok(handoff);
assert.equal(
  bridge.redeemEditorHandoff(handoff.handoff, 'user-b', undefined, 2_009).reason,
  'handoff_wrong_user',
  'a browser signed in as another user cannot claim the editor session',
);
assert.equal(
  bridge.redeemEditorHandoff(handoff.handoff, 'user-a', { sessionId: codespace.id }, 2_010).reason,
  'handoff_wrong_session',
  'the handoff cannot be redirected to another editor session',
);
assert.deepEqual(bridge.redeemEditorHandoff(handoff.handoff, 'user-a', undefined, 2_011), {
  ok: true,
  sessionId: desktop.id,
  nodeId: 'e_op_add',
  taskId: 'task-1',
});
assert.equal(bridge.redeemEditorHandoff(handoff.handoff, 'user-a', undefined, 2_012).reason, 'handoff_used');
const runCommand = bridge.enqueueRunProblem(
  { sessionId: desktop.id, nodeId: 'e_op_add', taskId: 'task-1', relativePath },
  'user-a',
  2_008,
);
assert.ok(runCommand);
assert.equal(runCommand.type, 'run_problem');
assert.equal(
  bridge.enqueueRunProblem(
    { sessionId: desktop.id, nodeId: 'e_op_add', taskId: 'task-1', relativePath },
    'user-a',
    2_009,
  ).id,
  runCommand.id,
  'a second browser click reuses the pending editor command',
);
assert.equal(
  bridge.leaseEditorCommands(desktop.id, 'user-a', 2_010).filter(item => item.type === 'run_problem').length,
  1,
);
assert.equal(bridge.markEditorRunStarted(runCommand.id, desktop.id, 'run-1', 'user-a', 2_011).duplicate, false);
assert.equal(bridge.markEditorRunStarted(runCommand.id, desktop.id, 'run-1', 'user-a', 2_012).duplicate, true);
assert.equal(bridge.getPublicEditorCommand(runCommand.id, 'user-a').runId, 'run-1');
for (let now = 21_000; now < 302_100; now += 19_000) {
  bridge.registerEditorSession(
    { sessionId: desktop.id, label: desktop.label, kind: desktop.kind, workspaceFolders: desktop.workspaceFolders },
    'user-a',
    now,
  );
}
assert.equal(
  bridge.getEditorProblemBinding(desktop.id, relativePath, 'user-a', 302_100).taskId,
  'task-1',
  'an acknowledged binding survives command expiry while the editor heartbeat remains healthy',
);
tracker.releaseCodeServerLease(runtime.sessionId, 'user-a');

const pathBundle = path.join(serverDist, 'editor-path-security.cjs');
buildSync({
  entryPoints: ['packages/vscode-extension/src/pathSecurity.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: pathBundle,
});
const extensionPaths = await import(pathToFileURL(pathBundle));
assert.equal(extensionPaths.isSafeProblemRelativePath(relativePath), true);
assert.equal(extensionPaths.isSafeProblemRelativePath('netcrawl/problems/../../secret.py'), false);
assert.equal(
  extensionPaths.uriIsInside(
    { scheme: 'vscode-remote', authority: 'codespace', path: '/workspaces/game' },
    { scheme: 'vscode-remote', authority: 'codespace', path: '/workspaces/game/netcrawl/problems/x.py' },
  ),
  true,
  'Codespaces virtual workspace URIs remain supported',
);

const executionLocationBundle = path.join(serverDist, 'editor-execution-location.cjs');
buildSync({
  entryPoints: ['packages/vscode-extension/src/executionLocation.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: executionLocationBundle,
});
const executionLocations = await import(pathToFileURL(executionLocationBundle));
const firstLocation = { lineno: 2, col_offset: 0, end_lineno: 2, end_col_offset: 4 };
const latestLocation = { lineno: 5, col_offset: 2, end_lineno: 6, end_col_offset: 8 };
assert.deepEqual(
  executionLocations.latestLiveExecutionLocation('running', [
    { location: firstLocation },
    { sequence: 1 },
    { location: latestLocation },
  ]),
  latestLocation,
  'the editor follows the newest located frame across generic and multiline constructs',
);
assert.equal(
  executionLocations.latestLiveExecutionLocation('trace_ready', [{ location: latestLocation }]),
  undefined,
  'a terminal outcome clears the active execution range',
);
assert.equal(
  executionLocations.latestLiveExecutionLocation('running', [
    { location: { lineno: 0, col_offset: 0, end_lineno: 1, end_col_offset: 1 } },
  ]),
  undefined,
  'a malformed source range fails closed',
);
assert.equal(
  extensionPaths.uriIsInside(
    { scheme: 'file', authority: '', path: '/workspace/game' },
    { scheme: 'file', authority: '', path: '/workspace/game-other/secret.py' },
  ),
  false,
  'path prefix siblings are outside the workspace',
);

const expiredHandoff = bridge.createEditorHandoff(
  { sessionId: desktop.id, nodeId: 'e_op_add', taskId: 'task-1' },
  'user-a',
  302_100,
  'handoff-token-that-is-long-enough-0002',
);
assert.equal(
  bridge.redeemEditorHandoff(expiredHandoff.handoff, 'user-a', undefined, expiredHandoff.expiresAt + 1).reason,
  'handoff_expired',
);

const problemFileBundle = path.join(serverDist, 'editor-problem-file.cjs');
buildSync({
  entryPoints: ['packages/vscode-extension/src/problemFile.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: problemFileBundle,
});
const problemFiles = await import(pathToFileURL(problemFileBundle));
const pathEscapeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'netcrawl-editor-path-root-'));
const pathEscapeOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'netcrawl-editor-path-outside-'));
const fileUri = filePath => ({
  scheme: 'file',
  authority: '',
  path: filePath,
  toString: () => `file://${filePath}`,
});
const joinFileUri = (root, ...segments) => fileUri(path.join(root.path, ...segments));
const nodeProblemFileServices = openTextDocument => ({
  joinPath: joinFileUri,
  stat: async uri => {
    const stat = await fs.promises.lstat(uri.path);
    return { type: stat.isSymbolicLink() ? 64 : stat.isDirectory() ? 2 : stat.isFile() ? 1 : 0 };
  },
  createDirectory: uri => fs.promises.mkdir(uri.path, { recursive: true }),
  readFile: uri => fs.promises.readFile(uri.path),
  writeFile: (uri, content) => fs.promises.writeFile(uri.path, content),
  openTextDocument,
  isFileNotFound: error => error?.code === 'ENOENT',
  chooseSource: async () => 'replace',
});
let escapedFileOpened = false;
try {
  fs.symlinkSync(pathEscapeOutside, path.join(pathEscapeRoot, 'netcrawl'));
  await assert.rejects(
    () =>
      problemFiles.openProblemFile(
        fileUri(pathEscapeRoot),
        'netcrawl/problems/task.py',
        'print("must stay inside")\n',
        nodeProblemFileServices(async uri => {
          escapedFileOpened = true;
          return fs.promises.readFile(uri.path, 'utf8');
        }),
      ),
    /symbolic link|outside the selected workspace/i,
    'the actual create/write/open flow must reject an in-workspace symlink before touching its target',
  );
  assert.equal(fs.existsSync(path.join(pathEscapeOutside, 'problems', 'task.py')), false);
  assert.equal(escapedFileOpened, false);
} finally {
  fs.rmSync(pathEscapeRoot, { recursive: true, force: true });
  fs.rmSync(pathEscapeOutside, { recursive: true, force: true });
}

const safeFileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'netcrawl-editor-path-safe-'));
try {
  const safeSource = 'print("inside")\n';
  const opened = await problemFiles.openProblemFile(
    fileUri(safeFileRoot),
    'netcrawl/problems/node/task.py',
    safeSource,
    nodeProblemFileServices(uri => fs.promises.readFile(uri.path, 'utf8')),
  );
  assert.equal(
    opened.document,
    safeSource,
    'the guarded production helper still creates, writes, and opens safe files',
  );
  assert.equal(fs.readFileSync(path.join(safeFileRoot, 'netcrawl/problems/node/task.py'), 'utf8'), safeSource);
} finally {
  fs.rmSync(safeFileRoot, { recursive: true, force: true });
}

let unknownProviderWrite = false;
await assert.rejects(
  () =>
    problemFiles.openProblemFile(
      { scheme: 'memfs', authority: 'provider', path: '/workspace', toString: () => 'memfs://provider/workspace' },
      'netcrawl/problems/task.py',
      'print("unknown")\n',
      {
        joinPath: (root, ...segments) => ({
          ...root,
          path: `${root.path}/${segments.join('/')}`,
          toString: () => `memfs://provider${root.path}/${segments.join('/')}`,
        }),
        stat: async () => ({ type: 0 }),
        createDirectory: async () => undefined,
        readFile: async () => new Uint8Array(),
        writeFile: async () => {
          unknownProviderWrite = true;
        },
        openTextDocument: async () => undefined,
        isFileNotFound: () => false,
        chooseSource: async () => 'replace',
      },
    ),
  /unknown or non-directory/i,
  'a provider that cannot prove a path component type must fail closed',
);
assert.equal(unknownProviderWrite, false);

bridge.resetEditorBridgeForTests();
const { startServer } = await import(pathToFileURL(path.join(serverDist, 'index.js')));
const { isAllowedWebOrigin } = await import(pathToFileURL(path.join(serverDist, 'index.js')));
const { getGameState, saveGameState } = await import(pathToFileURL(path.join(serverDist, 'domain/gameState.js')));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netcrawl-editor-bridge-'));
assert.equal(isAllowedWebOrigin('https://example.github.dev', ['https://game.example']), true);
assert.equal(isAllowedWebOrigin('vscode-webview://window-id', ['https://game.example']), true);
assert.equal(isAllowedWebOrigin('https://evil.example', ['https://game.example']), false);
const started = await startServer({ port: 0, dataDir: tempDir });
const base = `http://127.0.0.1:${started.port}`;
const json = async (route, init = {}) => {
  const response = await fetch(`${base}${route}`, init);
  return { response, body: await response.json() };
};
const withToken = (token, init = {}) => ({
  ...init,
  headers: {
    ...(init.headers || {}),
    Authorization: `Bearer ${token}`,
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
  },
});

try {
  const registered = await json('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'editor@example.test', password: 'secret1', displayName: 'Editor Test' }),
  });
  assert.equal(registered.response.status, 201);
  const browserToken = registered.body.token;
  const pairCreated = await json('/api/editor/pairing-tickets', withToken(browserToken, { method: 'POST' }));
  assert.equal(pairCreated.response.status, 201);
  assert.equal(pairCreated.response.headers.get('cache-control'), 'no-store');
  const pairConsumed = await json('/api/editor/pairing-tickets/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: pairCreated.body.code }),
  });
  assert.equal(pairConsumed.response.status, 200);
  const editorToken = pairConsumed.body.token;
  const replay = await json('/api/editor/pairing-tickets/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: pairCreated.body.code }),
  });
  assert.equal(replay.response.status, 410);

  for (const session of [
    { sessionId: 'desktop-api-session', label: 'Desktop VS Code', kind: 'desktop' },
    { sessionId: 'codespace-api-session', label: 'GitHub Codespaces', kind: 'codespaces' },
  ]) {
    const response = await json(
      '/api/editor/sessions/register',
      withToken(editorToken, {
        method: 'POST',
        body: JSON.stringify({ ...session, workspaceFolders: ['netcrawl-workspace'] }),
      }),
    );
    assert.equal(response.response.status, 200);
  }
  const listed = await json('/api/editor/sessions', withToken(browserToken));
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.sessions.length, 2);
  assert.equal((await json('/api/editor/sessions')).response.status, 401);
  assert.equal((await json('/api/editor/sessions', withToken(editorToken))).response.status, 401);
  assert.equal(
    (await json('/api/editor/commands?sessionId=desktop-api-session', withToken(browserToken))).response.status,
    401,
  );

  const userId = registered.body.user.id;
  const state = getGameState(userId);
  const computeNode = state.nodes.find(node => node.type === 'compute');
  assert.ok(computeNode);
  computeNode.data.unlocked = true;
  saveGameState(state, userId);
  const task = await json(
    '/api/compute-lab/tasks',
    withToken(browserToken, {
      method: 'POST',
      body: JSON.stringify({ nodeId: computeNode.id }),
    }),
  );
  assert.equal(task.response.status, 200);
  const opened = await json(
    '/api/editor/commands/open',
    withToken(browserToken, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'desktop-api-session',
        nodeId: computeNode.id,
        taskId: task.body.taskId,
        source: task.body.starterSource,
        revision: 7,
        selection: { lineno: 2, col_offset: 4, end_lineno: 2, end_col_offset: 20 },
        relativePath: '../../ignored.py',
      }),
    }),
  );
  assert.equal(opened.response.status, 202);
  assert.match(opened.body.command.relativePath, /^netcrawl\/problems\//);
  const wrongTarget = await json('/api/editor/commands?sessionId=codespace-api-session', withToken(editorToken));
  assert.deepEqual(wrongTarget.body.commands, []);
  const leased = await json('/api/editor/commands?sessionId=desktop-api-session', withToken(editorToken));
  assert.equal(leased.body.commands.length, 1);
  assert.equal(leased.body.commands[0].source, task.body.starterSource);
  const acked = await json(
    `/api/editor/commands/${opened.body.command.id}/ack`,
    withToken(editorToken, {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'desktop-api-session', outcome: 'opened' }),
    }),
  );
  assert.equal(acked.response.status, 200);
  assert.equal(acked.body.duplicate, false);
  const duplicateAck = await json(
    `/api/editor/commands/${opened.body.command.id}/ack`,
    withToken(editorToken, {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'desktop-api-session', outcome: 'opened' }),
    }),
  );
  assert.equal(duplicateAck.body.duplicate, true);
  const commandRead = await json(`/api/editor/commands/${opened.body.command.id}`, withToken(browserToken));
  assert.equal(commandRead.body.command.outcome, 'opened');
  assert.equal('source' in commandRead.body.command, false, 'browser command status never echoes the source');

  const problemStatusStartedAt = performance.now();
  const problemStatus = await json(
    `/api/editor/problem-status?sessionId=desktop-api-session&nodeId=${encodeURIComponent(computeNode.id)}&taskId=${encodeURIComponent(task.body.taskId)}`,
    withToken(browserToken),
  );
  assert.equal(problemStatus.response.status, 200);
  assert.equal(problemStatus.response.headers.get('cache-control'), 'no-store');
  assert.equal(problemStatus.body.bound, true);
  assert.equal(problemStatus.body.relativePath, opened.body.command.relativePath);
  assert.ok(
    performance.now() - problemStatusStartedAt < 250,
    'bound-file status remains an in-memory read under 250ms',
  );

  const handoffCreated = await json(
    '/api/editor/handoffs',
    withToken(editorToken, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'desktop-api-session',
        nodeId: computeNode.id,
        taskId: task.body.taskId,
      }),
    }),
  );
  assert.equal(handoffCreated.response.status, 201);
  assert.equal(handoffCreated.response.headers.get('cache-control'), 'no-store');
  assert.equal(typeof handoffCreated.body.handoff, 'string');
  assert.notEqual(handoffCreated.body.handoff, editorToken, 'the editor bearer token never enters the handoff');
  assert.equal(
    (
      await json(
        '/api/editor/handoffs',
        withToken(browserToken, {
          method: 'POST',
          body: JSON.stringify({ sessionId: 'desktop-api-session', nodeId: computeNode.id, taskId: task.body.taskId }),
        }),
      )
    ).response.status,
    401,
    'only an authenticated editor may create a launch handoff',
  );
  const handoffRedeemed = await json(
    '/api/editor/handoffs/redeem',
    withToken(browserToken, { method: 'POST', body: JSON.stringify({ handoff: handoffCreated.body.handoff }) }),
  );
  assert.equal(handoffRedeemed.response.status, 200);
  assert.deepEqual(
    {
      sessionId: handoffRedeemed.body.sessionId,
      nodeId: handoffRedeemed.body.nodeId,
      taskId: handoffRedeemed.body.taskId,
    },
    { sessionId: 'desktop-api-session', nodeId: computeNode.id, taskId: task.body.taskId },
  );
  assert.equal(
    (
      await json(
        '/api/editor/handoffs/redeem',
        withToken(browserToken, { method: 'POST', body: JSON.stringify({ handoff: handoffCreated.body.handoff }) }),
      )
    ).body.reason,
    'handoff_used',
  );

  const lease = tracker.claimCodeServerLease(undefined, userId);
  assert.equal(lease.ok, true);
  const editorSource = task.body.starterSource.replace('pass', 'return 123');
  const runQueued = await json(
    '/api/editor/commands/run',
    withToken(browserToken, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'desktop-api-session',
        nodeId: computeNode.id,
        taskId: task.body.taskId,
      }),
    }),
  );
  assert.equal(runQueued.response.status, 202);
  assert.equal(runQueued.body.command.type, 'run_problem');
  const runCommands = await json('/api/editor/commands?sessionId=desktop-api-session', withToken(editorToken));
  assert.equal(runCommands.body.commands.filter(item => item.type === 'run_problem').length, 1);
  const runStarted = await json(
    '/api/editor/runs',
    withToken(editorToken, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'desktop-api-session',
        relativePath: opened.body.command.relativePath,
        source: editorSource,
        revision: 8,
        commandId: runQueued.body.command.id,
      }),
    }),
  );
  assert.equal(runStarted.response.status, 202);
  const runRead = await json(`/api/editor/runs/${runStarted.body.runId}`, withToken(editorToken));
  assert.equal(runRead.response.status, 200);
  assert.equal(runRead.body.run.taskId, task.body.taskId);
  assert.equal(runRead.body.run.revision, 8);
  assert.equal('source' in runRead.body.run, false);
  const duplicateRunStarted = await json(
    '/api/editor/runs',
    withToken(editorToken, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'desktop-api-session',
        relativePath: opened.body.command.relativePath,
        source: editorSource,
        revision: 8,
        commandId: runQueued.body.command.id,
      }),
    }),
  );
  assert.equal(duplicateRunStarted.response.status, 202);
  assert.equal(duplicateRunStarted.body.runId, runStarted.body.runId, 'command retry is idempotent');
  assert.equal(duplicateRunStarted.body.duplicate, true);
  const runCommandRead = await json(`/api/editor/commands/${runQueued.body.command.id}`, withToken(browserToken));
  assert.equal(runCommandRead.body.command.outcome, 'run_started');
  assert.equal(runCommandRead.body.command.runId, runStarted.body.runId);
  const concurrentRun = await json(
    '/api/editor/commands/run',
    withToken(browserToken, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'desktop-api-session',
        nodeId: computeNode.id,
        taskId: task.body.taskId,
      }),
    }),
  );
  assert.equal(concurrentRun.response.status, 409);
  assert.equal(concurrentRun.body.reason, 'run_in_progress');
  const manualEditorRun = await json(
    '/api/editor/runs',
    withToken(editorToken, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'desktop-api-session',
        relativePath: opened.body.command.relativePath,
        source: editorSource,
        revision: 9,
      }),
    }),
  );
  assert.equal(manualEditorRun.response.status, 409);
  assert.equal(manualEditorRun.body.reason, 'run_in_progress');
  tracker.releaseCodeServerLease(lease.sessionId, userId);
} finally {
  await new Promise(resolve => started.server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('Editor bridge pairing, isolation, path boundary, and API integration passed.');
process.exit(0);
