import type { NodeDialogPlugin } from '../../types';

const MARKDOWN = `## Modulo — \`op: "modulo"\`

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
task = node.get_task()
p = task.parameters
node.submit(task.task_id, p["a"] % p["b"])
\`\`\`
`;

const plugin: NodeDialogPlugin = {
  id: 'compute/modulo',
  nodeType: 'compute',
  dialogKey: 'puzzleCatalog',
  priority: 10,
  match: (data) => data.fixedPuzzleTemplate === 'modulo',
  build: (data) => ({
    buttonLabel: 'Puzzle Catalog',
    dialogTitle: `Puzzle — ${data.label}`,
    dialogContent: MARKDOWN,
  }),
};

export default plugin;
