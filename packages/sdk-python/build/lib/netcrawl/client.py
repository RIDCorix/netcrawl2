"""
netcrawl/client.py

HTTP client for communicating with the NetCrawl API server.
Uses only stdlib (no requests dependency) for portability.
"""

import json
import urllib.request
import urllib.error
from typing import Any


class ApiClient:
    """
    HTTP client for communicating with the NetCrawl API server.
    Uses only stdlib (no requests dependency) for portability.
    """

    def __init__(self, api_url: str, worker_id: str):
        self.api_url = api_url.rstrip("/")
        self.worker_id = worker_id

    def action(self, action: str, payload: dict) -> dict:
        """
        POST /api/worker/action
        { workerId, action, payload }
        Returns server response as dict.
        """
        body = json.dumps({
            "workerId": self.worker_id,
            "action": action,
            "payload": payload,
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{self.api_url}/api/worker/action",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            try:
                return json.loads(error_body)
            except Exception:
                return {"ok": False, "error": f"HTTP {e.code}: {error_body}"}
        except Exception as e:
            return {"ok": False, "error": str(e)}
