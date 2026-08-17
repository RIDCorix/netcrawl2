import importlib.metadata
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

import netcrawl
from netcrawl import NetCrawl


BASE = os.environ["NETCRAWL_TEST_BASE"]
EXPECTED_VERSION = os.environ["NETCRAWL_EXPECTED_SDK_VERSION"]
REPOSITORY = Path(__file__).resolve().parents[1]


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

# The version above comes from the installed dist-info; the *code* can still come
# from somewhere else. `netcrawl/version.py` documents exactly that trap — this
# package is regularly run off a source tree shadowing a different installed
# release — and a test that reads the tree while reporting the artifact's version
# is the shape of R-50 itself. Assert where the code actually came from.
assert REPOSITORY not in Path(netcrawl.__file__).resolve().parents, (
    f"netcrawl was imported from {netcrawl.__file__}, inside this checkout — something is shadowing the installed "
    f"{EXPECTED_VERSION}, so nothing below is testing the artifact a player gets."
)


def test_the_installed_runner_emits_the_frame_shape_the_ui_reads():
    """R-50, asserted against the artifact a player installs rather than the tree.

    `detail["loop"]` was added to the runner, the release number did not move, and
    the 1.4.1 that stayed newest on PyPI never emitted it. Every test in the repo
    passed: they all read the tree, and the tree was right. The loop track was
    absent for every player and nothing anywhere failed.

    This runs the *installed* `netcrawl.compute_lab_runner` — in the steady state
    that is the published wheel, because `test:sdk-version-gate` will not accept a
    starter lock below MIN_PYTHON_SDK_VERSION, and the floor cannot sit below the
    frame contract's own release. That chain is what makes this line read PyPI.

    Invoked exactly as `app.py` invokes it: a module, a payload on stdin, one JSON
    line per frame on stdout.
    """
    contract = json.loads((REPOSITORY / "packages/sdk-python/frame_contract.json").read_text(encoding="utf-8"))
    payload = json.dumps({
        "source": (
            "class ProblemSolver:\n"
            "    def solution(self, a, b):\n"
            "        total = 0\n"
            "        for i in range(3):\n"
            "            total = total + i\n"
            "        return total\n"
        ),
        "params": {"a": 2, "b": 3},
        "parameterNames": ["a", "b"],
        "limits": {"maxEvents": 400},
    })
    # PYTHONPATH stripped for the same reason as the import check above: the
    # subprocess must be able to reach only the installed package.
    environment = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    completed = subprocess.run(
        [sys.executable, "-m", "netcrawl.compute_lab_runner"],
        input=payload, text=True, capture_output=True, env=environment,
    )
    assert completed.returncode == 0, completed.stderr
    lines = [json.loads(line) for line in completed.stdout.splitlines() if line.strip()]
    assert lines[-1]["result"]["status"] == "trace_ready", lines[-1]
    frames = [line["frame"] for line in lines if "frame" in line]

    behind = (
        f"the installed netcrawl-sdk {EXPECTED_VERSION} is older than the frame shape this repo declares — publish "
        "the release named by packages/sdk-python/frame_contract.json before raising the floor to it."
    )
    for frame in frames:
        declared = set(contract["kinds"][frame["kind"]]["required"]) | set(contract["kinds"][frame["kind"]]["optional"])
        emitted = set(frame.get("detail") or {})
        assert emitted <= declared, f"a {frame['kind']} frame carries undeclared {sorted(emitted - declared)}"
        missing = set(contract["kinds"][frame["kind"]]["required"]) - emitted
        assert not missing, f"a {frame['kind']} frame arrives without detail {sorted(missing)}. {behind}"

        # The frame's own fields, for the same reason and against the same
        # artifact: `frame["types"]` landed in the commit that added
        # `detail["loop"]` and was lost to the same forgotten publish, so the type
        # chip under every variable box was silently absent too. `detail` alone
        # would let the next such field through.
        top = set(contract["frame"]["required"]) - set(frame)
        assert not top, f"a {frame['kind']} frame arrives without top-level {sorted(top)}. {behind}"
        undeclared = set(frame) - set(contract["frame"]["required"]) - set(contract["frame"]["optional"])
        assert not undeclared, f"a {frame['kind']} frame carries undeclared top-level {sorted(undeclared)}"

    repetitions = [frame for frame in frames if frame["kind"] == "repetition"]
    assert len(repetitions) == 3, f"a three-iteration loop produced {len(repetitions)} repetition frames"
    # The whole of R-50 in one line: without a numeric identity here, `indexLoops`
    # skips the frame, the chain is empty, and the stage draws no track and no
    # 「迴圈」 header — which is what Corix saw on a live build.
    assert all(isinstance(frame["detail"].get("loop"), int) for frame in repetitions), repetitions
    # The other half of that commit, checked by name for the same reason: the type
    # chip under each variable box is drawn from `frame["types"]`, and the runner
    # that lost the loop identity lost this too.
    holding = [frame for frame in frames if frame["locals"]]
    assert holding, "no frame reported a held value"
    assert all(set(frame["types"]) == set(frame["locals"]) for frame in holding), (
        f"the installed netcrawl-sdk {EXPECTED_VERSION} names a type for only some held values, so some variable "
        f"boxes draw a chip and some do not. {behind}"
    )
    print(f"Installed netcrawl-sdk {EXPECTED_VERSION} emits the declared frame shape — loop identity and type chips")


test_the_installed_runner_emits_the_frame_shape_the_ui_reads()

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
