/**
 * Build the standalone launcher:
 * 1. Bundle the server into a single file
 * 2. Copy the UI build to renderer/
 * 3. The launcher.cjs + dist/server-bundle.js + renderer/ = complete game
 */
const { buildSync } = require('esbuild');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');

// Bundle server
console.log('Bundling server...');
buildSync({
  entryPoints: [path.join(root, '..', 'server', 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: path.join(root, 'dist', 'server-bundle.js'),
  format: 'cjs',
  sourcemap: false,
  // Keep native modules external
  external: ['better-sqlite3', 'bufferutil', 'utf-8-validate'],
});

// Copy renderer if not already done
const rendererSrc = path.join(root, '..', 'ui', 'dist');
const rendererDest = path.join(root, 'renderer');
if (fs.existsSync(rendererSrc) && !fs.existsSync(path.join(rendererDest, 'index.html'))) {
  console.log('Copying UI build...');
  fs.cpSync(rendererSrc, rendererDest, { recursive: true });
}

console.log('Done! Run with: node launcher.cjs');
