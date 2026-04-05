"""
netcrawl/app.py

NetCrawl code server — registers worker classes with the game server,
polls for deploy requests, and spawns worker subprocesses.
"""

import os
import time
import importlib.util
from typing import Type

from netcrawl.base import WorkerClass
from netcrawl.client import http_post, http_get
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
        self._file_mtimes: dict[str, float] = {}
        self._worker_class_map: dict[str, str] = {}  # worker_id -> class_id

    def register(self, cls: Type[WorkerClass]) -> None:
        """Register a worker class for deployment. Raises on duplicate class_id."""
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
        return http_post(f"{self.server}{path}", data, api_key=self.api_key)

    def _get(self, path: str) -> dict:
        return http_get(f"{self.server}{path}", api_key=self.api_key)

    def _register_all(self) -> None:
        """Register all worker classes with the game server."""
        classes = []
        for class_id, cls in self._classes.items():
            schema = cls.get_schema()
            schema["file"] = self._class_files.get(class_id, "")
            schema["language"] = "python"
            classes.append(schema)

        result = self._post("/api/worker-classes/register", {"classes": classes})
        if result.get("ok"):
            print(f"[NetCrawl] Registered {result.get('registered', 0)} worker classes")
        else:
            print(f"[NetCrawl] Registration failed: {result.get('error')}")

    def _poll_deploy_queue(self) -> None:
        """Poll the game server for pending deploy requests and spawn workers."""
        try:
            result = self._get("/api/deploy-queue")
            requests = result.get("requests", [])
            for req in requests:
                self._handle_deploy(req)
        except Exception as e:
            pass  # Server might be temporarily unreachable

    def _handle_deploy(self, deploy_req: dict) -> None:
        """Spawn a worker subprocess for a deploy request."""
        worker_id = deploy_req["workerId"]
        class_id = deploy_req["classId"]
        node_id = deploy_req["nodeId"]
        injected_fields = deploy_req.get("injectedFields", {})

        cls = self._classes.get(class_id)
        if not cls:
            print(f"[NetCrawl] Unknown class_id: {class_id}")
            self._post("/api/deploy-ack", {
                "workerId": worker_id,
                "error": f"Unknown worker class_id: {class_id}",
            })
            return

        script_path = self._class_files.get(class_id, "")
        self._worker_class_map[worker_id] = class_id
        print(f"[NetCrawl] Spawning {cls.class_name} (id={class_id}, worker={worker_id}) on node {node_id}")

        try:
            pid = spawn_worker(
                worker_id=worker_id,
                script_path=script_path,
                class_name=cls.__name__,  # Python class name for import
                api_url=self.server,
                injected_fields=injected_fields,
                api_key=self.api_key,
            )
            print(f"[NetCrawl] Spawned {cls.class_name} — PID {pid}")
            self._post("/api/deploy-ack", {
                "workerId": worker_id,
                "pid": pid,
            })
        except Exception as e:
            print(f"[NetCrawl] Spawn failed: {e}")
            self._post("/api/deploy-ack", {
                "workerId": worker_id,
                "error": str(e),
            })

    def _init_file_mtimes(self) -> None:
        """Record initial mtimes for all registered worker source files."""
        for class_id, file_path in self._class_files.items():
            try:
                self._file_mtimes[file_path] = os.path.getmtime(file_path)
            except OSError:
                pass

    def _check_hot_reload(self) -> None:
        """Check if any worker source files have changed and hot-reload them."""
        for class_id, file_path in list(self._class_files.items()):
            try:
                mtime = os.path.getmtime(file_path)
            except OSError:
                continue
            prev = self._file_mtimes.get(file_path)
            if prev is not None and mtime > prev:
                self._file_mtimes[file_path] = mtime
                self._hot_reload_class(class_id, file_path)

    def _hot_reload_class(self, class_id: str, file_path: str) -> None:
        """Reload a worker class from disk and restart affected workers."""
        print(f"[NetCrawl] Hot reload: {class_id} ({file_path})")

        # Re-import module from file
        try:
            spec = importlib.util.spec_from_file_location(f"worker_{class_id}", file_path)
            if spec is None or spec.loader is None:
                print(f"[NetCrawl] Hot reload failed: cannot load {file_path}")
                return
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        except Exception as e:
            print(f"[NetCrawl] Hot reload failed: {e}")
            return

        # Find the updated class in the reloaded module
        new_cls = None
        for name, obj in vars(module).items():
            if isinstance(obj, type) and hasattr(obj, 'class_id') and obj.class_id == class_id:
                new_cls = obj
                break

        if new_cls is None:
            print(f"[NetCrawl] Hot reload: class_id '{class_id}' not found in {file_path}")
            return

        self._classes[class_id] = new_cls
        print(f"[NetCrawl] Hot reload: updated {new_cls.class_name}")

        # Re-register all classes with the server
        self._register_all()

        # Kill workers using this class — they will be auto-resumed via deploy queue
        workers_to_reset = [
            wid for wid, cid in self._worker_class_map.items()
            if cid == class_id
        ]
        for worker_id in workers_to_reset:
            kill_worker(worker_id)
            try:
                self._post("/api/worker/reset", {"workerId": worker_id})
            except Exception:
                pass
            del self._worker_class_map[worker_id]

        if workers_to_reset:
            print(f"[NetCrawl] Hot reload: reset {len(workers_to_reset)} workers using {class_id}")

    def _disconnect(self) -> None:
        """Notify the server that the code server is disconnecting."""
        # Kill all local worker processes
        for entry in list_active():
            kill_worker(entry["worker_id"])

        # Tell server to reset all workers to suspended
        try:
            self._post("/api/code-server/disconnect", {})
            print("[NetCrawl] Server notified — workers reset to suspended")
        except Exception:
            pass  # Server may already be down

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
        3. Poll for deploy requests every second
        4. Re-register every 30s to handle server restarts
        """
        print(f"[NetCrawl] Code Server starting...")
        print(f"[NetCrawl] Server: {self.server}")
        worker_list = ', '.join(f"{cls.class_name}({cid})" for cid, cls in self._classes.items())
        print(f"[NetCrawl] Workers: {worker_list}")
        print()

        # Wait for server
        print("[NetCrawl] Waiting for game server...")
        if not self._wait_for_server():
            print("[NetCrawl] ERROR: Game server not reachable. Is it running?")
            return

        print("[NetCrawl] Game server connected!")
        self._register_all()
        self._init_file_mtimes()

        print()
        print("[NetCrawl] Code server running. Polling for deploy requests...")
        print("[NetCrawl] Hot reload enabled — editing worker files will auto-restart workers.")
        print("[NetCrawl] Press Ctrl+C to stop.")

        register_counter = 0
        hot_reload_counter = 0
        try:
            while True:
                self._poll_deploy_queue()
                time.sleep(1)

                # Re-register every 30 polls (~30s)
                register_counter += 1
                if register_counter >= 30:
                    register_counter = 0
                    self._register_all()

                # Check for file changes every 2 polls (~2s)
                hot_reload_counter += 1
                if hot_reload_counter >= 2:
                    hot_reload_counter = 0
                    self._check_hot_reload()
        except KeyboardInterrupt:
            print("\n[NetCrawl] Shutting down...")
            self._disconnect()
            print("[NetCrawl] All workers stopped. Goodbye!")
