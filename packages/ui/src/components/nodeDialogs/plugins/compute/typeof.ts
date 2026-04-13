import type { NodeDialogPlugin } from '../../types';

const MARKDOWN = `## Data Types — \`op: "typeof"\`

The entry node of the Operator Academy. Every task hands you a Python value
and asks for its **type name** as a string — exactly what \`type(x).__name__\`
would return.

**Parameters**

| Key       | Type | Description                                  |
|-----------|------|----------------------------------------------|
| \`value\`   | any  | The value to inspect (int/str/list/bool/…)   |
| \`display\` | str  | Human-readable rendering (for the hint)       |
| \`op\`      | str  | \`"typeof"\`                                    |

**Possible answers**

| Python value    | Expected answer |
|-----------------|-----------------|
| \`42\`, \`-7\`, \`0\`  | \`"int"\`         |
| \`3.14\`, \`0.5\`    | \`"float"\`       |
| \`"hello"\`, \`""\`  | \`"str"\`         |
| \`True\`, \`False\`  | \`"bool"\`        |
| \`[1, 2, 3]\`, \`[]\`| \`"list"\`        |
| \`{"a": 1}\`, \`{}\` | \`"dict"\`        |

**Solution**

\`\`\`python
task = node.get_task()
answer = type(task.parameters["value"]).__name__
node.submit(task.task_id, answer)
\`\`\`

> 💡 \`type(x).__name__\` returns the plain type name as a string, which is
> exactly what the grader compares against.
`;

const plugin: NodeDialogPlugin = {
  id: 'compute/typeof',
  nodeType: 'compute',
  dialogKey: 'puzzleCatalog',
  priority: 10,
  match: (data) => data.fixedPuzzleTemplate === 'typeof',
  build: (data) => ({
    buttonLabel: 'Puzzle Catalog',
    dialogTitle: `Puzzle — ${data.label}`,
    dialogContent: MARKDOWN,
  }),
};

export default plugin;
