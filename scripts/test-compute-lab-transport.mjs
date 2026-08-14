import { mkdir, rm } from 'node:fs/promises';
import { build, stop } from '../packages/ui/node_modules/esbuild/lib/main.js';

const uiDir = new URL('../packages/ui', import.meta.url).pathname;
const outDir = new URL('../packages/ui/.test-dist', import.meta.url).pathname;
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

try {
  await build({
    absWorkingDir: uiDir,
    nodePaths: [new URL('../packages/ui/node_modules', import.meta.url).pathname],
    entryPoints: ['../../scripts/ComputeLabTransport.test.tsx'],
    outfile: `${outDir}/compute-lab-transport.mjs`,
    bundle: true,
    platform: 'node',
    format: 'esm',
    define: { 'import.meta.env.VITE_API_URL': '""' },
    banner: {
      js: 'globalThis.window ??= { location: { protocol: "http:", host: "localhost:5173" } }; globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };',
    },
    external: ['axios'],
    loader: { '.png': 'dataurl' },
    logLevel: 'warning',
  });
  await import(new URL('../packages/ui/.test-dist/compute-lab-transport.mjs', import.meta.url));
} finally {
  stop();
  await rm(outDir, { recursive: true, force: true });
}

process.exit(0);
