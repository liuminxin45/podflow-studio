#!/usr/bin/env python
"""
Test All Nodes

Runs test modules for all 11 nodes and reports results.
"""

import sys
import io
import subprocess
from pathlib import Path

# Fix Windows gbk encoding for emoji output
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

PROJECT_ROOT = Path(__file__).parent.parent

NODES = [
    # discover
    "fetch",
    "manual",
    "merge",
    # organize
    "preprocess",
    # ideate
    "research",
    "topic_selection",
    # write
    "script",
    # produce
    "tts",
    "audio_postprocess",
    "assets",
    # publish
    "review",
    "publish",
]


def run_node_test(node_name: str) -> tuple[bool, str]:
    """Run test for a single node"""
    test_file = PROJECT_ROOT / "nodes" / node_name / "test.py"

    if not test_file.exists():
        return False, f"Test file not found: {test_file}"

    try:
        result = subprocess.run(
            [sys.executable, str(test_file)],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=PROJECT_ROOT,
            encoding="utf-8",
            errors="replace",
        )

        output = (result.stdout or "") + (result.stderr or "")

        if result.returncode == 0:
            # Extract success message from output
            lines = output.strip().split("\n")
            success_line = [line for line in lines if "✅" in line]
            message = success_line[-1] if success_line else "Test passed"
            return True, message
        else:
            # Extract error message
            lines = output.strip().split("\n")
            error_msg = [line for line in lines if "❌" in line]
            if error_msg:
                message = error_msg[-1]
            else:
                # Show last few lines of output for debugging
                last_lines = [line for line in lines if line.strip()][-3:]
                message = "; ".join(last_lines) if last_lines else f"Exit code {result.returncode}"
            return False, message

    except subprocess.TimeoutExpired:
        return False, "Test timeout (30s)"
    except Exception as e:
        return False, f"Exception: {type(e).__name__}: {e}"


def main():
    print("=" * 70)
    print("Running All Node Tests")
    print("=" * 70)
    print()

    results: dict[str, tuple[bool, str]] = {}

    for i, node in enumerate(NODES, 1):
        print(f"[{i}/{len(NODES)}] Testing {node}...", end=" ", flush=True)
        passed, message = run_node_test(node)
        results[node] = (passed, message)

        if passed:
            print("✅")
            print(f"      {message}")
        else:
            print("❌")
            print(f"      {message}")
        print()

    print("=" * 70)
    print("Summary")
    print("=" * 70)

    passed_count = sum(1 for passed, _ in results.values() if passed)
    failed_count = len(results) - passed_count

    print(f"\nTotal: {passed_count}/{len(results)} tests passed\n")

    if failed_count > 0:
        print("Failed tests:")
        for node, (passed, message) in results.items():
            if not passed:
                print(f"  ❌ {node}: {message}")
        print()

    if passed_count == len(results):
        print("🎉 All node tests passed!")
        sys.exit(0)
    else:
        print(f"❌ {failed_count} test(s) failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
