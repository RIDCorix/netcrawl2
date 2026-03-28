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
  NETCRAWL_INJECTED={"pickaxe": {"itemType": "pickaxe_basic", "efficiency": 1.0}, "to_mine": ["hub", "r1"], "to_hub": ["r1", "hub"]}
"""

import os, sys, json, importlib.util, time, signal, traceback

_shutdown = False

def _on_sigterm(sig, frame):
    global _shutdown
    _shutdown = True
    # Don't print here — just set the flag. on_loop will finish then we exit.

signal.signal(signal.SIGTERM, _on_sigterm)
signal.signal(signal.SIGINT, _on_sigterm)  # also handle Ctrl+C


def main():
    worker_id = os.environ["NETCRAWL_WORKER_ID"]
    api_url = os.environ.get("NETCRAWL_API_URL", "http://localhost:3001")
    script_path = os.environ["NETCRAWL_SCRIPT_PATH"]
    class_name = os.environ["NETCRAWL_CLASS_NAME"]
    injected_raw = os.environ.get("NETCRAWL_INJECTED", "{}")
    injected_fields_raw = json.loads(injected_raw)

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

    # Process injected fields:
    # - ItemField + dict value → convert to RuntimeItem proxy
    # - RouteField + list value → keep as list
    # - Other → keep as-is
    from netcrawl.fields import ItemField, RouteField
    from netcrawl.runtime import RuntimeItem

    injected_fields = {}
    for field_name, value in injected_fields_raw.items():
        cls_field = WorkerCls._fields.get(field_name)
        if isinstance(cls_field, ItemField) and isinstance(value, dict):
            # Create a RuntimeItem proxy — _worker will be set after __init__
            item_proxy = RuntimeItem(value)
            injected_fields[field_name] = item_proxy
        elif isinstance(cls_field, RouteField) and isinstance(value, list):
            injected_fields[field_name] = value
        else:
            # Unknown field or raw value — inject as-is
            injected_fields[field_name] = value

    # Instantiate with injected values
    worker = WorkerCls(
        worker_id=worker_id,
        api_url=api_url,
        injected_fields=injected_fields,
    )
    # WorkerClass.__init__ already sets _worker on RuntimeItem instances,
    # but do it again here for any that may have been missed
    for field_name in WorkerCls._fields:
        instance = getattr(worker, field_name, None)
        if instance is not None and hasattr(instance, '_worker'):
            instance._worker = worker

    print(f"[{worker_id}] Starting {class_name}...")

    # Run lifecycle
    try:
        worker.on_startup()
    except Exception as e:
        print(f"[{worker_id}] on_startup() failed: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)

    # Main loop
    loop_count = 0
    while not _shutdown:
        try:
            worker.on_loop()
            loop_count += 1
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[{worker_id}] on_loop() error #{loop_count}: {e}", file=sys.stderr)
            traceback.print_exc()
            # Don't crash on loop errors — wait and retry
            time.sleep(2)

    print(f"[{worker_id}] Suspended cleanly after {loop_count} loops.")
    sys.exit(0)


if __name__ == "__main__":
    main()
