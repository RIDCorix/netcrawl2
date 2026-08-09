"""
netcrawl/client.py

HTTP client for communicating with the NetCrawl API server.
Uses only stdlib (no requests dependency) for portability.
"""

import json
import uuid
import urllib.request
import urllib.error


def http_post(url: str, data: dict, timeout: int = 10, api_key: str = "") -> dict:
    """POST JSON to a URL and return the parsed response."""
    body = json.dumps(data).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(
        url, data=body,
        headers=headers,
        method="POST",
    )
    return _do_request(req, timeout)


def http_get(url: str, timeout: int = 10, api_key: str = "") -> dict:
    """GET a URL and return the parsed JSON response."""
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    return _do_request(req, timeout)


def _do_request(req: urllib.request.Request, timeout: int) -> dict:
    """Execute an HTTP request with unified error handling."""
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        try:
            return json.loads(error_body)
        except Exception:
            return {"ok": False, "error": f"HTTP {e.code}: {error_body}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


class ApiClient:
    """
    HTTP client for worker subprocess → game server communication.
    """

    def __init__(self, api_url: str, worker_id: str, api_key: str = "", generation: int | None = None, execution_token: str = ""):
        self.api_url = api_url.rstrip("/")
        self.worker_id = worker_id
        self.api_key = api_key
        self.generation = generation
        self.execution_token = execution_token
        self.stale_execution = False

    def action(self, action: str, payload: dict) -> dict:
        """POST /api/worker/action — returns server response as dict."""
        body = {
            "workerId": self.worker_id,
            "action": action,
            "payload": payload,
        }
        if self.generation is not None:
            body.update({
                "generation": self.generation,
                "executionToken": self.execution_token,
                "actionId": str(uuid.uuid4()),
            })
        result = http_post(f"{self.api_url}/api/worker/action", body, api_key=self.api_key)
        if result.get("reason") == "stale_execution":
            self.stale_execution = True
        return result
