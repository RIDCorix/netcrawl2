"""
netcrawl/daemon/spawner.py

Spawns and manages unit subprocesses.
"""

import os
import sys
import json
import subprocess


_active_processes: dict[str, subprocess.Popen] = {}


def spawn_unit(
    unit_id: str,
    script_path: str,
    class_name: str,
    api_url: str,
    injected_fields: dict,
) -> int:
    """
    Spawn a Python unit subprocess.
    Returns the PID.
    """
    env = os.environ.copy()
    env.update({
        "NETCRAWL_UNIT_ID": unit_id,
        "NETCRAWL_API_URL": api_url,
        "NETCRAWL_SCRIPT_PATH": script_path,
        "NETCRAWL_CLASS_NAME": class_name,
        "NETCRAWL_INJECTED": json.dumps(injected_fields),
    })

    process = subprocess.Popen(
        [sys.executable, "-m", "netcrawl.runner"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    _active_processes[unit_id] = process
    print(f"[spawner] Spawned unit {unit_id} (PID {process.pid})")
    return process.pid


def kill_unit(unit_id: str) -> bool:
    """Terminate a running unit process."""
    proc = _active_processes.get(unit_id)
    if proc is None:
        return False

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()

    del _active_processes[unit_id]
    print(f"[spawner] Killed unit {unit_id}")
    return True


def get_unit_status(unit_id: str) -> str:
    """Returns 'running', 'stopped', 'crashed', or 'unknown'."""
    proc = _active_processes.get(unit_id)
    if proc is None:
        return "unknown"

    poll = proc.poll()
    if poll is None:
        return "running"
    elif poll == 0:
        return "stopped"
    else:
        return "crashed"


def list_active() -> list[dict]:
    return [
        {"unit_id": uid, "pid": proc.pid, "status": get_unit_status(uid)}
        for uid, proc in _active_processes.items()
    ]
