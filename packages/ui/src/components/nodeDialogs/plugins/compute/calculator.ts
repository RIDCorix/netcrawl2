import type { NodeDialogPlugin } from '../../types';

const MARKDOWN = `## Calculator — \`op: "calculator"\`

The capstone of the Operator Academy. You receive a 3-operand infix
expression using \`+ - * /\` and must evaluate it **respecting operator
precedence** (multiplication and division before addition and subtraction).

All divisions divide evenly, so the answer is always an integer.

**Parameters**

| Key          | Type | Description                           |
|--------------|------|---------------------------------------|
| \`a\`          | int  | First operand  [2, 20]                |
| \`b\`          | int  | Second operand [2, 20]                |
| \`c\`          | int  | Third operand  (divides cleanly if /) |
| \`op1\`        | str  | First operator  (\`+\` \`-\` \`*\` \`/\`)      |
| \`op2\`        | str  | Second operator (\`+\` \`-\` \`*\` \`/\`)      |
| \`expression\` | str  | Human-readable form, e.g. \`"8 + 6 * 2"\` |
| \`op\`         | str  | \`"calculator"\`                         |

**Example**

\`\`\`
Input:  a=8, b=6, c=2, op1="+", op2="*"
        expression = "8 + 6 * 2"
Output: 20         # 6*2 first, then 8+12
\`\`\`

**Solution (simple — eval)**

\`\`\`python
task = node.get_task()
expr = task.parameters["expression"]
node.submit(task.task_id, int(eval(expr)))
\`\`\`

**Solution (manual precedence)**

\`\`\`python
def apply(op, x, y):
    if op == "+": return x + y
    if op == "-": return x - y
    if op == "*": return x * y
    if op == "/": return x // y

task = node.get_task()
p = task.parameters
a, b, c, op1, op2 = p["a"], p["b"], p["c"], p["op1"], p["op2"]

# × / ÷ bind tighter than + / −
if op2 in ("*", "/") and op1 in ("+", "-"):
    answer = apply(op1, a, apply(op2, b, c))
else:
    answer = apply(op2, apply(op1, a, b), c)

node.submit(task.task_id, answer)
\`\`\`

> 💡 This puzzle combines everything you learned at the five operator nodes.
> Once you solve it here, you've graduated the Operator Academy.
`;

const plugin: NodeDialogPlugin = {
  id: 'compute/calculator',
  nodeType: 'compute',
  dialogKey: 'puzzleCatalog',
  priority: 10,
  match: (data) => data.fixedPuzzleTemplate === 'calculator',
  build: (data) => ({
    buttonLabel: 'Puzzle Catalog',
    dialogTitle: `Puzzle — ${data.label}`,
    dialogContent: MARKDOWN,
  }),
};

export default plugin;
