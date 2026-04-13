import type { NodeDialogPlugin } from '../../types';

const MARKDOWN = `## Subtraction — \`op: "subtract"\`

Compute \`a - b\`. The generator guarantees \`a >= b\`, so the answer is always
non-negative.

**Parameters**

| Key  | Type | Range        |
|------|------|--------------|
| \`a\`  | int  | [10, 100]    |
| \`b\`  | int  | [1, a]       |
| \`op\` | str  | \`"subtract"\` |

**Example**

\`\`\`
Input:  a=80, b=23
Output: 57
\`\`\`

**Solution**

\`\`\`python
task = node.get_task()
p = task.parameters
node.submit(task.task_id, p["a"] - p["b"])
\`\`\`
`;

const plugin: NodeDialogPlugin = {
  id: 'compute/subtract',
  nodeType: 'compute',
  dialogKey: 'puzzleCatalog',
  priority: 10,
  match: (data) => data.fixedPuzzleTemplate === 'subtract',
  build: (data) => ({
    buttonLabel: 'Puzzle Catalog',
    dialogTitle: `Puzzle — ${data.label}`,
    dialogContent: MARKDOWN,
  }),
};

export default plugin;
