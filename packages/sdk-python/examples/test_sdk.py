"""
examples/test_sdk.py

Quick smoke-test: imports example workers and prints their deploy-time schemas.
Run from the sdk-python/ directory:
    python examples/test_sdk.py
"""
import sys
import os

# Ensure the sdk-python package root is on sys.path when run directly
SDK_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SDK_ROOT not in sys.path:
    sys.path.insert(0, SDK_ROOT)

from examples.collector import Collector
from examples.guardian import Guardian
from examples.scout import Scout

import json

def pretty(obj):
    print(json.dumps(obj, indent=2))

print("=== Collector schema ===")
pretty(Collector.get_schema())

print()
print("=== Guardian schema ===")
pretty(Guardian.get_schema())

print()
print("=== Scout schema ===")
pretty(Scout.get_schema())

print()
print("All schemas OK.")
