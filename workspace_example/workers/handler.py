"""
Handler Worker — processes requests from API nodes.

This worker demonstrates:
- Polling the request queue
- Token validation (reject unauthenticated requests!)
- Computing responses based on request type
- Token caching to avoid redundant auth node trips

Usage in main.py:
    from workers.handler import Handler
    app.register(Handler)

Then deploy it to an api-type node (e.g. api_east_1).
"""

import time
from netcrawl import WorkerClass, Route


class Handler(WorkerClass):
    class_name = "Handler"
    class_id = "handler"

    # ── Optional: route to an auth node for token validation (advanced)
    # auth_node = Route("auth route")

    def on_startup(self):
        self.info("Handler ready — waiting for requests")

    def on_loop(self):
        req = self.poll_request()

        if req is None:
            time.sleep(0.5)
            return

        self.info(f"Got request: {req.type} | auth={'yes' if req.has_token else 'NO'}")

        # ⚠️  ALWAYS check has_token first!
        # Responding to an unauthenticated request adds +25 infection.
        if not req.has_token:
            self.reject(req.id, 401)
            self.warn(f"Rejected unauthenticated {req.type} → 401")
            return

        # Handle by request type
        if req.type == "compute":
            self._handle_compute(req)
        elif req.type == "echo":
            self.respond(req.id, {"value": req.body.get("value")})
        else:
            # Unknown type → 400 Bad Request
            self.reject(req.id, 400)
            self.warn(f"Unknown request type: {req.type}")

    def _handle_compute(self, req):
        """Handle math computation requests."""
        op = req.body.get("op")
        a = req.body.get("a", 0)
        b = req.body.get("b", 0)

        try:
            if op == "add":
                result = a + b
            elif op == "sub":
                result = a - b
            elif op == "mul":
                result = a * b
            elif op == "max":
                result = max(a, b)
            elif op == "mod":
                result = a % b if b != 0 else 0
            else:
                self.reject(req.id, 400)
                self.warn(f"Unknown op: {op}")
                return

            self.respond(req.id, {"result": result})
            self.info(f"compute/{op}({a},{b}) = {result} ✓")

        except Exception as e:
            self.reject(req.id, 500)
            self.error(f"Compute error: {e}")
