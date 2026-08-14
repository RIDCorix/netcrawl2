from netcrawl.app import NetCrawl, WorkerExecution
from netcrawl.client import ApiClient
import netcrawl.app as app_module
import netcrawl.client as client_module


def test_v2_action_carries_fence_and_stale_result_stops_runtime(monkeypatch):
    captured = {}

    def fake_post(url, body, timeout=10, api_key=""):
        captured.update(url=url, body=body, timeout=timeout, api_key=api_key)
        return {"ok": False, "reason": "stale_execution"}

    monkeypatch.setattr(client_module, "http_post", fake_post)
    client = ApiClient(
        api_url="http://game.example",
        worker_id="worker-1",
        api_key="token",
        generation=7,
        execution_token="execution-token",
    )

    result = client.action("mine", {"target": "ore"})

    assert result["reason"] == "stale_execution"
    assert client.stale_execution is True
    assert captured["url"] == "http://game.example/api/worker/action"
    assert captured["body"]["workerId"] == "worker-1"
    assert captured["body"]["generation"] == 7
    assert captured["body"]["executionToken"] == "execution-token"
    assert captured["body"]["actionId"]
    assert captured["timeout"] is None


def test_deploy_uses_session_ack_and_remembers_execution_fence(monkeypatch):
    class ExampleWorker:
        class_name = "Example"

    app = NetCrawl(server="http://game.example", api_key="code-token")
    app._classes["example"] = ExampleWorker
    app._class_files["example"] = "/workspace/example.py"
    requests = []

    monkeypatch.setattr(app_module, "spawn_worker", lambda **kwargs: 4242)
    monkeypatch.setattr(app, "_post", lambda path, body: requests.append((path, body)) or {"ok": True})

    app._handle_deploy({
        "id": "command-1",
        "workerId": "worker-1",
        "classId": "example",
        "nodeId": "hub",
        "generation": 7,
        "executionToken": "execution-token",
    })

    assert requests == [(
        "/api/runtime/commands/command-1/ack",
        {"sessionId": app._session_id, "workerId": "worker-1", "generation": 7, "pid": 4242},
    )]
    assert app._worker_executions["worker-1"] == WorkerExecution("example", 7, "execution-token")


def test_hot_reload_reset_sends_fence_and_retains_rejected_execution(monkeypatch, tmp_path):
    source = tmp_path / "example.py"
    source.write_text(
        "from netcrawl.base import WorkerClass\n"
        "class ExampleWorker(WorkerClass):\n"
        "    class_id = 'example'\n"
        "    class_name = 'Example'\n"
    )
    app = NetCrawl()
    app._worker_executions["worker-1"] = WorkerExecution("example", 7, "execution-token")
    monkeypatch.setattr(app, "_register_all", lambda: None)
    killed = []
    monkeypatch.setattr(app_module, "kill_worker", killed.append)
    responses = iter([{"ok": False, "reason": "stale_execution"}, {"ok": True}])
    requests = []
    monkeypatch.setattr(app, "_post", lambda path, body: requests.append((path, body)) or next(responses))

    app._hot_reload_class("example", str(source))
    assert killed == []
    assert "worker-1" in app._worker_executions

    app._hot_reload_class("example", str(source))
    assert requests == [
        ("/api/worker/reset", {
            "workerId": "worker-1",
            "generation": 7,
            "executionToken": "execution-token",
        }),
        ("/api/worker/reset", {
            "workerId": "worker-1",
            "generation": 7,
            "executionToken": "execution-token",
        }),
    ]
    assert killed == ["worker-1"]
    assert "worker-1" not in app._worker_executions


def test_disconnect_releases_current_session_before_killing_workers(monkeypatch):
    app = NetCrawl()
    requests = []
    killed = []
    monkeypatch.setattr(app, "_post", lambda path, body: requests.append((path, body)) or {"ok": True, "released": True})
    monkeypatch.setattr(app_module, "list_active", lambda: [{"worker_id": "worker-1"}])
    monkeypatch.setattr(app_module, "kill_worker", killed.append)

    app._disconnect()

    assert requests == [("/api/runtime/disconnect", {"sessionId": app._session_id})]
    assert killed == ["worker-1"]
