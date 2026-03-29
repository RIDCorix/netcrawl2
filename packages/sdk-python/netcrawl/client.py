"""
netcrawl/client.py

HTTP client for communicating with the NetCrawl API server.
Uses only stdlib (no requests dependency) for portability.
"""

import json
import urllib.request
import urllib.error


def http_post(url: str, data: dict, timeout: int = 10) -> dict:
    """POST JSON to a URL and return the parsed response."""
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return _do_request(req, timeout)


def http_get(url: str, timeout: int = 10) -> dict:
    """GET a URL and return the parsed JSON response."""
    req = urllib.request.Request(url, method="GET")
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
    HTTP client for unit subprocess → game server communication.
    """

    def __init__(self, api_url: str, unit_id: str):
        self.api_url = api_url.rstrip("/")
        self.unit_id = unit_id

    def action(self, action: str, payload: dict) -> dict:
        """POST /api/unit/action — returns server response as dict."""
        return http_post(f"{self.api_url}/api/unit/action", {
            "unitId": self.unit_id,
            "action": action,
            "payload": payload,
        })
