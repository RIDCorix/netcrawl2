/* global fetch, process */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NETCRAWL_BUNDLED = 'true';
delete process.env.NETCRAWL_MULTI_USER;

const { CiWatchdog } = await import('../packages/server/.test-dist/ciWatchdog.js');
const { startServer } = await import('../packages/server/.test-dist/index.js');

const SHA = '0123456789abcdef0123456789abcdef01234567';
const RUN_URL = 'https://github.com/RIDCorix/netcrawl2/actions/runs/123';
const startTime = Date.parse('2026-08-16T12:00:00.000Z');
const testDir = mkdtempSync(join(tmpdir(), 'netcrawl-ci-watchdog-'));
const openServers = [];

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function successfulRun(createdAt = '2026-08-16T11:59:00.000Z') {
  return {
    head_sha: SHA,
    status: 'completed',
    conclusion: 'success',
    created_at: createdAt,
    html_url: RUN_URL,
  };
}

function makeGitHubFetch({
  workflow = { state: 'active' },
  commit = {
    sha: SHA,
    commit: { committer: { date: '2026-08-16T11:59:00.000Z' } },
  },
  runs = { workflow_runs: [successfulRun()] },
} = {}) {
  const calls = [];
  const fetchFn = async input => {
    const url = new URL(input);
    calls.push(url);
    if (url.pathname.endsWith('/actions/workflows/test.yml')) return response(workflow);
    if (url.pathname.endsWith('/commits/master')) return response(commit);
    if (url.pathname.endsWith('/actions/workflows/test.yml/runs')) {
      assert.equal(url.searchParams.get('branch'), 'master');
      assert.equal(url.searchParams.get('event'), 'push');
      assert.equal(url.searchParams.get('head_sha'), SHA);
      assert.equal(url.searchParams.get('per_page'), '1');
      return response(runs);
    }
    throw new Error(`Unexpected GitHub URL: ${url}`);
  };
  return { fetchFn, calls };
}

