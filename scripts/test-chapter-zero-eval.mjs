import assert from 'node:assert/strict';
import { runChapterZeroCode } from '../packages/server/.test-dist/domain/chapterZeroEval.js';

function baseWorld() {
  return {
    worker: {
      nodeId: 'mine',
      holding: [{ type: 'data_fragment', count: 3 }],
      equippedPickaxe: 'pickaxe_basic',
      lastLog: null,
    },
    mine: { drops: [] },
    resources: { data: 0 },
  };
}

// 1. Empty body — worker stays at mine, still holding.
{
  const trace = runChapterZeroCode(baseWorld(), 'pass', 'pass');
  assert.equal(trace.fatalError, null);
  assert.equal(trace.world.worker.nodeId, 'mine');
  assert.equal(trace.world.worker.holding.length, 1);
  assert.equal(trace.world.resources.data, 0);
}

// 2. Move only — never deposits; player keeps oscillating on the single edge.
{
  const trace = runChapterZeroCode(baseWorld(), 'pass', 'self.move(self.edge)');
  assert.equal(trace.fatalError, null);
  assert.equal(trace.world.worker.holding.length, 1, 'still holding — never deposited');
  assert.equal(trace.world.resources.data, 0);
}

// 3. Move + deposit — completes on the first loop tick.
{
  const trace = runChapterZeroCode(baseWorld(), 'pass', 'self.move(self.edge)\nself.deposit()');
  assert.equal(trace.fatalError, null);
  assert.equal(trace.world.worker.nodeId, 'hub');
  assert.equal(trace.world.worker.holding.length, 0);
  assert.equal(trace.world.resources.data, 3);
}

// 4. Conditional deposit — same tick completes; second tick's if branch is skipped.
{
  const source = 'if self.holding:\n    self.move(self.edge)\n    self.deposit()';
  const trace = runChapterZeroCode(baseWorld(), 'pass', source);
  assert.equal(trace.fatalError, null);
  assert.equal(trace.world.worker.holding.length, 0);
  assert.equal(trace.world.resources.data, 3);
  // First loop tick actually ran the body.
  const firstLoop = trace.ticks.find(t => t.phase === 'on_loop' && t.tick === 1);
  assert.ok(firstLoop, 'first loop tick present');
  const ifResult = firstLoop.statements.find(s => s.expression.startsWith('if'));
  assert.match(ifResult.effect, /→ true/);
}

// 5. Unparseable body — fatal syntax; world unchanged.
{
  const trace = runChapterZeroCode(baseWorld(), 'pass', 'wat is this line');
  assert.equal(trace.fatalError, 'syntax');
  assert.equal(trace.world.worker.nodeId, 'mine');
  assert.equal(trace.world.worker.holding[0].count, 3);
}

// 6. Unknown reference — fatal unknown_ref; world unchanged.
{
  const trace = runChapterZeroCode(baseWorld(), 'pass', 'self.foo()');
  assert.equal(trace.fatalError, 'unknown_ref');
  assert.equal(trace.world.worker.nodeId, 'mine');
  assert.equal(trace.world.worker.holding[0].count, 3);
}

console.log('Chapter Zero sandbox evaluator: 6 cases passed');
