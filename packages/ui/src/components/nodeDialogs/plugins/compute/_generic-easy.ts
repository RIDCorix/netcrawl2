import type { NodeDialogPlugin } from '../../types';

// Legacy catalog for a classic "easy" compute node with no fixed template —
// picks a random easy puzzle each call, so the catalog lists all five.
const MARKDOWN = `## Easy Compute Puzzles

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

The generator guarantees \`b >= 2\` and \`a ∈ [b, 20b]\`, so you never have
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
            self.info(f"{op}: {task.hint} = {answer} ✓")
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

const plugin: NodeDialogPlugin = {
  id: 'compute/generic-easy',
  nodeType: 'compute',
  dialogKey: 'puzzleCatalog',
  priority: 0,
  match: (data) => !data.fixedPuzzleTemplate && (data.difficulty || 'easy') === 'easy',
  build: (data) => ({
    buttonLabel: 'Puzzle Catalog',
    dialogTitle: `Puzzles — ${data.label} (EASY)`,
    dialogContent: MARKDOWN,
  }),
};

export default plugin;
