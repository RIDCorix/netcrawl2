import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../packages/ui/src/components/ComputeLabScreen.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../packages/server/src/routes/computeLabRoutes.ts', import.meta.url), 'utf8');
const deployRoutes = readFileSync(new URL('../packages/server/src/routes/deployRoutes.ts', import.meta.url), 'utf8');
const nodeDetail = readFileSync(new URL('../packages/ui/src/components/NodeDetailPanel.tsx', import.meta.url), 'utf8');
const nodeTypeInfo = readFileSync(
  new URL('../packages/ui/src/components/nodeDetail/NodeTypeInfo.tsx', import.meta.url),
  'utf8',
);
const runner = readFileSync(new URL('../packages/sdk-python/netcrawl/compute_lab_runner.py', import.meta.url), 'utf8');
const locales = ['en', 'ja', 'zh-TW'].map(locale =>
  readFileSync(new URL(`../packages/ui/src/i18n/${locale}.ts`, import.meta.url), 'utf8'),
);

assert.match(screen, /role="dialog"/);
assert.match(screen, /aria-modal="true"/);
assert.match(screen, /textarea/);
assert.match(screen, /compute-lab\/tasks/);
assert.match(screen, /compute-lab\/runs/);
assert.match(screen, /compute_lab\.submit_correct/);
assert.match(screen, /submissionSuccess/);
assert.match(screen, /compute_lab\.operators_progress/);
assert.match(screen, /compute_lab\.operators_completed/);
assert.match(screen, /compute_lab\.task_load_failed/);
assert.match(screen, /SUBMIT LAST RUN|compute_lab\.submit/);
assert.match(screen, /type="range"/);
assert.doesNotMatch(screen, /GraphCanvas|LAB_NODES|NodeDetailPanel|worker\.goto/);
assert.match(server, /compute-lab\/tasks/);
assert.match(server, /compute-lab\/submissions/);
assert.match(server, /getActiveComputeLabTask/);
assert.match(runner, /sys\.settrace/);
assert.match(runner, /InstrumentExpressions/);
assert.match(runner, /attribute access is not allowed/);
assert.match(runner, /ProblemSolver/);
assert.match(screen, /starterSource/);
assert.match(screen, /task\?\.description/);
assert.match(screen, /compute_lab\.task_description/);
assert.match(screen, /limit_reached/);
assert.match(screen, /EXPRESSION_CARD_REGISTRY/);
assert.match(screen, /compute-lab-generic-expression/);
assert.match(screen, /frame\.control/);
assert.match(screen, /compute_lab\.old_trace/);
assert.match(nodeDetail, /eligibility=\{node\.type === 'compute' \? 'compute_automation' : undefined\}/);
assert.match(nodeTypeInfo, /AUTOMATE WITH WORKER|compute_lab\.automate/);
assert.match(nodeTypeInfo, /from workers\.solver import Solver/);
assert.match(deployRoutes, /compute_lab_required/);
assert.match(deployRoutes, /compute_worker_required/);
for (const key of [
  'task_load_failed',
  'connection_lost',
  'run_start_failed',
  'submit_correct',
  'submit_wrong',
  'submit_failed',
  'node_solve_count',
  'operators_progress',
  'operators_completed',
  'expression_fallback',
  'source_location',
  'control',
  'old_trace',
]) {
  for (const locale of locales) assert.match(locale, new RegExp(`compute_lab\\.${key}`));
}
console.log('focused Compute Lab contract passed');
