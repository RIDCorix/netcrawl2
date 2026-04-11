/**
 * Puzzle definitions for Compute Nodes.
 *
 * Each puzzle type is a template that generates random instances.
 * Workers call compute() to get a task, then submit(taskId, answer).
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type PuzzleDifficulty = 'easy' | 'medium' | 'hard';

export interface PuzzleTemplate {
  id: string;
  name: string;
  description: string;
  difficulty: PuzzleDifficulty;
  /** Generate a random puzzle instance */
  generate: () => { params: Record<string, any>; answer: number | string; hint: string };
  /** Reward multiplier (base reward * this) */
  rewardMultiplier: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Puzzle templates ────────────────────────────────────────────────────────

export const PUZZLE_TEMPLATES: PuzzleTemplate[] = [
  // ── Easy ───────────────────────────────────────────────────────────────
  {
    id: 'add', name: 'Addition', description: 'Compute a + b',
    difficulty: 'easy', rewardMultiplier: 1,
    generate: () => {
      const a = randInt(1, 50); const b = randInt(1, 50);
      return { params: { a, b, op: 'add' }, answer: a + b, hint: `${a} + ${b}` };
    },
  },
  {
    id: 'subtract', name: 'Subtraction', description: 'Compute a - b',
    difficulty: 'easy', rewardMultiplier: 1,
    generate: () => {
      const a = randInt(10, 100); const b = randInt(1, a);
      return { params: { a, b, op: 'subtract' }, answer: a - b, hint: `${a} - ${b}` };
    },
  },
  {
    id: 'multiply', name: 'Multiplication', description: 'Compute a * b',
    difficulty: 'easy', rewardMultiplier: 1,
    generate: () => {
      const a = randInt(2, 20); const b = randInt(2, 20);
      return { params: { a, b, op: 'multiply' }, answer: a * b, hint: `${a} * ${b}` };
    },
  },
  {
    id: 'floor_div', name: 'Floor Division', description: 'Compute a // b (integer division)',
    difficulty: 'easy', rewardMultiplier: 1,
    generate: () => {
      const b = randInt(2, 15); const a = randInt(b, b * 20);
      return { params: { a, b, op: 'floor_divide' }, answer: Math.floor(a / b), hint: `${a} // ${b}` };
    },
  },
  {
    id: 'modulo', name: 'Modulo', description: 'Compute a % b',
    difficulty: 'easy', rewardMultiplier: 1,
    generate: () => {
      const b = randInt(2, 15); const a = randInt(b, b * 20);
      return { params: { a, b, op: 'modulo' }, answer: a % b, hint: `${a} % ${b}` };
    },
  },

  // ── Medium ─────────────────────────────────────────────────────────────
  {
    id: 'max_of_three', name: 'Maximum', description: 'Find the maximum of three numbers',
    difficulty: 'medium', rewardMultiplier: 2,
    generate: () => {
      const nums = [randInt(1, 100), randInt(1, 100), randInt(1, 100)];
      return { params: { numbers: nums, op: 'max' }, answer: Math.max(...nums), hint: `max(${nums.join(', ')})` };
    },
  },
  {
    id: 'sum_list', name: 'Sum List', description: 'Sum all numbers in the list',
    difficulty: 'medium', rewardMultiplier: 2,
    generate: () => {
      const len = randInt(3, 8);
      const nums = Array.from({ length: len }, () => randInt(1, 50));
      return { params: { numbers: nums, op: 'sum' }, answer: nums.reduce((a, b) => a + b, 0), hint: `sum(${JSON.stringify(nums)})` };
    },
  },
  {
    id: 'count_evens', name: 'Count Evens', description: 'Count even numbers in the list',
    difficulty: 'medium', rewardMultiplier: 2,
    generate: () => {
      const len = randInt(4, 10);
      const nums = Array.from({ length: len }, () => randInt(1, 50));
      const count = nums.filter(n => n % 2 === 0).length;
      return { params: { numbers: nums, op: 'count_evens' }, answer: count, hint: `count evens in ${JSON.stringify(nums)}` };
    },
  },
  {
    id: 'string_length', name: 'String Length', description: 'Return the length of the string',
    difficulty: 'medium', rewardMultiplier: 2,
    generate: () => {
      const words = ['netcrawl', 'python', 'algorithm', 'network', 'compute', 'worker', 'deploy', 'resource', 'mining', 'firewall'];
      const word = randChoice(words);
      return { params: { text: word, op: 'length' }, answer: word.length, hint: `len("${word}")` };
    },
  },
  {
    id: 'power', name: 'Exponent', description: 'Compute base ** exp',
    difficulty: 'medium', rewardMultiplier: 2,
    generate: () => {
      const base = randInt(2, 10); const exp = randInt(2, 4);
      return { params: { base, exp, op: 'power' }, answer: Math.pow(base, exp), hint: `${base} ** ${exp}` };
    },
  },

  // ── Hard ───────────────────────────────────────────────────────────────
  {
    id: 'fibonacci', name: 'Fibonacci', description: 'Return the n-th Fibonacci number (0-indexed)',
    difficulty: 'hard', rewardMultiplier: 4,
    generate: () => {
      const n = randInt(5, 15);
      let a = 0, b = 1;
      for (let i = 0; i < n; i++) { [a, b] = [b, a + b]; }
      return { params: { n, op: 'fibonacci' }, answer: a, hint: `fib(${n})` };
    },
  },
  {
    id: 'sort_and_median', name: 'Median', description: 'Find the median of the list',
    difficulty: 'hard', rewardMultiplier: 4,
    generate: () => {
      const len = randChoice([5, 7, 9]); // odd length for clean median
      const nums = Array.from({ length: len }, () => randInt(1, 100));
      const sorted = [...nums].sort((a, b) => a - b);
      const median = sorted[Math.floor(len / 2)];
      return { params: { numbers: nums, op: 'median' }, answer: median, hint: `median(${JSON.stringify(nums)})` };
    },
  },
  {
    id: 'unique_count', name: 'Unique Count', description: 'Count unique values in the list',
    difficulty: 'hard', rewardMultiplier: 4,
    generate: () => {
      const len = randInt(6, 12);
      const nums = Array.from({ length: len }, () => randInt(1, 20));
      const unique = new Set(nums).size;
      return { params: { numbers: nums, op: 'unique_count' }, answer: unique, hint: `len(set(${JSON.stringify(nums)}))` };
    },
  },
  {
    id: 'gcd', name: 'GCD', description: 'Find the greatest common divisor',
    difficulty: 'hard', rewardMultiplier: 4,
    generate: () => {
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
      const a = randInt(10, 200); const b = randInt(10, 200);
      return { params: { a, b, op: 'gcd' }, answer: gcd(a, b), hint: `gcd(${a}, ${b})` };
    },
  },

  // ── Capstone: Calculator ─────────────────────────────────────────────────
  // The graduation puzzle. Players have seen +, −, ×, ÷ in isolation; here
  // they're asked to *combine* them under operator precedence, essentially
  // writing a mini-calculator. Used as the gating puzzle for the Observatory
  // promotion node that unlocks Layer 1 (Chapter 2).
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Evaluate a short infix expression with + − × ÷ and precedence',
    difficulty: 'hard',
    rewardMultiplier: 5,
    generate: () => {
      // Generate a 3-operand expression like "8 + 6 * 2" that the player must
      // evaluate respecting × / ÷ precedence over + / −.
      // Integer-only — we pick divisors that evenly divide to keep the answer
      // a whole number (no floats, no floor_div ambiguity).
      const ops: Array<'+' | '-' | '*' | '/'> = ['+', '-', '*', '/'];
      const op1 = randChoice(ops);
      const op2 = randChoice(ops);
      const a = randInt(2, 20);
      const b = randInt(2, 20);
      let c = randInt(2, 20);

      // If either op is division, make sure the divisor evenly divides.
      // We pick `c` such that (a op1 b) / c or b / c is clean.
      if (op2 === '/') {
        // b / c — ensure c divides b
        const divisors = [];
        for (let i = 2; i <= b; i++) if (b % i === 0) divisors.push(i);
        c = divisors.length > 0 ? randChoice(divisors) : 1;
      }

      const expr = `${a} ${op1} ${b} ${op2} ${c}`;
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${expr});`)();
      const answer = Math.trunc(value);

      return {
        params: { a, b, c, op1, op2, op: 'calculator', expression: expr },
        answer,
        hint: `eval("${expr}") — mind operator precedence`,
      };
    },
  },
];

// ── Difficulty config ───────────────────────────────────────────────────────

export const DIFFICULTY_CONFIG: Record<PuzzleDifficulty, { baseReward: number; color: string; cooldownMs: number }> = {
  easy: { baseReward: 5, color: '#4ade80', cooldownMs: 10_000 },
  medium: { baseReward: 15, color: '#60a5fa', cooldownMs: 20_000 },
  hard: { baseReward: 40, color: '#f59e0b', cooldownMs: 30_000 },
};

// ── Active puzzle instance ──────────────────────────────────────────────────

export interface PuzzleInstance {
  taskId: string;
  templateId: string;
  params: Record<string, any>;
  answer: number | string;
  hint: string;
  difficulty: PuzzleDifficulty;
  createdAt: number;
}

/**
 * Generate a new puzzle instance.
 *
 * By default, picks a random template from the pool matching `difficulty`.
 * If `fixedTemplateId` is supplied (e.g. the Observatory always serves the
 * calculator capstone), that specific template is used instead, and its own
 * difficulty wins regardless of `difficulty`.
 */
export function generatePuzzle(difficulty: PuzzleDifficulty, fixedTemplateId?: string): PuzzleInstance {
  let template: PuzzleTemplate | undefined;
  if (fixedTemplateId) {
    template = PUZZLE_TEMPLATES.find(t => t.id === fixedTemplateId);
  }
  if (!template) {
    const pool = PUZZLE_TEMPLATES.filter(t => t.difficulty === difficulty);
    template = pool[Math.floor(Math.random() * pool.length)];
  }
  const instance = template.generate();
  return {
    taskId: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    templateId: template.id,
    params: instance.params,
    answer: instance.answer,
    hint: instance.hint,
    difficulty: template.difficulty,
    createdAt: Date.now(),
  };
}
