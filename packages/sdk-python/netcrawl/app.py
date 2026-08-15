"""
netcrawl/app.py

NetCrawl code server — registers worker classes with the game server,
polls for deploy requests, and spawns worker subprocesses.
"""

import os
import time
import importlib.util
import uuid
import json
import subprocess
import tempfile
import sys
from dataclasses import dataclass
from typing import Type

from netcrawl.base import WorkerClass
from netcrawl.client import http_post, http_get
from netcrawl.daemon.spawner import spawn_worker, kill_worker, list_active


@dataclass(frozen=True)
class WorkerExecution:
    class_id: str
    generation: int
    execution_token: str


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
        self._worker_executions: dict[str, WorkerExecution] = {}
        self._session_id = str(uuid.uuid4())

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

        result = self._post("/api/runtime/register", {"protocolVersion": 2, "sessionId": self._session_id, "classes": classes, "activeExecutions": list_active()})
        if result.get("ok"):
            self._session_id = result.get("sessionId", self._session_id)
            print(f"[NetCrawl] Registered {result.get('registered', 0)} worker classes")
        else:
            print(f"[NetCrawl] Registration failed: {result.get('error')}")

    def _poll_deploy_queue(self) -> None:
        """Poll the game server for pending deploy requests and spawn workers."""
        try:
            result = self._get(f"/api/runtime/commands?sessionId={self._session_id}")
            for req in result.get("commands", []):
                if req.get("type") == "compute_lab_run":
                    self._handle_compute_lab_run(req)
                else:
                    self._handle_deploy(req)
        except Exception as e:
            pass  # Server might be temporarily unreachable

    def _handle_compute_lab_run(self, command: dict) -> None:
        """Execute a Lab script in an isolated child and report ordered trace frames."""
        command_id = command["id"]
        run_id = command["runId"]
        try:
            self._post(f"/api/runtime/commands/{command_id}/ack", {"sessionId": self._session_id, "generation": 0})
            payload = json.dumps({"source": command["source"], "params": command.get("params", {}), "parameterNames": command.get("parameterNames", []), "limits": command.get("limits", {})})
            with tempfile.TemporaryDirectory(prefix="netcrawl-lab-") as cwd:
                result = subprocess.run(
                    [sys.executable, "-m", "netcrawl.compute_lab_runner"], input=payload, text=True, capture_output=True,
                    cwd=cwd, env={"PATH": os.environ.get("PATH", ""), "PYTHONPATH": os.pathsep.join(p for p in sys.path if p)},
                    timeout=max(1, command.get("limits", {}).get("timeoutMs", 2000) / 1000),
                )
            output = json.loads(result.stdout)
            for frame in output.get("frames", []):
                self._post(f"/api/runtime/compute-lab-runs/{run_id}/events", {"sessionId": self._session_id, "frame": frame})
            body = {"sessionId": self._session_id, "status": output["status"], "returnValue": output.get("returnValue")}
            if output.get("error"):
                body["frame"] = {"sequence": len(output.get("frames", [])), "phase": "limit" if output["status"] == "limit" else "error", "line": output["error"].get("line"), "error": output["error"]}
            self._post(f"/api/runtime/compute-lab-runs/{run_id}/complete", body)
        except subprocess.TimeoutExpired:
            self._post(f"/api/runtime/compute-lab-runs/{run_id}/complete", {"sessionId": self._session_id, "status": "timeout"})
        except Exception as exc:
            self._post(f"/api/runtime/compute-lab-runs/{run_id}/complete", {"sessionId": self._session_id, "status": "runtime", "frame": {"sequence": 0, "phase": "error", "error": {"message": str(exc), "kind": "runtime"}}})

    def _handle_deploy(self, deploy_req: dict) -> None:
        """Spawn a worker subprocess for a deploy request."""
        worker_id = deploy_req["workerId"]
        class_id = deploy_req["classId"]
        node_id = deploy_req["nodeId"]
        injected_fields = deploy_req.get("injectedFields", {})
        command_id = deploy_req["id"]
        generation = deploy_req["generation"]
        execution_token = deploy_req["executionToken"]

        def ack(pid=None, error=None):
            body = {"sessionId": self._session_id, "workerId": worker_id, "generation": generation}
            if pid is not None:
                body["pid"] = pid
            if error is not None:
                body["error"] = error
            return self._post(f"/api/runtime/commands/{command_id}/ack", body)

        cls = self._classes.get(class_id)
        if not cls:
            print(f"[NetCrawl] Unknown class_id: {class_id}")
            ack(error=f"Unknown worker class_id: {class_id}")
            return

        script_path = self._class_files.get(class_id, "")
        print(f"[NetCrawl] Spawning {cls.class_name} (id={class_id}, worker={worker_id}) on node {node_id}")

        try:
            pid = spawn_worker(
                worker_id=worker_id,
                script_path=script_path,
                class_name=cls.__name__,  # Python class name for import
                api_url=self.server,
                injected_fields=injected_fields,
                api_key=self.api_key,
                node_id=node_id,
                generation=generation,
                execution_token=execution_token,
                initial_holding=deploy_req.get("initialHolding", []),
            )
            self._worker_executions[worker_id] = WorkerExecution(class_id, generation, execution_token)
            print(f"[NetCrawl] Spawned {cls.class_name} — PID {pid}")
            ack(pid=pid)
        except Exception as e:
            print(f"[NetCrawl] Spawn failed: {e}")
            ack(error=str(e))

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

        # Fence the authoritative execution before killing the local process.
        # A rejected reset must remain visible and must not discard the fence
        # needed for a later retry.
        workers_to_reset = [
            (worker_id, execution)
            for worker_id, execution in self._worker_executions.items()
            if execution.class_id == class_id
        ]
        reset_count = 0
        for worker_id, execution in workers_to_reset:
            result = self._post("/api/worker/reset", {
                "workerId": worker_id,
                "generation": execution.generation,
                "executionToken": execution.execution_token,
            })
            if not result.get("ok"):
                print(f"[NetCrawl] Hot reload reset rejected for {worker_id}: {result.get('reason') or result.get('error')}")
                continue
            kill_worker(worker_id)
            del self._worker_executions[worker_id]
            reset_count += 1

        if reset_count:
            print(f"[NetCrawl] Hot reload: reset {reset_count} workers using {class_id}")

    def _disconnect(self) -> None:
        """Notify the server that the code server is disconnecting."""
        # Release the current runtime lease before stopping local processes so
        # the server reconciles only the active Code Server session.
        try:
            result = self._post("/api/runtime/disconnect", {"sessionId": self._session_id})
            if result.get("ok") and result.get("released"):
                print("[NetCrawl] Server notified — workers reset to suspended")
            else:
                print(f"[NetCrawl] Server disconnect rejected: {result.get('reason') or result.get('error') or 'stale_session'}")
        except Exception as error:
            print(f"[NetCrawl] Server disconnect failed: {error}")

        for entry in list_active():
            kill_worker(entry["worker_id"])

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
