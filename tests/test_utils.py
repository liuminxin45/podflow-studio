"""
Test Utilities

Common utilities for node testing, including cross-platform output handling.
"""

import sys
import io


def setup_utf8_output():
    """Setup UTF-8 output for Windows compatibility"""
    if sys.platform == "win32":
        # Force UTF-8 encoding for stdout/stderr on Windows
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


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
