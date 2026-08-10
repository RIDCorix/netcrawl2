import assert from 'node:assert/strict';

const { ApiClient, httpPost } = await import('../packages/sdk-js/dist/client.js');
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const timeouts = [];

try {
  globalThis.fetch = async () => ({
    status: 200,
    text: async () => JSON.stringify({ ok: true }),
  });
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

  console.log('SDK JS timeout regression: 4 assertions passed');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}
