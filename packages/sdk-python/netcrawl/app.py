"""
netcrawl/app.py

NetCrawl code server — registers unit classes with the game server,
polls for deploy requests, and spawns unit subprocesses.
"""

import time
from typing import Type

from netcrawl.base import UnitClass
from netcrawl.client import http_post, http_get
from netcrawl.daemon.spawner import spawn_unit, kill_unit, list_active


class NetCrawl:
    """
    Code server that bridges your unit classes with the game server.

    Usage:
        app = NetCrawl(server="http://localhost:4800")
        app.register(Miner)
        app.register(Guardian)
        app.run()
    """

    def __init__(self, server: str = "http://localhost:4800", api_key: str = ""):
        self.server = server.rstrip("/")
        self.api_key = api_key
        self._classes: dict[str, Type[UnitClass]] = {}
        self._class_files: dict[str, str] = {}

    def register(self, cls: Type[UnitClass]) -> None:
        """Register a unit class for deployment. Raises on duplicate class_id."""
        import inspect
        class_id = cls.class_id
        class_name = cls.class_name

        if class_id in self._classes:
            existing = self._classes[class_id]
            raise ValueError(
                f"Duplicate class_id '{class_id}': "
                f"{cls.__name__} conflicts with {existing.__name__}"
            )

        self._classes[class_id] = cls
        source_file = inspect.getfile(cls)
        self._class_files[class_id] = source_file
        print(f"[NetCrawl] Registered: {class_name} (id={class_id})")

    def _post(self, path: str, data: dict) -> dict:
        return http_post(f"{self.server}{path}", data)

    def _get(self, path: str) -> dict:
        return http_get(f"{self.server}{path}")

    def _register_all(self) -> None:
        """Register all unit classes with the game server."""
        classes = []
        for class_id, cls in self._classes.items():
            schema = cls.get_schema()
            schema["file"] = self._class_files.get(class_id, "")
            schema["language"] = "python"
            classes.append(schema)

        result = self._post("/api/unit-classes/register", {"classes": classes})
        if result.get("ok"):
            print(f"[NetCrawl] Registered {result.get('registered', 0)} unit classes")
        else:
            print(f"[NetCrawl] Registration failed: {result.get('error')}")

    def _poll_deploy_queue(self) -> None:
        """Poll the game server for pending deploy requests and spawn units."""
        try:
            result = self._get("/api/deploy-queue")
            requests = result.get("requests", [])
            for req in requests:
                self._handle_deploy(req)
        except Exception as e:
            pass  # Server might be temporarily unreachable

    def _handle_deploy(self, deploy_req: dict) -> None:
        """Spawn a unit subprocess for a deploy request."""
        unit_id = deploy_req["unitId"]
        class_id = deploy_req["classId"]
        node_id = deploy_req["nodeId"]
        injected_fields = deploy_req.get("injectedFields", {})

        cls = self._classes.get(class_id)
        if not cls:
            print(f"[NetCrawl] Unknown class_id: {class_id}")
            self._post("/api/deploy-ack", {
                "unitId": unit_id,
                "error": f"Unknown unit class_id: {class_id}",
            })
            return

        script_path = self._class_files.get(class_id, "")
        print(f"[NetCrawl] Spawning {cls.class_name} (id={class_id}, unit={unit_id}) on node {node_id}")

        try:
            pid = spawn_unit(
                unit_id=unit_id,
                script_path=script_path,
                class_name=cls.__name__,  # Python class name for import
                api_url=self.server,
                injected_fields=injected_fields,
            )
            print(f"[NetCrawl] Spawned {cls.class_name} — PID {pid}")
            self._post("/api/deploy-ack", {
                "unitId": unit_id,
                "pid": pid,
            })
        except Exception as e:
            print(f"[NetCrawl] Spawn failed: {e}")
            self._post("/api/deploy-ack", {
                "unitId": unit_id,
                "error": str(e),
            })

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
        2. Register all unit classes
        3. Poll for deploy requests every second
        4. Re-register every 30s to handle server restarts
        """
        print(f"[NetCrawl] Code Server starting...")
        print(f"[NetCrawl] Server: {self.server}")
        unit_list = ', '.join(f"{cls.class_name}({cid})" for cid, cls in self._classes.items())
        print(f"[NetCrawl] Units: {unit_list}")
        print()

        # Wait for server
        print("[NetCrawl] Waiting for game server...")
        if not self._wait_for_server():
            print("[NetCrawl] ERROR: Game server not reachable. Is it running?")
            return

        print("[NetCrawl] Game server connected!")
        self._register_all()

        print()
        print("[NetCrawl] Code server running. Polling for deploy requests...")
        print("[NetCrawl] Press Ctrl+C to stop.")

        register_counter = 0
        try:
            while True:
                self._poll_deploy_queue()
                time.sleep(1)

                # Re-register every 30 polls (~30s)
                register_counter += 1
                if register_counter >= 30:
                    register_counter = 0
                    self._register_all()
        except KeyboardInterrupt:
            print("\n[NetCrawl] Shutting down...")
            for u in list_active():
                kill_unit(u["unit_id"])
            print("[NetCrawl] All units stopped. Goodbye!")
