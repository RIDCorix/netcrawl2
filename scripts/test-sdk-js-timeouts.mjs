import assert from 'node:assert/strict';

const { ApiClient, httpPost } = await import('../packages/sdk-js/dist/client.js');
const { NetCrawl } = await import('../packages/sdk-js/dist/app.js');
const { buildWorkerEnvironment } = await import('../packages/sdk-js/dist/daemon/spawner.js');
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const timeouts = [];
const requests = [];

try {
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const body = String(url).includes('/api/runtime/commands?')
      ? {
          commands: [
            {
              id: 'command-1',
              workerId: 'worker-1',
              classId: 'missing-class',
              nodeId: 'hub',
              generation: 7,
              executionToken: 'execution-key',
            },
          ],
        }
      : String(url).endsWith('/api/runtime/register')
        ? { ok: true, sessionId: 'session-1' }
        : { ok: true };
    return { status: 200, text: async () => JSON.stringify(body) };
  };
  globalThis.setTimeout = (callback, delay, ...args) => {
    timeouts.push(delay);
    return originalSetTimeout(callback, delay, ...args);
  };

  assert.deepEqual(await httpPost('http://game.example/ordinary', {}), { ok: true });
  assert.deepEqual(timeouts, [10000], 'ordinary POSTs retain the 10-second deadline');

  timeouts.length = 0;
  const client = new ApiClient('http://game.example/', 'worker-1');
  assert.deepEqual(await client.action('mine', {}), { ok: true });
  assert.deepEqual(timeouts, [], 'worker actions install no fixed transport deadline');

  requests.length = 0;
  const authenticatedClient = new ApiClient('http://game.example/', 'worker-1', 'code-key', 7, 'execution-key');
  assert.equal((await authenticatedClient.action('mine', {})).ok, true);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer code-key');
  assert.equal(JSON.parse(requests[0].options.body).generation, 7);

  requests.length = 0;
  const app = new NetCrawl({ server: 'http://game.example/', apiKey: 'code-key' });
  await app._registerAll();
  await app._pollDeployQueue();
  assert.equal(requests.some(request => request.url.endsWith('/api/runtime/register')), true);
  assert.equal(requests.some(request => request.url.includes('/api/runtime/commands?sessionId=')), true);
  assert.equal(requests.some(request => request.url.endsWith('/api/runtime/commands/command-1/ack')), true);
  assert.equal(requests.every(request => request.options.headers.Authorization === 'Bearer code-key'), true);

  const workerEnv = buildWorkerEnvironment(
    'worker-1',
    '/worker.js',
    'Worker',
    'http://game.example',
    {},
    'code-key',
    7,
    'execution-key',
  );
  assert.equal(workerEnv.NETCRAWL_API_KEY, 'code-key');
  assert.equal(workerEnv.NETCRAWL_GENERATION, '7');
  assert.equal(workerEnv.NETCRAWL_EXECUTION_TOKEN, 'execution-key');

  console.log('SDK JS transport and credential-chain regression: 14 assertions passed');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}
