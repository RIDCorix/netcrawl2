"""
netcrawl/runner.py

Entrypoint for worker subprocesses.
Reads env vars set by the daemon, imports the worker class,
injects field values, and runs the worker lifecycle.

Called by daemon like:
  python -m netcrawl.runner
With env vars:
  NETCRAWL_WORKER_ID=worker-abc123
  NETCRAWL_API_URL=http://localhost:3001
  NETCRAWL_SCRIPT_PATH=C:/path/to/workers/collector.py
  NETCRAWL_CLASS_NAME=Collector
  NETCRAWL_INJECTED={"route1": ["hub","r1","hub"], "route2": ["hub","r2"]}
"""

import os
import sys
import json
import importlib.util
import time
import traceback


def main():
    worker_id = os.environ["NETCRAWL_WORKER_ID"]
    api_url = os.environ.get("NETCRAWL_API_URL", "http://localhost:3001")
    script_path = os.environ["NETCRAWL_SCRIPT_PATH"]
    class_name = os.environ["NETCRAWL_CLASS_NAME"]
    injected_raw = os.environ.get("NETCRAWL_INJECTED", "{}")

    # Parse injected field values.
    # Routes come as lists of node IDs; items come as dicts with stats.
    injected_fields = json.loads(injected_raw)

    # Dynamically import the user's script
    spec = importlib.util.spec_from_file_location("worker_module", script_path)
    module = importlib.util.module_from_spec(spec)

    # Add the script's directory to sys.path so it can import sibling files
    script_dir = os.path.dirname(os.path.abspath(script_path))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)

    spec.loader.exec_module(module)

    # Retrieve the worker class by name
    WorkerCls = getattr(module, class_name, None)
    if WorkerCls is None:
        print(f"ERROR: Class '{class_name}' not found in {script_path}", file=sys.stderr)
        sys.exit(1)

    # Instantiate with injected values
    worker = WorkerCls(
        worker_id=worker_id,
        api_url=api_url,
        injected_fields=injected_fields,
    )

    print(f"[{worker_id}] Starting {class_name}...")

    # Run lifecycle
    try:
        worker.on_startup()
    except Exception as e:
        worker.error(f"on_startup() failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    # Main loop
    loop_count = 0
    while True:
        try:
            worker.on_loop()
            loop_count += 1
        except KeyboardInterrupt:
            print(f"[{worker_id}] Received shutdown signal.")
            break
        except Exception as e:
            worker.error(f"on_loop() error (loop #{loop_count}): {e}")
            traceback.print_exc()
            # Don't crash on loop errors — wait and retry
            time.sleep(2)


if __name__ == "__main__":
    main()
