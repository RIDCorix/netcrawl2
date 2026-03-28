"""
Solver -- compute puzzle worker

Moves to a compute node, requests a puzzle, solves it, submits the answer.
Supports all puzzle types: add, subtract, multiply, floor_divide, modulo,
max, sum, count_evens, length, power, fibonacci, median, unique_count, gcd.

Deploy to: any node adjacent to a compute node
Route: path to the compute node
"""
from netcrawl import WorkerClass, Route
import math


class Solver(WorkerClass):
    class_name = "Solver"
    class_id = "solver"

    route = Route("Path to compute node")

    def on_startup(self):
        self.solves = 0
        self.info("Solver online!")

        if isinstance(self.route, list) and len(self.route) == 2:
            self.compute_node = self.route[1] if self.route[0] == "hub" else self.route[0]
            self.hub_node = self.route[0] if self.route[0] == "hub" else self.route[1]
        else:
            self.compute_node = None
            self.hub_node = "hub"

    def on_loop(self):
        if not self.compute_node:
            self.error("No compute node configured")
            import time; time.sleep(5)
            return

        # Move to compute node
        if self._current_node != self.compute_node:
            self.move(self.compute_node)

        # Get puzzle
        try:
            task = self.compute()
        except ValueError as e:
            self.warn(f"compute() failed: {e}")
            import time; time.sleep(3)
            return

        params = task["params"]
        op = params.get("op", "")
        self.info(f"Puzzle: {task['hint']} (difficulty: {task['difficulty']})")

        # Solve it
        answer = self.solve(op, params)

        if answer is None:
            self.warn(f"Unknown op: {op}")
            import time; time.sleep(2)
            return

        # Submit
        result = self.submit(task["taskId"], answer)
        if result.get("correct"):
            reward = result.get("reward", {})
            self.solves += 1
            self.info(f"Correct! +{reward.get('amount', 0)} {reward.get('type', '')} (#{self.solves})")
        else:
            self.warn(f"Wrong! Expected {result.get('expected')}, got {answer}")

    def solve(self, op: str, params: dict):
        """Solve a puzzle given its operation and parameters."""
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
