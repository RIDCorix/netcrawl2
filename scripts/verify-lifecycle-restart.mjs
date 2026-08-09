/* Verify a new Game Server process loads durable worker assets, not a blank save. */
const dataDir = process.env.NETCRAWL_LIFECYCLE_DATA_DIR;
if (!dataDir) throw new Error('NETCRAWL_LIFECYCLE_DATA_DIR is required');

process.env.NETCRAWL_MULTI_USER = 'true';
process.env.JWT_SECRET = 'deploy-route-test-secret';
process.env.NETCRAWL_BUNDLED = 'true';

const { startServer } = await import('../packages/server/.test-dist/index.js');
const { server, port } = await startServer({ port: 0, dataDir });
try {
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'deploy-a@example.test', password: 'password-a' }),
  });
  const token = (await login.json()).token;
  const workers = await fetch(`http://127.0.0.1:${port}/api/workers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(JSON.stringify(await workers.json()));
} finally {
  await new Promise(resolve => server.close(resolve));
}

// gameTick owns an interval; this one-shot verification must not inherit it.
process.exit(0);
