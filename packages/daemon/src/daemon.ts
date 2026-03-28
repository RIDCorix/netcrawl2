/**
 * NetCrawl Daemon
 *
 * This package provides worker subprocess management utilities.
 * The actual daemon functionality is integrated into the server package
 * via workerSpawner.ts for simplicity.
 *
 * This module can be used as a standalone daemon that communicates
 * with the server via HTTP API.
 */

import axios from 'axios';

const API_URL = process.env.NETCRAWL_API_URL || 'http://localhost:4800';

async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await axios.get(`${API_URL}/health`, { timeout: 2000 });
    return res.data.status === 'ok';
  } catch {
    return false;
  }
}

async function monitorWorkers() {
  console.log('[Daemon] Monitoring workers...');
  try {
    const res = await axios.get(`${API_URL}/api/workers`);
    const workers = res.data.workers || [];
    console.log(`[Daemon] Active workers: ${workers.length}`);
    for (const worker of workers) {
      console.log(`  - ${worker.id} (${worker.class_name}) status=${worker.status} node=${worker.current_node}`);
    }
  } catch (err) {
    console.error('[Daemon] Failed to fetch workers');
  }
}

async function main() {
  console.log('[Daemon] NetCrawl Daemon starting...');

  // Wait for server
  let healthy = false;
  for (let i = 0; i < 10; i++) {
    healthy = await checkServerHealth();
    if (healthy) break;
    console.log('[Daemon] Waiting for server...');
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!healthy) {
    console.error('[Daemon] Server not available, exiting');
    process.exit(1);
  }

  console.log('[Daemon] Server is healthy, starting monitor loop');

  // Monitor loop
  setInterval(monitorWorkers, 10000);
  await monitorWorkers();
}

main().catch(err => {
  console.error('[Daemon] Fatal:', err);
  process.exit(1);
});
