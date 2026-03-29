"""
netcrawl/runner.py

Entrypoint for unit subprocesses.
Reads env vars set by the daemon, imports the unit class,
injects field values, and runs the unit lifecycle.

Called by daemon like:
  python -m netcrawl.runner
With env vars:
  NETCRAWL_UNIT_ID=unit-abc123
  NETCRAWL_API_URL=http://localhost:4800
  NETCRAWL_SCRIPT_PATH=C:/path/to/units/collector.py
  NETCRAWL_CLASS_NAME=Collector
  NETCRAWL_INJECTED={"pickaxe": {"itemType": "pickaxe_basic", "efficiency": 1.0}, "to_mine": ["e1", "e3"], "to_hub": ["e3", "e1"]}
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
    unit_id = os.environ.get("NETCRAWL_UNIT_ID") or os.environ.get("NETCRAWL_WORKER_ID", "")
    api_url = os.environ.get("NETCRAWL_API_URL", "http://localhost:4800")
    script_path = os.environ["NETCRAWL_SCRIPT_PATH"]
    class_name = os.environ["NETCRAWL_CLASS_NAME"]
    injected_raw = os.environ.get("NETCRAWL_INJECTED", "{}")
    injected_fields_raw = json.loads(injected_raw)

    # Dynamically import the user's script
    spec = importlib.util.spec_from_file_location("unit_module", script_path)
    module = importlib.util.module_from_spec(spec)

    # Add the script's directory to sys.path so it can import sibling files
    script_dir = os.path.dirname(os.path.abspath(script_path))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)

    spec.loader.exec_module(module)

    # Retrieve the unit class by name
    UnitCls = getattr(module, class_name, None)
    if UnitCls is None:
        print(f"ERROR: Class '{class_name}' not found in {script_path}", file=sys.stderr)
        sys.exit(1)

    # Process injected fields:
    # - ItemField + dict value → convert to RuntimeItem proxy
    # - EdgeField + str value → keep as string (edge ID)
    # - RouteField + list value → keep as list (edge IDs)
    # - GadgetField → create runtime gadget (no injected data needed)
    # - Other → keep as-is
    from netcrawl.fields import ItemField, EdgeField, RouteField, GadgetField
    from netcrawl.runtime import RuntimeItem
    from netcrawl.items.equipment import SensorGadget
    from netcrawl.runtime import RuntimeSensorGadget

    # First: auto-create runtime proxies for gadget fields (not injected by server)
    injected_fields = {}
    for field_name, cls_field in UnitCls._fields.items():
        if isinstance(cls_field, SensorGadget):
            injected_fields[field_name] = RuntimeSensorGadget()

    # Then: process server-injected values
    for field_name, value in injected_fields_raw.items():
        cls_field = UnitCls._fields.get(field_name)
        if isinstance(cls_field, ItemField) and isinstance(value, dict):
            item_proxy = RuntimeItem(value)
            injected_fields[field_name] = item_proxy
        elif isinstance(cls_field, EdgeField) and isinstance(value, str):
            injected_fields[field_name] = value
        elif isinstance(cls_field, RouteField) and isinstance(value, list):
            injected_fields[field_name] = value
        else:
            injected_fields[field_name] = value

    # Instantiate with injected values
    unit = UnitCls(
        unit_id=unit_id,
        api_url=api_url,
        injected_fields=injected_fields,
    )

    print(f"[{unit_id}] Starting {class_name}...")

    # Run lifecycle
    try:
        unit.on_startup()
    except Exception as e:
        print(f"[{unit_id}] on_startup() failed: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)

    # Main loop
    loop_count = 0
    while not _shutdown:
        try:
            unit.on_loop()
            loop_count += 1
        except KeyboardInterrupt:
            break
        except Exception as e:
            msg = f"on_loop() error #{loop_count}: {e}"
            print(f"[{unit_id}] {msg}", file=sys.stderr)
            traceback.print_exc()
            # Report fatal error to server — sets unit to 'error' status
            try:
                unit._client.action("report_error", {"message": msg})
            except Exception:
                pass
            print(f"[{unit_id}] Stopped due to error after {loop_count} loops.")
            sys.exit(1)

    print(f"[{unit_id}] Suspended cleanly after {loop_count} loops.")
    sys.exit(0)


if __name__ == "__main__":
    main()
