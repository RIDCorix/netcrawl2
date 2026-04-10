/**
 * NodeInfoDialog — generic pluggable dialog for node-specific detail views.
 * Each node type can register dialog configs with buttons, titles, and markdown content.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Markdown } from './ui/markdown';

export interface NodeDialogConfig {
  buttonLabel: string;
  buttonIcon?: React.ReactNode;
  dialogTitle: string;
  dialogContent: string; // Markdown
}

/** Registry of dialog configs per node type. Each node type can have multiple dialogs. */
export const NODE_DIALOG_REGISTRY: Record<string, Record<string, (nodeData: any) => NodeDialogConfig>> = {
  compute: {
    puzzleCatalog: (data: any) => ({
      buttonLabel: 'Puzzle Catalog',
      dialogTitle: `Puzzles — ${data.label} (${(data.difficulty || 'easy').toUpperCase()})`,
      dialogContent: getPuzzleCatalogMarkdown(data.difficulty || 'easy'),
    }),
  },
};

function getPuzzleCatalogMarkdown(difficulty: string): string {
  if (difficulty === 'easy') return EASY_PUZZLE_MARKDOWN;
  if (difficulty === 'medium') return MEDIUM_PUZZLE_MARKDOWN;
  if (difficulty === 'hard') return HARD_PUZZLE_MARKDOWN;
  return EASY_PUZZLE_MARKDOWN;
}

// ═══════════════════════════════════════════════════════════════════════════
// Easy puzzles — full LeetCode-style catalog
// ═══════════════════════════════════════════════════════════════════════════
const EASY_PUZZLE_MARKDOWN = `## Easy Compute Puzzles

A Compute Node (\`easy\`) randomly serves **one of five** arithmetic puzzles on
every \`get_task()\` call. Your worker must read \`task.parameters["op"]\`,
compute the answer, and submit it with \`node.submit(task_id, answer)\`.

Each request carries:

\`\`\`python
task.task_id    # str — pass this back to submit()
task.parameters # dict — inputs + "op" discriminator
task.hint       # str — human-readable expression, e.g. "12 + 37"
\`\`\`

---

### 1. Addition — \`op: "add"\`

Compute the sum of two integers.

**Parameters**

| Key  | Type | Range    |
|------|------|----------|
| \`a\`  | int  | [1, 50]  |
| \`b\`  | int  | [1, 50]  |
| \`op\` | str  | \`"add"\`  |

**Example**

\`\`\`
Input:  a=12, b=37
Output: 49
\`\`\`

**Solution**

\`\`\`python
answer = params["a"] + params["b"]
\`\`\`

---

### 2. Subtraction — \`op: "subtract"\`

Compute \`a - b\`. The generator guarantees \`a >= b\`, so the result is always
non-negative.

**Parameters**

| Key  | Type | Range          |
|------|------|----------------|
| \`a\`  | int  | [10, 100]      |
| \`b\`  | int  | [1, a]         |
| \`op\` | str  | \`"subtract"\`   |

**Example**

\`\`\`
Input:  a=80, b=23
Output: 57
\`\`\`

**Solution**

\`\`\`python
answer = params["a"] - params["b"]
\`\`\`

---

### 3. Multiplication — \`op: "multiply"\`

Compute \`a * b\`.

**Parameters**

| Key  | Type | Range          |
|------|------|----------------|
| \`a\`  | int  | [2, 20]        |
| \`b\`  | int  | [2, 20]        |
| \`op\` | str  | \`"multiply"\`   |

**Example**

\`\`\`
Input:  a=6, b=7
Output: 42
\`\`\`

**Solution**

\`\`\`python
answer = params["a"] * params["b"]
\`\`\`

---

### 4. Floor Division — \`op: "floor_divide"\`

Compute \`a // b\` (Python floor division — integer quotient).

The generator guarantees \`b >= 2\` and \`a \u2208 [b, 20b]\`, so you never have
to handle divide-by-zero.

**Parameters**

| Key  | Type | Range             |
|------|------|-------------------|
| \`a\`  | int  | [b, b·20]         |
| \`b\`  | int  | [2, 15]           |
| \`op\` | str  | \`"floor_divide"\`  |

**Example**

\`\`\`
Input:  a=47, b=5
Output: 9       # 47 // 5 == 9, not 9.4
\`\`\`

**Solution**

\`\`\`python
answer = params["a"] // params["b"]
\`\`\`

> ⚠️  Do **not** use \`/\` — that returns a \`float\` and the grader will reject it.

---

### 5. Modulo — \`op: "modulo"\`

Compute \`a % b\` (Python remainder).

**Parameters**

| Key  | Type | Range        |
|------|------|--------------|
| \`a\`  | int  | [b, b·20]    |
| \`b\`  | int  | [2, 15]      |
| \`op\` | str  | \`"modulo"\`   |

**Example**

\`\`\`
Input:  a=47, b=5
Output: 2       # 47 == 9·5 + 2
\`\`\`

**Solution**

\`\`\`python
answer = params["a"] % params["b"]
\`\`\`

---

## Full reference implementation

A minimal worker that handles **all five** easy ops:

\`\`\`python
from netcrawl import WorkerClass
from netcrawl.nodes import ComputeNode

class Solver(WorkerClass):
    class_name = "Solver"
    class_id = "solver"

    def on_loop(self):
        node = self.get_current_node()
        if not isinstance(node, ComputeNode):
            return

        task = node.get_task()
        if task is None:
            return

        p = task.parameters
        op = p["op"]

        if op == "add":
            answer = p["a"] + p["b"]
        elif op == "subtract":
            answer = p["a"] - p["b"]
        elif op == "multiply":
            answer = p["a"] * p["b"]
        elif op == "floor_divide":
            answer = p["a"] // p["b"]
        elif op == "modulo":
            answer = p["a"] % p["b"]
        else:
            self.warn(f"unknown op: {op}")
            return

        result = node.submit(task.task_id, answer)
        if result["correct"]:
            self.info(f"{op}: {task.hint} = {answer} \u2713")
        else:
            self.warn(f"wrong answer for {task.hint}")
\`\`\`

---

## Rewards & cooldown

| Difficulty | Base reward | Cooldown between tasks |
|-----------|-------------|------------------------|
| Easy      | 5 data      | 10 s                   |
| Medium    | 15 data     | 20 s                   |
| Hard      | 40 data     | 30 s                   |

The node's level and installed chips can multiply the base reward.
`;

