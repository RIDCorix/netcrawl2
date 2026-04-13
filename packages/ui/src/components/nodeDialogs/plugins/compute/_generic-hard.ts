import type { NodeDialogPlugin } from '../../types';

const MARKDOWN = `## Hard Compute Puzzles

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

const plugin: NodeDialogPlugin = {
  id: 'compute/generic-hard',
  nodeType: 'compute',
  dialogKey: 'puzzleCatalog',
  priority: 0,
  match: (data) => !data.fixedPuzzleTemplate && data.difficulty === 'hard',
  build: (data) => ({
    buttonLabel: 'Puzzle Catalog',
    dialogTitle: `Puzzles — ${data.label} (HARD)`,
    dialogContent: MARKDOWN,
  }),
};

export default plugin;
