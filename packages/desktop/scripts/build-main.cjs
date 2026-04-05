/**
 * Bundle the Electron main process using esbuild.
 * Marks 'electron' as external so it resolves to the Electron built-in module at runtime
 * instead of the npm package (which just returns the binary path string).
 */
const { buildSync } = require('esbuild');
const path = require('path');

// Main process
buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: path.join(__dirname, '..', 'dist', 'main.js'),
  external: ['electron', 'steamworks.js'],
  format: 'cjs',
  sourcemap: true,
  define: { 'process.env.NETCRAWL_BUNDLED': '"1"' },
});

// Preload script (runs in renderer context, must also externalize electron)
buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'preload.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: path.join(__dirname, '..', 'dist', 'preload.js'),
  external: ['electron'],
  format: 'cjs',
  sourcemap: true,
});

console.log('Built main process + preload');
