#!/usr/bin/env python3
# coding=utf-8
"""Create or repair the dedicated TrendRadar Python runtime.

TrendRadar 6.10 requires Python >=3.12, while the podcast workflow can still
run on the user's normal Python. This script keeps those runtimes separate by
building .venv-trendradar and installing engine/trendradar into it.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
ENGINE_DIR = ROOT_DIR / "engine"
TRENDRADAR_DIR = ENGINE_DIR / "trendradar"
LOCK_FILE = ENGINE_DIR / "trendradar.lock.json"
VENV_DIR = ROOT_DIR / ".venv-trendradar"
COMMAND_TIMEOUT_SECONDS = int(os.environ.get("TRENDRADAR_RUNTIME_TIMEOUT", "180"))
PYPI_INDEX_URL = os.environ.get(
    "TRENDRADAR_PYPI_INDEX_URL",
    "https://pypi.tuna.tsinghua.edu.cn/simple",
)

REQUIRED_MODULES = {
    "feedparser": "feedparser",
    "litellm": "litellm",
    "json-repair": "json_repair",
    "fastmcp": "fastmcp",
}


def venv_python() -> Path:
    if sys.platform == "win32":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def load_lock() -> dict:
    if not LOCK_FILE.exists():
        return {}
    return json.loads(LOCK_FILE.read_text(encoding="utf-8"))


def parse_version_tuple(value: str) -> tuple[int, ...]:
    return tuple(int(p) for p in re.findall(r"\d+", value or "0")[:3]) or (0,)


def python_satisfies(requirement: str, version: str) -> bool:
    match = re.match(r">=\s*([0-9.]+)", requirement or "")
    if not match:
        return True
    return parse_version_tuple(version) >= parse_version_tuple(match.group(1))


def command_env() -> dict[str, str]:
    env = os.environ.copy()
    for key in (
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "http_proxy",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
    ):
        env.pop(key, None)
    env["NO_PROXY"] = "*"
    env["no_proxy"] = "*"
    return env


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    print(f"[setup_trendradar_runtime] {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        cwd=ROOT_DIR,
        env=command_env(),
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(cmd)}")
    return result


def python_version(python: Path) -> str:
    result = subprocess.run(
        [str(python), "-c", "import sys; print('.'.join(map(str, sys.version_info[:3])))"],
        cwd=ROOT_DIR,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def missing_modules(python: Path) -> list[str]:
    code = (
        "import importlib.util, json; "
        f"mods={json.dumps(REQUIRED_MODULES)}; "
        "print(json.dumps([pkg for pkg, mod in mods.items() if importlib.util.find_spec(mod) is None]))"
    )
    result = subprocess.run(
        [str(python), "-c", code],
        cwd=ROOT_DIR,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        return list(REQUIRED_MODULES)
    return json.loads(result.stdout or "[]")


def runtime_ok(requirement: str) -> bool:
    python = venv_python()
    if not python.exists():
        return False
    version = python_version(python)
    if not python_satisfies(requirement, version):
        return False
    return not missing_modules(python)


def ensure_with_uv(requirement: str) -> None:
    uv = shutil.which("uv")
    if not uv:
        raise RuntimeError("未找到 uv，无法自动安装 TrendRadar 专用 Python 3.12 运行时")

    requested_python = "3.12"
    if requirement.startswith(">="):
        requested_python = requirement[2:].strip() or requested_python

    run(
        [
            uv,
            "venv",
            str(VENV_DIR),
            "--python",
            requested_python,
            "--python-preference",
            "managed",
            "--clear",
        ]
    )
    run(
        [
            uv,
            "pip",
            "install",
            "--default-index",
            PYPI_INDEX_URL,
            "--python",
            str(venv_python()),
            "-e",
            str(TRENDRADAR_DIR),
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Set up the TrendRadar runtime")
    parser.add_argument("--check", action="store_true", help="Only validate the current .venv-trendradar")
    args = parser.parse_args()

    lock = load_lock()
    requirement = lock.get("python") or ">=3.12"

    if args.check:
        python = venv_python()
        version = python_version(python) if python.exists() else ""
        missing = missing_modules(python) if python.exists() else list(REQUIRED_MODULES)
        ok = python.exists() and python_satisfies(requirement, version) and not missing
        print(json.dumps({
            "success": ok,
            "python": str(python),
            "pythonVersion": version,
            "pythonRequirement": requirement,
            "missingDependencies": missing,
        }, ensure_ascii=False))
        return 0 if ok else 1

    if runtime_ok(requirement):
        print(f"[setup_trendradar_runtime] Runtime already ready: {venv_python()}")
        return 0

    ensure_with_uv(requirement)

    if not runtime_ok(requirement):
        raise RuntimeError("TrendRadar runtime setup completed but validation still failed")

    print(f"[setup_trendradar_runtime] Runtime ready: {venv_python()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
