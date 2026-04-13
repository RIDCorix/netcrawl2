import type { NodeDialogPlugin } from '../../types';

const MARKDOWN = `## Medium Compute Puzzles

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

const plugin: NodeDialogPlugin = {
  id: 'compute/generic-medium',
  nodeType: 'compute',
  dialogKey: 'puzzleCatalog',
  priority: 0,
  match: (data) => !data.fixedPuzzleTemplate && data.difficulty === 'medium',
  build: (data) => ({
    buttonLabel: 'Puzzle Catalog',
    dialogTitle: `Puzzles — ${data.label} (MEDIUM)`,
    dialogContent: MARKDOWN,
  }),
};

export default plugin;
