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
    entryPoints: ['../../scripts/ComputeLabInteractions.test.tsx'],
    outfile: `${outDir}/compute-lab-interactions.mjs`,
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['axios'],
    plugins: [
      {
        name: 'node-info-dialog-test-double',
        setup(context) {
          context.onLoad({ filter: /NodeInfoDialog\.tsx$/ }, () => ({
            contents: 'export const NodeInfoDialog = () => null; export const getDialogsForNode = () => [];',
            loader: 'tsx',
          }));
        },
      },
    ],
    loader: { '.png': 'dataurl' },
    logLevel: 'warning',
  });
  await import(new URL('../packages/ui/.test-dist/compute-lab-interactions.mjs', import.meta.url));
} finally {
  stop();
  await rm(outDir, { recursive: true, force: true });
}

process.exit(0);
