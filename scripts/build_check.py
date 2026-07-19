#!/usr/bin/env python
"""
Build Check Script

Validates that the project structure is correct and all dependencies are properly configured.
"""

import sys
import subprocess
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent


def check_python_package() -> tuple[bool, str]:
    """Check if Python package is properly configured"""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "show", "podflow-studio"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            return True, "Python package installed"
        else:
            return False, "Python package not installed (run: npm run setup:python)"
    except Exception as e:
        return False, f"Failed to check package: {e}"


def check_node_modules() -> tuple[bool, str]:
    """Check if Node.js dependencies are installed"""
    node_modules = PROJECT_ROOT / "node_modules"
    if node_modules.exists() and node_modules.is_dir():
        return True, "Node modules installed"
    else:
        return False, "Node modules not found (run: npm install)"


def check_required_files() -> tuple[bool, str]:
    """Check if all required files exist"""
    required = [
        "package.json",
        "pyproject.toml",
        "electron/main.js",
        "electron/preload.js",
        "protocol/state.py",
        "protocol/config_base.py",
        "protocol/node_runner.py",
        "src/App.tsx",
        "src/main.tsx",
        "vite.config.mts",
        "tsconfig.json",
    ]

    missing = []
    for file_path in required:
        if not (PROJECT_ROOT / file_path).exists():
            missing.append(file_path)

    if missing:
        return False, f"Missing files: {', '.join(missing)}"
    else:
        return True, f"All {len(required)} required files present"


def check_node_structure() -> tuple[bool, str]:
    """Check if all nodes have required files"""
    nodes_dir = PROJECT_ROOT / "nodes"
    expected_nodes = [
        # discover
        "fetch",
        # organize
        "preprocess",
        # ideate
        "research",
        "topic_selection",
        "facts",
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

    issues = []
    for node in expected_nodes:
        node_dir = nodes_dir / node
        if not node_dir.exists():
            issues.append(f"{node}: directory missing")
            continue

        required_files = ["__init__.py", "__main__.py", "config.py", "node.py"]
        for file in required_files:
            if not (node_dir / file).exists():
                issues.append(f"{node}/{file}: missing")

    if issues:
        return False, f"Node structure issues: {'; '.join(issues[:3])}"
    else:
        return True, f"All {len(expected_nodes)} nodes properly structured"


def check_typescript_config() -> tuple[bool, str]:
    """Check TypeScript configuration"""
    try:
        npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
        result = subprocess.run(
            [npx_cmd, "tsc", "--noEmit"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0:
            return True, "TypeScript compilation check passed"
        else:
            errors = result.stdout.count("error TS")
            return False, f"TypeScript has {errors} errors"
    except FileNotFoundError:
        return False, "npx not found (Node.js not installed?)"
    except Exception as e:
        return False, f"TypeScript check failed: {e}"


def main():
    print("=" * 60)
    print("Build Check")
    print("=" * 60)
    print()

    checks = [
        ("Required Files", check_required_files),
        ("Node Structure", check_node_structure),
        ("Python Package", check_python_package),
        ("Node Modules", check_node_modules),
        ("TypeScript Config", check_typescript_config),
    ]

    results = []
    for name, check_func in checks:
        try:
            passed, message = check_func()
            results.append((name, passed, message))
            status = "PASS" if passed else "FAIL"
            print(f"{status} {name}: {message}")
        except Exception as e:
            results.append((name, False, str(e)))
            print(f"FAIL {name}: Exception - {e}")

    print()
    print("=" * 60)

    passed_count = sum(1 for _, passed, _ in results if passed)
    total_count = len(results)

    print(f"Results: {passed_count}/{total_count} checks passed")

    if passed_count == total_count:
        print("Build check PASSED - project is ready")
        sys.exit(0)
    else:
        print("Build check FAILED - fix issues above")
        sys.exit(1)


if __name__ == "__main__":
    main()
