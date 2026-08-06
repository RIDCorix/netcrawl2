import { mergeItemStacks } from '../types.js';
import type { ChapterZeroWorld } from './chapterZero.js';

export const MAX_LOOP_TICKS = 6;

export type StatementResult = {
  expression: string;
  transition: string | null;
  effect: string | null;
  error: string | null;
};

export type TickTrace = {
  phase: 'on_startup' | 'on_loop';
  tick: number;
  statements: StatementResult[];
};

export type CodeRunTrace = {
  world: ChapterZeroWorld;
  ticks: TickTrace[];
  fatalError: 'syntax' | 'unknown_ref' | null;
};

type Statement =
  | { kind: 'noop'; text: string }
  | { kind: 'call'; text: string; method: string; arg: { kind: 'none' } | { kind: 'attr'; name: string } }
  | { kind: 'if'; text: string; cond: { attr: string }; body: Statement[]; elseBody: Statement[] };

const SANDBOX_METHODS = new Set(['info', 'move', 'collect', 'deposit']);
const SANDBOX_ATTRS = new Set(['edge', 'node', 'holding', 'equipped']);

class SyntaxViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyntaxViolation';
  }
}

class UnknownRefViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownRefViolation';
  }
}

function countLeadingSpaces(line: string): number {
  let n = 0;
  for (const c of line) {
    if (c === ' ') n += 1;
    else if (c === '\t') n += 4;
    else break;
  }
  return n;
}

function normalizeLines(source: string): { indent: number; text: string; original: string }[] {
  const out: { indent: number; text: string; original: string }[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const text = raw.replace(/\s+$/g, '');
    const stripped = text.trimStart();
    if (stripped === '' || stripped.startsWith('#')) continue;
    out.push({ indent: countLeadingSpaces(text), text: stripped, original: text.trim() });
  }
  return out;
}

