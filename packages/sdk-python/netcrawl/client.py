"""
netcrawl/client.py

HTTP client for communicating with the NetCrawl API server.
Uses only stdlib (no requests dependency) for portability.
"""

import json
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

    def __init__(self, api_url: str, worker_id: str, api_key: str = ""):
        self.api_url = api_url.rstrip("/")
        self.worker_id = worker_id
        self.api_key = api_key

    def action(self, action: str, payload: dict) -> dict:
        """POST /api/worker/action — returns server response as dict."""
        return http_post(f"{self.api_url}/api/worker/action", {
            "workerId": self.worker_id,
            "action": action,
            "payload": payload,
        }, api_key=self.api_key)
