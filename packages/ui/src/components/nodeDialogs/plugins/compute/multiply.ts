import type { NodeDialogPlugin } from '../../types';

const MARKDOWN = `## Multiplication — \`op: "multiply"\`

Compute \`a * b\`.

**Parameters**

| Key  | Type | Range        |
|------|------|--------------|
| \`a\`  | int  | [2, 20]      |
| \`b\`  | int  | [2, 20]      |
| \`op\` | str  | \`"multiply"\` |

**Example**

\`\`\`
Input:  a=6, b=7
Output: 42
\`\`\`

**Solution**

\`\`\`python
task = node.get_task()
p = task.parameters
node.submit(task.task_id, p["a"] * p["b"])
\`\`\`
`;

const plugin: NodeDialogPlugin = {
  id: 'compute/multiply',
  nodeType: 'compute',
  dialogKey: 'puzzleCatalog',
  priority: 10,
  match: (data) => data.fixedPuzzleTemplate === 'multiply',
  build: (data) => ({
    buttonLabel: 'Puzzle Catalog',
    dialogTitle: `Puzzle — ${data.label}`,
    dialogContent: MARKDOWN,
  }),
};

export default plugin;
