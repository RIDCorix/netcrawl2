"""
netcrawl/daemon/scanner.py

Scans a workspace directory for Python files containing WorkerClass subclasses.
Imports each file, discovers classes, and returns their schemas.
"""

import os
import sys
import importlib.util
from typing import Type

from netcrawl.base import WorkerClass


def scan_workspace(workspace_path: str) -> list[dict]:
    """
    Scan all .py files in workspace_path/workers/ for WorkerClass subclasses.
    Returns list of class schemas (for registering with the server).
    """
    workers_dir = os.path.join(workspace_path, "workers")
    if not os.path.isdir(workers_dir):
        workers_dir = workspace_path  # fallback: scan the dir itself

    results = []

    for filename in os.listdir(workers_dir):
        if not filename.endswith(".py") or filename.startswith("_"):
            continue

        filepath = os.path.join(workers_dir, filename)
        classes = _scan_file(filepath)

        for cls in classes:
            schema = cls.get_schema()
            schema["file"] = filepath
            results.append(schema)

    return results


def _scan_file(filepath: str) -> list[Type[WorkerClass]]:
    """Import a Python file and return all WorkerClass subclasses found."""
    spec = importlib.util.spec_from_file_location("_scan_tmp", filepath)
    module = importlib.util.module_from_spec(spec)

    # Add parent dir to path so local imports work
    parent = os.path.dirname(filepath)
    if parent not in sys.path:
        sys.path.insert(0, parent)

    try:
        spec.loader.exec_module(module)
    except Exception as e:
        print(f"[scanner] Failed to import {filepath}: {e}")
        return []

    found = []
    for name in dir(module):
        obj = getattr(module, name)
        if (
            isinstance(obj, type)
            and issubclass(obj, WorkerClass)
            and obj is not WorkerClass
            and not name.startswith("_")
        ):
            found.append(obj)

    return found
