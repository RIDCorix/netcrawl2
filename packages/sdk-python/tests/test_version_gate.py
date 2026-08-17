"""The runtime must name itself honestly, and stop when the server says no.

R-32: an SDK that predates a command shape took a Lab command (whose classId is
deliberately empty) down the deploy path and printed `Unknown class_id:` with
nothing after the colon — the player was told their worker class was wrong. The
runtime's half of the fix is to declare a version, and to end the run on a
refusal instead of polling for more commands it cannot read.
"""

from pathlib import Path

import pytest

import netcrawl
import netcrawl.app as app_module
from netcrawl.app import NetCrawl, OutdatedRuntimeError
from netcrawl.version import PROTOCOL_VERSION, __version__

PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"


def test_declared_version_matches_the_published_one():
    # A runtime that reports a version it is not running would be waved through
    # the very gate this value exists to trip.
    pinned = next(
        line.split("=", 1)[1].strip().strip('"')
        for line in PYPROJECT.read_text(encoding="utf-8").splitlines()
        if line.startswith("version = ")
    )
    assert __version__ == pinned
    assert netcrawl.__version__ == pinned


def test_registration_declares_protocol_and_sdk_version(monkeypatch):
    captured = {}

    def fake_post(url, body, timeout=10, api_key=""):
        captured.update(url=url, body=body)
        return {"ok": True, "sessionId": "session-1"}

    monkeypatch.setattr(app_module, "http_post", fake_post)
    monkeypatch.setattr(app_module, "list_active", lambda: [])

    NetCrawl(server="http://game.example")._register_all()

    assert captured["url"].endswith("/api/runtime/register")
    assert captured["body"]["protocolVersion"] == PROTOCOL_VERSION
    assert captured["body"]["sdkVersion"] == __version__


def test_refused_registration_ends_the_run_with_the_server_sentence(monkeypatch):
    sentence = "Your Code Server runs netcrawl-sdk 1.2.3, but this server needs 1.3.1 or newer."

    monkeypatch.setattr(
        app_module,
        "http_post",
        lambda url, body, timeout=10, api_key="": {"ok": False, "reason": "sdk_outdated", "error": sentence},
    )
    monkeypatch.setattr(app_module, "list_active", lambda: [])

    with pytest.raises(OutdatedRuntimeError) as refusal:
        NetCrawl(server="http://game.example")._register_all()

    assert str(refusal.value) == sentence


def test_ordinary_registration_failure_still_only_prints(monkeypatch, capsys):
    # Only a version refusal is terminal. A transient server error must stay
    # retryable, exactly as it was before the gate existed.
    monkeypatch.setattr(
        app_module,
        "http_post",
        lambda url, body, timeout=10, api_key="": {"ok": False, "error": "database busy"},
    )
    monkeypatch.setattr(app_module, "list_active", lambda: [])

    NetCrawl(server="http://game.example")._register_all()

    assert "database busy" in capsys.readouterr().out


def test_unreadable_command_shape_is_not_blamed_on_the_player(monkeypatch):
    app = NetCrawl(server="http://game.example")
    monkeypatch.setattr(
        app_module,
        "http_get",
        lambda url, timeout=10, api_key="": {"commands": [{"id": "c1", "type": "teleport", "classId": ""}]},
    )

    with pytest.raises(OutdatedRuntimeError) as gap:
        app._poll_deploy_queue()

    # The message names the protocol gap and the fix, and never the class_id
    # that an older build would have reported as missing.
    assert "teleport" in str(gap.value)
    assert "upgrade-package netcrawl-sdk" in str(gap.value)
    assert "class_id" not in str(gap.value)


def test_run_says_it_once_and_returns(monkeypatch, capsys):
    """The whole point of R-32: one sentence, then the run ends.

    Not a message repeated on every re-registration, and not a poll loop
    collecting commands this build would misread.
    """
    sentence = 'Update it: run "uv sync --upgrade-package netcrawl-sdk".'
    polled = []

    monkeypatch.setattr(
        app_module,
        "http_get",
        lambda url, timeout=10, api_key="": polled.append(url) or {"status": "ok", "commands": []},
    )
    monkeypatch.setattr(
        app_module,
        "http_post",
        lambda url, body, timeout=10, api_key="": {"ok": False, "reason": "sdk_outdated", "error": sentence},
    )
    monkeypatch.setattr(app_module, "list_active", lambda: [])

    NetCrawl(server="http://game.example").run()  # returns; never reaches the poll loop

    output = capsys.readouterr().out
    assert output.count(sentence) == 1
    assert "Polling for deploy requests" not in output
    assert not any("/api/runtime/commands" in url for url in polled)


def test_a_transient_poll_failure_is_still_swallowed(monkeypatch):
    app = NetCrawl(server="http://game.example")

    def unreachable(url, timeout=10, api_key=""):
        raise OSError("connection refused")

    monkeypatch.setattr(app_module, "http_get", unreachable)

    app._poll_deploy_queue()  # must not raise — the server may just be restarting