function parseStatement(text: string): Statement {
  if (text === 'pass') return { kind: 'noop', text };

  const callMatch = text.match(/^self\.([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
  if (callMatch) {
    const [, method, rawArg] = callMatch;
    const arg = rawArg.trim();
    let parsedArg: Statement extends { kind: 'call'; arg: infer A } ? A : never;
    if (arg === '') {
      parsedArg = { kind: 'none' } as never;
    } else {
      const attrMatch = arg.match(/^self\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
      if (!attrMatch) throw new SyntaxViolation(`unsupported argument in ${text}`);
      parsedArg = { kind: 'attr', name: attrMatch[1] } as never;
    }
    if (!SANDBOX_METHODS.has(method)) throw new UnknownRefViolation(`unknown method self.${method}`);
    return { kind: 'call', text, method, arg: parsedArg };
  }

  throw new SyntaxViolation(`unparseable: ${text}`);
}

function parseBlock(
  lines: { indent: number; text: string; original: string }[],
  cursor: { i: number },
  blockIndent: number,
): Statement[] {
  const stmts: Statement[] = [];
  while (cursor.i < lines.length) {
    const line = lines[cursor.i];
    if (line.indent < blockIndent) break;
    if (line.indent > blockIndent) throw new SyntaxViolation(`unexpected indent: ${line.original}`);

    const ifMatch = line.text.match(/^if\s+self\.([a-zA-Z_][a-zA-Z0-9_]*)\s*:$/);
    if (ifMatch) {
      const attr = ifMatch[1];
      if (!SANDBOX_ATTRS.has(attr)) throw new UnknownRefViolation(`unknown attr self.${attr}`);
      cursor.i += 1;
      const bodyStart = cursor.i < lines.length ? lines[cursor.i] : null;
      if (!bodyStart || bodyStart.indent <= blockIndent) throw new SyntaxViolation(`empty if body: ${line.original}`);
      const body = parseBlock(lines, cursor, bodyStart.indent);
      let elseBody: Statement[] = [];
      if (cursor.i < lines.length) {
        const maybeElse = lines[cursor.i];
        if (maybeElse.indent === blockIndent && maybeElse.text === 'else:') {
          cursor.i += 1;
          const eStart = cursor.i < lines.length ? lines[cursor.i] : null;
          if (!eStart || eStart.indent <= blockIndent) throw new SyntaxViolation('empty else body');
          elseBody = parseBlock(lines, cursor, eStart.indent);
        }
      }
      stmts.push({ kind: 'if', text: line.original, cond: { attr }, body, elseBody });
      continue;
    }
    if (line.text === 'else:') break;

    stmts.push(parseStatement(line.text));
    cursor.i += 1;
  }
  return stmts;
}

function parseSource(source: string): Statement[] {
  const lines = normalizeLines(source);
  if (lines.length === 0) return [];
  const baseIndent = lines[0].indent;
  for (const l of lines) {
    if (l.indent < baseIndent) throw new SyntaxViolation('inconsistent indent');
  }
  const cursor = { i: 0 };
  const stmts = parseBlock(lines, cursor, baseIndent);
  if (cursor.i < lines.length) throw new SyntaxViolation(`unexpected trailing: ${lines[cursor.i].original}`);
  return stmts;
}

function readAttr(world: ChapterZeroWorld, attr: string): { truthy: boolean; label: string } {
  switch (attr) {
    case 'edge':
      return { truthy: true, label: 'edge<hub↔mine>' };
    case 'node':
      return { truthy: !!world.worker.nodeId, label: world.worker.nodeId };
    case 'holding': {
      const count = world.worker.holding.reduce((s, i) => s + i.count, 0);
      return { truthy: count > 0, label: `holding(${count})` };
    }
    case 'equipped':
      return { truthy: !!world.worker.equippedPickaxe, label: world.worker.equippedPickaxe };
  }
  throw new UnknownRefViolation(`unknown attr self.${attr}`);
}

function invoke(
  world: ChapterZeroWorld,
  method: string,
  argAttr: string | null,
): { transition: string | null; effect: string } {
  if (method === 'info') {
    world.worker.lastLog = 'worker_ready';
    return {
      transition: 'logged_ready',
      effect: `info: node=${world.worker.nodeId} holding=${world.worker.holding.reduce((s, i) => s + i.count, 0)}`,
    };
  }
  if (method === 'move') {
    // Only supports self.edge as arg — validates against the sandbox's single edge.
    if (argAttr !== 'edge') throw new UnknownRefViolation('move requires self.edge');
    const from = world.worker.nodeId;
    const to = from === 'hub' ? 'mine' : 'hub';
    world.worker.nodeId = to;
    return { transition: to === 'mine' ? 'moved_to_mine' : 'returned_to_hub', effect: `moved: ${from} → ${to}` };
  }
  if (method === 'collect') {
    if (world.worker.nodeId !== 'mine' || world.mine.drops.length === 0) {
      throw new Error('nothing_to_collect');
    }
    const picked = world.mine.drops;
    world.worker.holding = mergeItemStacks(world.worker.holding, picked);
    const total = picked.reduce((s, i) => s + i.count, 0);
    world.mine.drops = [];
    return { transition: 'collected_data', effect: `collected: ${total} × data_fragment` };
  }
  if (method === 'deposit') {
    if (world.worker.nodeId !== 'hub' || world.worker.holding.length === 0) {
      throw new Error('cannot_deposit_here');
    }
    const total = world.worker.holding.filter(i => i.type === 'data_fragment').reduce((s, i) => s + i.count, 0);
    world.resources.data += total;
    world.worker.holding = [];
    return { transition: 'deposited_data', effect: `deposited: ${total} data` };
  }
  throw new UnknownRefViolation(`unknown method self.${method}`);
}

function runStatements(world: ChapterZeroWorld, stmts: Statement[]): StatementResult[] {
  const out: StatementResult[] = [];
  for (const stmt of stmts) {
    if (stmt.kind === 'noop') {
      out.push({ expression: 'pass', transition: null, effect: null, error: null });
      continue;
    }
    if (stmt.kind === 'if') {
      const { truthy } = readAttr(world, stmt.cond.attr);
      out.push({
        expression: stmt.text,
        transition: null,
        effect: `if self.${stmt.cond.attr} → ${truthy}`,
        error: null,
      });
      const chosen = truthy ? stmt.body : stmt.elseBody;
      out.push(...runStatements(world, chosen));
      continue;
    }
    const argAttr = stmt.arg.kind === 'attr' ? stmt.arg.name : null;
    if (argAttr && !SANDBOX_ATTRS.has(argAttr)) {
      out.push({ expression: stmt.text, transition: null, effect: null, error: `unknown attr self.${argAttr}` });
      continue;
    }
    try {
      const { transition, effect } = invoke(world, stmt.method, argAttr);
      out.push({ expression: stmt.text, transition, effect, error: null });
    } catch (err) {
      out.push({ expression: stmt.text, transition: null, effect: null, error: (err as Error).message });
    }
  }
  return out;
}

function completed(world: ChapterZeroWorld): boolean {
  return world.worker.nodeId === 'hub' && world.worker.holding.length === 0 && world.resources.data >= 3;
}

export function runChapterZeroCode(
  startWorld: ChapterZeroWorld,
  onStartupSrc: string,
  onLoopSrc: string,
): CodeRunTrace {
  const original = structuredClone(startWorld);
  let startupStmts: Statement[];
  let loopStmts: Statement[];
  try {
    startupStmts = parseSource(onStartupSrc);
    loopStmts = parseSource(onLoopSrc);
  } catch (err) {
    if (err instanceof SyntaxViolation) return { world: original, ticks: [], fatalError: 'syntax' };
    if (err instanceof UnknownRefViolation) return { world: original, ticks: [], fatalError: 'unknown_ref' };
    throw err;
  }

  const world = structuredClone(startWorld);
  const ticks: TickTrace[] = [];

  ticks.push({ phase: 'on_startup', tick: 1, statements: runStatements(world, startupStmts) });
  if (completed(world)) return { world, ticks, fatalError: null };

  for (let t = 1; t <= MAX_LOOP_TICKS; t += 1) {
    ticks.push({ phase: 'on_loop', tick: t, statements: runStatements(world, loopStmts) });
    if (completed(world)) break;
  }

  return { world, ticks, fatalError: null };
}
