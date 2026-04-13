import type { NodeDialogPlugin } from '../../types';

const MARKDOWN = `## Addition — \`op: "add"\`

This node only serves one puzzle: compute \`a + b\`.

**Parameters**

| Key  | Type | Range   |
|------|------|---------|
| \`a\`  | int  | [1, 50] |
| \`b\`  | int  | [1, 50] |
| \`op\` | str  | \`"add"\` |

**Example**

\`\`\`
Input:  a=12, b=37
Output: 49
\`\`\`

**Solution**

\`\`\`python
task = node.get_task()
p = task.parameters
node.submit(task.task_id, p["a"] + p["b"])
\`\`\`
`;

const plugin: NodeDialogPlugin = {
  id: 'compute/add',
  nodeType: 'compute',
  dialogKey: 'puzzleCatalog',
  priority: 10,
  match: (data) => data.fixedPuzzleTemplate === 'add',
  build: (data) => ({
    buttonLabel: 'Puzzle Catalog',
    dialogTitle: `Puzzle — ${data.label}`,
    dialogContent: MARKDOWN,
  }),
};

export default plugin;
