const esbuild = require('esbuild');

esbuild.buildSync({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: !process.argv.includes('--production'),
  minify: process.argv.includes('--production'),
});
