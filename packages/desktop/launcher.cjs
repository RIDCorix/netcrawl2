#!/usr/bin/env node
/**
 * NetCrawl Desktop Launcher
 * Starts the game server and opens the game in the default browser.
 * Works on macOS, Windows, and Linux without Electron/code signing.
 */
const http = require('http');
const path = require('path');
const { exec } = require('child_process');

const STATIC_DIR = path.join(__dirname, 'renderer');
const SERVER_PATH = path.join(__dirname, 'dist', 'server-bundle.js');

// Dynamic import of the bundled server
async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║         N E T C R A W L              ║');
  console.log('  ║    the programmable idle game         ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  Starting server...');

  // Set data directory
  const os = require('os');
  const fs = require('fs');
  const dataDir = path.join(os.homedir(), '.netcrawl');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  process.env.NETCRAWL_DATA_DIR = dataDir;

  // Start server
  const { startServer } = require(SERVER_PATH);
  const { port } = await startServer({
    port: 0,
    dataDir,
    staticDir: STATIC_DIR,
  });

  const url = `http://localhost:${port}`;
  console.log(`  Server running at ${url}`);
  console.log('  Opening browser...');
  console.log('');
  console.log('  Press Ctrl+C to stop the server.');
  console.log('');

  // Open browser
  const openCmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  exec(`${openCmd} ${url}`);
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
