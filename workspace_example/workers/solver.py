"""
Solver -- compute puzzle worker (using node-based API)

Moves to a compute node, gets a task from the node, solves it, submits.

Deploy to: any node adjacent to a compute node
Route: edge to the compute node
"""
from netcrawl import WorkerClass, Route, ComputeNode
import math


class Solver(WorkerClass):
    class_name = "Solver"
    class_id = "solver"

    route = Route("Path to compute node")

    def on_startup(self):
        self.solves = 0
        self.edge_id = self.route if isinstance(self.route, str) else None
        self.info(f"Solver online! Edge: {self.edge_id}")

    def on_loop(self):
        if not self.edge_id:
            self.error("No edge configured")
            import time; time.sleep(5)
            return

        # Move to compute node
        if self._current_node == "hub":
            self.move_edge(self.edge_id)

        # Get the node object
        node = self.get_current_node()

        if not isinstance(node, ComputeNode):
            self.warn(f"Not a compute node: {node.type}")
            self.move_edge(self.edge_id)  # go back
            import time; time.sleep(3)
            return

        # Get puzzle from the node
        try:
            task = node.get_task()
        except ValueError as e:
            self.warn(f"get_task() failed: {e}")
            import time; time.sleep(3)
            return

        self.info(f"Puzzle: {task.hint} (difficulty: {task.difficulty})")

        # Solve it
        answer = self.solve(task.parameters)

        if answer is None:
            self.warn(f"Unknown op: {task.parameters.get('op')}")
            import time; time.sleep(2)
            return

        # Submit answer to the node
        result = node.submit(task.task_id, answer)
        if result.get("correct"):
            reward = result.get("reward", {})
            self.solves += 1
            self.info(f"Correct! +{reward.get('amount', 0)} {reward.get('type', '')} (#{self.solves})")
        else:
            self.warn(f"Wrong! Expected {result.get('expected')}, got {answer}")

        # Go back to hub
        self.move_edge(self.edge_id)

    def solve(self, params: dict):
        """Solve a puzzle given its parameters."""
        op = params.get("op", "")
        a = params.get("a", 0)
        b = params.get("b", 0)
        numbers = params.get("numbers", [])

        if op == "add": return a + b
        if op == "subtract": return a - b
        if op == "multiply": return a * b
        if op == "floor_divide": return a // b
        if op == "modulo": return a % b
        if op == "max": return max(numbers)
        if op == "sum": return sum(numbers)
        if op == "count_evens": return sum(1 for n in numbers if n % 2 == 0)
        if op == "length": return len(params.get("text", ""))
        if op == "power": return params.get("base", 0) ** params.get("exp", 1)
        if op == "fibonacci":
            n = params.get("n", 0)
            fa, fb = 0, 1
            for _ in range(n):
                fa, fb = fb, fa + fb
            return fa
        if op == "median":
            s = sorted(numbers)
            return s[len(s) // 2]
        if op == "unique_count": return len(set(numbers))
        if op == "gcd": return math.gcd(a, b)
        return None
