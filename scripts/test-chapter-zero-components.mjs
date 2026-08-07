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
    entryPoints: ['../../scripts/ChapterZeroInstructionEditor.test.tsx'],
    outfile: `${outDir}/chapter-zero-components.mjs`,
    bundle: true,
    platform: 'node',
    format: 'esm',
    loader: { '.png': 'dataurl' },
    logLevel: 'warning',
  });
  await import(new URL('../packages/ui/.test-dist/chapter-zero-components.mjs', import.meta.url));
} finally {
  stop();
  await rm(outDir, { recursive: true, force: true });
}

// react-test-renderer keeps React's scheduler channel open in Node 26.
// All assertions and cleanup are complete at this point.
process.exit(0);
