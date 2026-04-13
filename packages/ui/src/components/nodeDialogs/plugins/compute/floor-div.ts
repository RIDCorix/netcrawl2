import type { NodeDialogPlugin } from '../../types';

const MARKDOWN = `## Floor Division — \`op: "floor_divide"\`

Compute \`a // b\` (Python integer quotient). The generator guarantees
\`b >= 2\`, so you never hit divide-by-zero.

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
task = node.get_task()
p = task.parameters
node.submit(task.task_id, p["a"] // p["b"])
\`\`\`

> ⚠️  Do **not** use \`/\` — that returns a \`float\` and the grader will reject it.
`;

const plugin: NodeDialogPlugin = {
  id: 'compute/floor-div',
  nodeType: 'compute',
  dialogKey: 'puzzleCatalog',
  priority: 10,
  match: (data) => data.fixedPuzzleTemplate === 'floor_div',
  build: (data) => ({
    buttonLabel: 'Puzzle Catalog',
    dialogTitle: `Puzzle — ${data.label}`,
    dialogContent: MARKDOWN,
  }),
};

export default plugin;
