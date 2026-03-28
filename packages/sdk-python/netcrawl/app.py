"""
netcrawl/app.py

NetCrawl code server — registers worker classes with the game server
and spawns worker subprocesses when deploy commands come through.
"""

import json
import time
import urllib.request
import urllib.error
from typing import Type

from netcrawl.base import WorkerClass
from netcrawl.daemon.spawner import spawn_worker, kill_worker, list_active


class NetCrawl:
    """
    Code server that bridges your worker classes with the game server.

    Usage:
        app = NetCrawl(server="http://localhost:4800")
        app.register(Miner)
        app.register(Guardian)
        app.run()
    """

    def __init__(self, server: str = "http://localhost:4800", api_key: str = ""):
        self.server = server.rstrip("/")
        self.api_key = api_key
        self._classes: dict[str, Type[WorkerClass]] = {}
        self._class_files: dict[str, str] = {}

    def register(self, cls: Type[WorkerClass]) -> None:
        """Register a worker class for deployment."""
        import inspect
        self._classes[cls.__name__] = cls
        # Store the file path of the class
        source_file = inspect.getfile(cls)
        self._class_files[cls.__name__] = source_file
        print(f"[NetCrawl] Registered: {cls.__name__}")

    def _post(self, path: str, data: dict) -> dict:
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            f"{self.server}{path}",
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

    def _get(self, path: str) -> dict:
        req = urllib.request.Request(f"{self.server}{path}", method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _register_all(self) -> None:
        """Register all worker classes with the game server."""
        classes = []
        for name, cls in self._classes.items():
            schema = cls.get_schema()
            schema["file"] = self._class_files.get(name, "")
            schema["language"] = "python"
            classes.append(schema)

        result = self._post("/api/worker-classes/register", {"classes": classes})
        if result.get("ok"):
            print(f"[NetCrawl] Registered {result.get('registered', 0)} worker classes")
        else:
            print(f"[NetCrawl] Registration failed: {result.get('error')}")

    def _wait_for_server(self, timeout: int = 30) -> bool:
        """Wait for the game server to be reachable."""
        start = time.time()
        while time.time() - start < timeout:
            try:
                result = self._get("/health")
                if result.get("status") == "ok":
                    return True
            except Exception:
                pass
            time.sleep(1)
        return False

    def run(self) -> None:
        """
        Start the code server:
        1. Wait for the game server
        2. Register all worker classes
        3. Keep alive and re-register periodically
        """
        print(f"[NetCrawl] Code Server starting...")
        print(f"[NetCrawl] Server: {self.server}")
        print(f"[NetCrawl] Workers: {', '.join(self._classes.keys())}")
        print()

        # Wait for server
        print("[NetCrawl] Waiting for game server...")
        if not self._wait_for_server():
            print("[NetCrawl] ERROR: Game server not reachable. Is it running?")
            return

        print("[NetCrawl] Game server connected!")
        self._register_all()

        print()
        print("[NetCrawl] Code server running. Press Ctrl+C to stop.")
        print(f"[NetCrawl] Active workers: {len(list_active())}")

        # Keep alive — re-register every 30s to handle server restarts
        try:
            while True:
                time.sleep(30)
                self._register_all()
        except KeyboardInterrupt:
            print("\n[NetCrawl] Shutting down...")
            for w in list_active():
                kill_worker(w["worker_id"])
            print("[NetCrawl] All workers stopped. Goodbye!")