async function request(base, path) {
  const result = await fetch(`${base}${path}`);
  return {
    status: result.status,
    cacheControl: result.headers.get('cache-control'),
    body: await result.json(),
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

try {
  {
    const github = makeGitHubFetch();
    const watchdog = new CiWatchdog({ enabled: true, fetch: github.fetchFn, now: () => startTime });
    assert.deepEqual(watchdog.getHealth(), {
      statusCode: 503,
      body: {
        status: 'error',
        reason: 'not_checked',
        checkedAt: null,
        sha: null,
        runUrl: null,
      },
    });
    const snapshot = await watchdog.poll();
    assert.deepEqual(snapshot, {
      status: 'green',
      reason: 'test_run_succeeded',
      checkedAt: '2026-08-16T12:00:00.000Z',
      sha: SHA,
      runUrl: RUN_URL,
    });
    assert.equal(watchdog.getHealth().statusCode, 200);
    assert.equal(github.calls.length, 3);
  }

  {
    const github = makeGitHubFetch({ workflow: { state: 'disabled_inactivity' } });
    const watchdog = new CiWatchdog({ enabled: true, fetch: github.fetchFn, now: () => startTime });
    assert.deepEqual(await watchdog.poll(), {
      status: 'non_green',
      reason: 'workflow_inactive',
      checkedAt: '2026-08-16T12:00:00.000Z',
      sha: null,
      runUrl: null,
    });
    assert.equal(github.calls.length, 1);
  }

  {
    let now = startTime;
    const github = makeGitHubFetch({ runs: { workflow_runs: [] } });
    const watchdog = new CiWatchdog({ enabled: true, fetch: github.fetchFn, now: () => now });
    assert.equal((await watchdog.poll()).status, 'pending');
    assert.equal(watchdog.getSnapshot().reason, 'test_run_missing_within_grace');
    now += 6 * 60 * 1000;
    assert.equal((await watchdog.poll()).status, 'non_green');
    assert.equal(watchdog.getSnapshot().reason, 'test_run_missing');
  }

  {
    let now = startTime;
    const run = { ...successfulRun(), status: 'in_progress' };
    const github = makeGitHubFetch({ runs: { workflow_runs: [run] } });
    const watchdog = new CiWatchdog({ enabled: true, fetch: github.fetchFn, now: () => now });
    assert.equal((await watchdog.poll()).status, 'pending');
    assert.equal(watchdog.getSnapshot().reason, 'test_run_pending');
    now += 6 * 60 * 1000;
    assert.equal((await watchdog.poll()).status, 'non_green');
    assert.equal(watchdog.getSnapshot().reason, 'test_run_not_completed');
  }

  for (const conclusion of ['failure', 'cancelled']) {
    const github = makeGitHubFetch({
      runs: { workflow_runs: [{ ...successfulRun(), conclusion }] },
    });
    const watchdog = new CiWatchdog({ enabled: true, fetch: github.fetchFn, now: () => startTime });
    const snapshot = await watchdog.poll();
    assert.equal(snapshot.status, 'non_green');
    assert.equal(snapshot.reason, `test_run_${conclusion}`);
  }

  {
    const watchdog = new CiWatchdog({
      enabled: true,
      fetch: async () => response({ message: 'not exposed' }, 503),
      now: () => startTime,
    });
    const snapshot = await watchdog.poll();
    assert.equal(snapshot.status, 'error');
    assert.equal(snapshot.reason, 'github_http_503');
    assert.equal(JSON.stringify(snapshot).includes('not exposed'), false);
  }

  {
    let providerAvailable = true;
    const github = makeGitHubFetch();
    const watchdog = new CiWatchdog({
      enabled: true,
      fetch: async input => {
        if (!providerAvailable) throw new Error('private provider detail');
        return github.fetchFn(input);
      },
      now: () => startTime,
    });
    assert.equal((await watchdog.poll()).status, 'green');
    providerAvailable = false;
    const failed = await watchdog.poll();
    assert.equal(failed.status, 'error');
    assert.equal(failed.reason, 'github_request_failed');
    assert.equal(watchdog.getHealth().statusCode, 503);
    assert.equal(JSON.stringify(failed).includes('private provider detail'), false);
  }

  {
    const watchdog = new CiWatchdog({
      enabled: true,
      fetch: async () => new Response('not json', { status: 200 }),
      now: () => startTime,
    });
    assert.equal((await watchdog.poll()).reason, 'github_invalid_json');
  }

  {
    let fetchCount = 0;
    const watchdog = new CiWatchdog({
      enabled: false,
      fetch: async () => {
        fetchCount += 1;
        return response({});
      },
      now: () => startTime,
    });
    watchdog.start();
    watchdog.start();
    assert.equal((await watchdog.poll()).status, 'disabled');
    assert.equal(watchdog.getHealth().statusCode, 503);
    assert.equal(fetchCount, 0);
    watchdog.stop();
  }

  {
    const github = makeGitHubFetch();
    const timers = [];
    const cleared = [];
    const watchdog = new CiWatchdog({
      enabled: true,
      fetch: github.fetchFn,
      now: () => startTime,
      setTimeout: (callback, delay) => {
        const timer = { callback, delay };
        timers.push(timer);
        return timer;
      },
      clearTimeout: timer => cleared.push(timer),
    });
    watchdog.start();
    watchdog.start();
    for (let attempt = 0; attempt < 5 && timers.length === 0; attempt += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(github.calls.length, 3, 'double start must perform only one check');
    assert.equal(timers.length, 1, 'next poll must be scheduled only after completion');
    assert.equal(timers[0].delay, 5 * 60 * 1000);
    watchdog.stop();
    assert.deepEqual(cleared, [timers[0]]);
  }

  {
    let releaseWorkflow;
    let fetchCount = 0;
    const github = makeGitHubFetch();
    const timers = [];
    const cleared = [];
    const watchdog = new CiWatchdog({
      enabled: true,
      now: () => startTime,
      fetch: async input => {
        fetchCount += 1;
        if (fetchCount === 1) {
          await new Promise(resolve => {
            releaseWorkflow = resolve;
          });
        }
        return github.fetchFn(input);
      },
      setTimeout: (callback, delay) => {
        const timer = { callback, delay };
        timers.push(timer);
        return timer;
      },
      clearTimeout: timer => cleared.push(timer),
    });
    watchdog.start();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fetchCount, 1, 'first generation must have one in-flight provider request');

    watchdog.stop();
    watchdog.start();
    assert.equal(fetchCount, 1, 'restarted generation must share the in-flight check');
    releaseWorkflow();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }

    assert.equal(timers.length, 1, 'only the restarted generation may schedule a timer');
    watchdog.stop();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(
      timers.filter(timer => !cleared.includes(timer)).length,
      0,
      'stop after restart must leave no orphan timer',
    );
  }

  {
    let releaseWorkflow;
    let calls = 0;
    const github = makeGitHubFetch();
    const watchdog = new CiWatchdog({
      enabled: true,
      now: () => startTime,
      fetch: async input => {
        calls += 1;
        if (calls === 1) {
          await new Promise(resolve => {
            releaseWorkflow = resolve;
          });
        }
        return github.fetchFn(input);
      },
    });
    const first = watchdog.poll();
    const second = watchdog.poll();
    assert.equal(calls, 1, 'concurrent polls must share the in-flight check');
    releaseWorkflow();
    const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);
    assert.deepEqual(firstSnapshot, secondSnapshot);
    assert.equal(calls, 3);
  }

  {
    let now = startTime;
    const github = makeGitHubFetch();
    const watchdog = new CiWatchdog({
      enabled: true,
      fetch: github.fetchFn,
      now: () => now,
      setTimeout: () => ({ unref() {} }),
      clearTimeout: () => {},
    });
    await watchdog.poll();
    const running = await startServer({ port: 0, dataDir: testDir, ciWatchdog: watchdog });
    openServers.push(running.server);
    const base = `http://127.0.0.1:${running.port}`;
    const healthy = await request(base, '/health/ci-watchdog');
    assert.equal(healthy.status, 200);
    assert.equal(healthy.cacheControl, 'no-store');
    assert.equal(healthy.body.sha, SHA);
    assert.equal(healthy.body.runUrl, RUN_URL);

    now += 11 * 60 * 1000;
    const stale = await request(base, '/health/ci-watchdog');
    assert.equal(stale.status, 503);
    assert.equal(stale.cacheControl, 'no-store');
    assert.equal(stale.body.status, 'error');
    assert.equal(stale.body.reason, 'snapshot_stale');
    await closeServer(running.server);
    openServers.pop();
  }

  {
    const watchdog = new CiWatchdog({ enabled: false, now: () => startTime });
    const running = await startServer({ port: 0, dataDir: testDir, ciWatchdog: watchdog });
    openServers.push(running.server);
    const disabled = await request(`http://127.0.0.1:${running.port}`, '/health/ci-watchdog');
    assert.equal(disabled.status, 503);
    assert.equal(disabled.cacheControl, 'no-store');
    assert.equal(disabled.body.status, 'disabled');
    assert.equal(disabled.body.reason, 'watchdog_disabled');
    await closeServer(running.server);
    openServers.pop();
  }

  console.log('CI watchdog: fail-closed polling, lifecycle, and health route verified');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const server of openServers) {
    await closeServer(server);
  }
  rmSync(testDir, { recursive: true, force: true });
  rmSync(join(process.cwd(), 'packages/server/.test-dist'), { recursive: true, force: true });
  process.exit(process.exitCode || 0);
}
