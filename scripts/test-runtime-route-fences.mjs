/* global console, fetch, process */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

process.env.NETCRAWL_MULTI_USER = 'true';
process.env.JWT_SECRET = 'runtime-route-fence-test-secret';
process.env.NETCRAWL_BUNDLED = 'true';

const serverRoot = process.env.NETCRAWL_FENCE_SERVER_ROOT || process.cwd();
const serverModule = path => pathToFileURL(join(serverRoot, 'packages/server/.test-dist', path)).href;
const testDir = mkdtempSync(join(tmpdir(), 'netcrawl-runtime-route-fences-'));
const { startServer } = await import(serverModule('index.js'));
const { router, runtimeCredentialPaths } = await import(serverModule('routes/index.js'));
const { getWorkers } = await import(serverModule('domain/workers.js'));
const { getQuestList } = await import(serverModule('quests.js'));
const { getQuestState } = await import(serverModule('domain/questState.js'));
const { setQuestStatus } = await import(serverModule('domain/questState.js'));
const { server, port } = await startServer({ port: 0, dataDir: testDir });
const base = `http://127.0.0.1:${port}`;

async function request(path, token, method, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function mountedRoutes(targetRouter) {
  const routes = [];
  for (const layer of targetRouter.stack || []) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const path of paths) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ method: method.toUpperCase(), path });
        }
      }
    } else if (layer.handle?.stack) {
      routes.push(...mountedRoutes(layer.handle));
    }
  }
  return routes;
}

function routeKey({ method, path }) {
  return `${method} ${path}`;
}

function acceptsRuntimeCredential(path) {
  return runtimeCredentialPaths.some(prefix => (prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix));
}

function workerSnapshot(userId) {
  return JSON.parse(JSON.stringify(getWorkers(userId).sort((left, right) => left.id.localeCompare(right.id))));
}

try {
  const registration = await request('/api/auth/register', '', 'POST', {
    email: 'runtime-fence@example.test',
    password: 'runtime-fence-password',
    displayName: 'Runtime Fence',
  });
  assert.equal(registration.status, 201);
  const browserToken = registration.body.token;
  const userId = registration.body.user.id;
  const credential = await request('/api/auth/code-server-token', browserToken, 'POST', {});
  assert.equal(credential.status, 200);
  const codeServerToken = credential.body.token;

  // Start with an eligible but disconnected Dev Setup quest, then prove the
  // v2 registration itself completes its durable objective. This is the same
  // registration path used by the current Code Server protocol, rather than
  // the legacy class endpoint.
  getQuestState(userId).chapterZero.stage = 'handoff';
  setQuestStatus('q_setup', 'available', userId);

  const workerClass = {
    class_id: 'runtime_fence_probe',
    class_name: 'Runtime Fence Probe',
    fields: {},
    file: 'runtime_fence_probe.py',
    language: 'python',
  };
  const disconnectedSetupQuest = getQuestList(userId).find(quest => quest.id === 'q_setup');
  assert.equal(disconnectedSetupQuest?.objectives[0].current, 0, 'disconnected Dev Setup must remain at 0/1');
  assert.equal(disconnectedSetupQuest?.status, 'available', 'disconnected Dev Setup must remain incomplete');
  const runtimeRegistration = await request('/api/runtime/register', codeServerToken, 'POST', {
    protocolVersion: 2,
    sessionId: 'runtime-fence-quest-session',
    classes: [workerClass],
  });
  assert.equal(runtimeRegistration.status, 200);
  const setupQuest = getQuestList(userId).find(quest => quest.id === 'q_setup');
  assert.equal(setupQuest?.objectives[0].current, 1, 'v2 registration must persist the Dev Setup connection objective');

  assert.equal(
    (await request('/api/worker-classes/register', codeServerToken, 'POST', { classes: [workerClass] })).status,
    200,
  );
  const deployment = await request('/api/deploy', browserToken, 'POST', {
    nodeId: 'hub',
    classId: workerClass.class_id,
    equippedItems: {},
    routes: {},
  });
  assert.equal(deployment.status, 200, JSON.stringify(deployment.body));

  const mutationExceptions = [
    {
      method: 'POST',
      path: '/runtime/register',
      reason: 'Bootstrap claims the runtime lease, so no prior lease can exist.',
    },
    {
      method: 'POST',
      path: '/worker-classes/register',
      reason: 'Legacy SDK bootstrap registers classes before an execution fence exists.',
    },
    {
      method: 'POST',
      path: '/deploy-ack',
      branch: 'without commandId',
      reason: 'SDK 1.2.2 compatibility remains until Corix confirms every local workspace is on 1.2.3.',
    },
  ];
  const mutatingRuntimeRoutes = mountedRoutes(router)
    .filter(route => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method))
    .filter(route => acceptsRuntimeCredential(route.path));
  const bootstrapExceptions = new Set(mutationExceptions.filter(exception => !exception.branch).map(routeKey));
  for (const exception of mutationExceptions) {
    assert.ok(exception.reason, `runtime mutation exception needs a reason: ${routeKey(exception)}`);
    assert.ok(
      mutatingRuntimeRoutes.some(route => routeKey(route) === routeKey(exception)),
      `stale runtime mutation exception: ${routeKey(exception)}`,
    );
  }

  const violations = [];
  for (const route of mutatingRuntimeRoutes) {
    if (bootstrapExceptions.has(routeKey(route))) continue;
    const path = route.path.replace(/:([^/]+)/g, (_, parameter) => `missing-${parameter}`);
    const before = workerSnapshot(userId);
    const response = await request(`/api${path}`, codeServerToken, route.method, {
      workerId: deployment.body.workerId,
      action: 'get_node_info',
      payload: {},
      commandId: 'missing-command',
    });
    if (response.status !== 409 && response.body.reason !== 'stale_execution') {
      violations.push(`${routeKey(route)} accepted the unfenced credential: ${JSON.stringify(response)}`);
    }
    if (!isDeepStrictEqual(workerSnapshot(userId), before)) {
      violations.push(`${routeKey(route)} mutated the complete worker snapshot`);
    }
  }

  assert.deepEqual(violations, [], `runtime credential fence violations:\n${violations.join('\n')}`);
  console.log(`Runtime route fencing: ${mutatingRuntimeRoutes.length} mutating routes covered`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(testDir, { recursive: true, force: true });
  rmSync(join(serverRoot, 'packages/server/.test-dist'), { recursive: true, force: true });
  process.exit(process.exitCode || 0);
}
