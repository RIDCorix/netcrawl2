"""
netcrawl/version.py

The release this runtime actually is, and the wire protocol it speaks.

Both are literals rather than an importlib.metadata lookup on purpose: this
package is regularly run straight off a source tree that shadows a different
installed release, and a runtime that reports a version it is not running would
be talked past the very gate these values exist to trip.

`tests/test_version.py` keeps __version__ in step with pyproject.toml, and the
server's `MIN_PYTHON_SDK_VERSION` names the oldest release it will accept.
"""

__version__ = "1.4.2"

#: Wire protocol spoken by this SDK. The server refuses any other value.
PROTOCOL_VERSION = 3

__all__ = ["__version__", "PROTOCOL_VERSION"]
