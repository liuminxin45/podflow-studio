"""
Test Utilities

Common utilities for node testing, including cross-platform output handling.
"""

import sys


def setup_utf8_output():
    """Setup UTF-8 output for Windows compatibility"""
    if sys.platform == "win32":
        # Reconfigure the existing streams instead of replacing them. Replacing
        # pytest's capture streams closes their underlying buffers during
        # collection and makes the entire suite fail before tests can run.
        for stream in (sys.stdout, sys.stderr):
            reconfigure = getattr(stream, "reconfigure", None)
            if callable(reconfigure):
                reconfigure(encoding="utf-8", errors="replace")


def print_success(message: str):
    """Print success message with cross-platform emoji support"""
    try:
        print(f"✅ {message}")
    except UnicodeEncodeError:
        print(f"[PASS] {message}")


def print_error(message: str):
    """Print error message with cross-platform emoji support"""
    try:
        print(f"❌ {message}")
    except UnicodeEncodeError:
        print(f"[FAIL] {message}")


def print_info(message: str):
    """Print info message"""
    print(message)
