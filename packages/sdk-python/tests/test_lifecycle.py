from netcrawl.client import ApiClient
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