// Medium / hard keep the legacy compact view for now
const MEDIUM_PUZZLE_MARKDOWN = `## Medium Compute Puzzles

A medium Compute Node picks one of the following puzzles. Each one passes a
list/string under \`task.parameters\` and expects a single numeric answer.

- **Maximum** — \`op: "max"\` — \`max(numbers)\` (3 numbers)
- **Sum List** — \`op: "sum"\` — \`sum(numbers)\` (3–8 numbers)
- **Count Evens** — \`op: "count_evens"\` — count items where \`n % 2 == 0\`
- **String Length** — \`op: "length"\` — \`len(text)\`
- **Exponent** — \`op: "power"\` — \`base ** exp\`

### How to solve

\`\`\`python
task = node.get_task()
p = task.parameters
op = p["op"]

if op == "max":
    answer = max(p["numbers"])
elif op == "sum":
    answer = sum(p["numbers"])
elif op == "count_evens":
    answer = sum(1 for n in p["numbers"] if n % 2 == 0)
elif op == "length":
    answer = len(p["text"])
elif op == "power":
    answer = p["base"] ** p["exp"]

node.submit(task.task_id, answer)
\`\`\`
`;

const HARD_PUZZLE_MARKDOWN = `## Hard Compute Puzzles

A hard Compute Node picks one of:

- **Fibonacci** — \`op: "fibonacci"\` — n-th Fibonacci (0-indexed)
- **Median** — \`op: "median"\` — middle value of a sorted list (odd length)
- **Unique Count** — \`op: "unique_count"\` — \`len(set(numbers))\`
- **GCD** — \`op: "gcd"\` — greatest common divisor of two ints

### How to solve

\`\`\`python
from math import gcd

task = node.get_task()
p = task.parameters
op = p["op"]

if op == "fibonacci":
    n = p["n"]
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    answer = a
elif op == "median":
    s = sorted(p["numbers"])
    answer = s[len(s) // 2]
elif op == "unique_count":
    answer = len(set(p["numbers"]))
elif op == "gcd":
    answer = gcd(p["a"], p["b"])

node.submit(task.task_id, answer)
\`\`\`
`;

export function NodeInfoDialog({ config, onClose }: { config: NodeDialogConfig; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)', zIndex: 150,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(24px)',
          border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)',
          width: 880, maxWidth: 'calc(100vw - 48px)',
          height: 760, maxHeight: 'calc(100vh - 48px)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {config.dialogTitle}
          </span>
          <button onClick={onClose} style={{
            color: 'var(--text-muted)', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', padding: 4, display: 'flex',
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          <Markdown content={config.dialogContent} />
        </div>
      </motion.div>
    </motion.div>
  );
}
