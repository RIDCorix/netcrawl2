import importlib.metadata
import importlib.util
import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

from netcrawl import NetCrawl


BASE = os.environ["NETCRAWL_TEST_BASE"]
EXPECTED_VERSION = os.environ["NETCRAWL_EXPECTED_SDK_VERSION"]


def request(path, token="", body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None if body is None else json.dumps(body).encode()
    method = "GET" if body is None else "POST"
    with urllib.request.urlopen(urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)) as response:
        return response.status, json.loads(response.read())


def worker_state(browser_token, worker_id):
    status, state = request("/api/state", browser_token)
    assert status == 200
    return next(worker for worker in state["workers"] if worker["id"] == worker_id)


assert importlib.metadata.version("netcrawl-sdk") == EXPECTED_VERSION

_, registration = request("/api/auth/register", body={
    "email": "artifact-lifecycle@example.test",
    "password": "artifact-lifecycle-password",
    "displayName": "Artifact Lifecycle",
})
browser_token = registration["token"]
_, credential = request("/api/auth/code-server-token", browser_token, {})

with tempfile.TemporaryDirectory(prefix="netcrawl-artifact-worker-") as directory:
    worker_path = Path(directory) / "artifact_worker.py"
    worker_path.write_text(
        "import time\n"
        "from netcrawl import WorkerClass\n"
        "class ArtifactWorker(WorkerClass):\n"
        "    class_id = 'artifact_worker'\n"
        "    class_name = 'Artifact Worker'\n"
        "    def on_loop(self):\n"
        "        time.sleep(0.1)\n"
    )
    spec = importlib.util.spec_from_file_location("artifact_worker", worker_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)

    app = NetCrawl(server=BASE, api_key=credential["token"])
    app.register(module.ArtifactWorker)
    app._register_all()

    status, deployment = request("/api/deploy", browser_token, {
        "nodeId": "hub",
        "classId": "artifact_worker",
        "equippedItems": {},
    })
    assert status == 200
    worker_id = deployment["workerId"]
    app._poll_deploy_queue()

    deployed = worker_state(browser_token, worker_id)
    assert deployed["status"] == "running"
    first_generation = deployed["generation"]
    first_token = deployed["executionToken"]

    worker_path.write_text(worker_path.read_text() + "\n# hot reload\n")
    app._hot_reload_class("artifact_worker", str(worker_path))
    app._poll_deploy_queue()

    reloaded = worker_state(browser_token, worker_id)
    assert reloaded["status"] == "running"
    assert reloaded["generation"] == first_generation + 1
    assert reloaded["executionToken"] != first_token

    def interrupt_poll():
        raise KeyboardInterrupt

    app._wait_for_server = lambda timeout=30: True
    app._poll_deploy_queue = interrupt_poll
    app.run()

    disconnected = worker_state(browser_token, worker_id)
    assert disconnected["status"] == "deploying"
    assert disconnected["pid"] is None

print(f"Published SDK lifecycle passed for netcrawl-sdk {EXPECTED_VERSION}")
