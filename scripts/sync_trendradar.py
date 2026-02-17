#!/usr/bin/env python3
"""Synchronize the TrendRadar subproject into engine/trendradar.

Default behavior is intentionally conservative: sync to the checked-in lock
file. Use --update latest to move to upstream master after compatibility checks.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO_URL = "https://github.com/sansan0/TrendRadar.git"
ROOT_DIR = Path(__file__).resolve().parent.parent
TARGET_DIR = ROOT_DIR / "engine" / "trendradar"
LOCK_FILE = ROOT_DIR / "engine" / "trendradar.lock.json"


def run(cmd, cwd=None, check=False):
    print(f"[sync_trendradar] {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if result.stdout:
        print(result.stdout.strip())
    if result.stderr:
        print(result.stderr.strip(), file=sys.stderr)
    if result.returncode != 0 and not check:
        print(f"[sync_trendradar] WARNING: command exited with code {result.returncode}")
    if check and result.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(cmd)}")
    return result.returncode


def load_lock():
    if not LOCK_FILE.exists():
        return {}
    return json.loads(LOCK_FILE.read_text(encoding="utf-8"))


def parse_version_tuple(value):
    return tuple(int(p) for p in re.findall(r"\d+", value or "0")[:3]) or (0,)


def python_satisfies(requirement, version):
    match = re.match(r">=\s*([0-9.]+)", requirement or "")
    if not match:
        return True
    return parse_version_tuple(version) >= parse_version_tuple(match.group(1))


def fetch_text(url):
    with urllib.request.urlopen(url, timeout=15) as response:
        return response.read().decode("utf-8", errors="replace")


def remote_requirement():
    text = fetch_text("https://raw.githubusercontent.com/sansan0/TrendRadar/master/pyproject.toml")
    match = re.search(r'requires-python\s*=\s*"([^"]+)"', text)
    return match.group(1) if match else ""


def current_python_version():
    return ".".join(map(str, sys.version_info[:3]))


def locked_requirement(lock):
    return lock.get("python") or ""


def ensure_clean(target):
    if not (target / ".git").exists():
        return
    status = subprocess.check_output(["git", "status", "--porcelain"], cwd=target, text=True)
    if status.strip():
        raise RuntimeError(
            "engine/trendradar has local changes. Commit/stash them inside the "
            "TrendRadar sub-repository or remove the directory before syncing."
        )


def current_head(target):
    if not (target / ".git").exists():
        return ""
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=target, text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else ""


def clone_if_missing(target):
    if (target / ".git").exists():
        return
    print(f"[sync_trendradar] Cloning {REPO_URL} into {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", REPO_URL, str(target)], check=True)


def sync_to_ref(target, ref, dry_run=False, allow_dirty_if_at_ref=False):
    clone_if_missing(target)
    if allow_dirty_if_at_ref and current_head(target) == ref:
        print("[sync_trendradar] Already at locked ref; skip checkout to preserve embedded tree")
        return
    ensure_clean(target)
    print(f"[sync_trendradar] Target ref: {ref}")
    if dry_run:
        return
    run(["git", "fetch", "origin"], cwd=target, check=True)
    run(["git", "checkout", ref], cwd=target, check=True)


def install_deps(target, dry_run=False):
    if dry_run:
        print("[sync_trendradar] Dry run: skip dependency install")
        return
    run([sys.executable, "-m", "pip", "install", "-e", str(target)], check=True)


def main():
    parser = argparse.ArgumentParser(description="Synchronize TrendRadar")
    parser.add_argument("--check", action="store_true", help="Only print current/locked/remote status")
    parser.add_argument("--update", choices=["lock", "latest"], default="lock")
    parser.add_argument("--ref", default="", help="Explicit git ref to checkout")
    parser.add_argument("--install-deps", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    target = TARGET_DIR.resolve()
    lock = load_lock()
    locked_ref = lock.get("commit") or lock.get("ref") or "master"
    selected_ref = args.ref or ("origin/master" if args.update == "latest" else locked_ref)

    print(f"[sync_trendradar] target={target}")
    print(f"[sync_trendradar] locked_version={lock.get('version')} locked_ref={locked_ref}")

    if args.update == "latest":
        requirement = remote_requirement()
        py_version = current_python_version()
        print(f"[sync_trendradar] remote_python={requirement or 'unknown'} current_python={py_version}")
        if not python_satisfies(requirement, py_version):
            raise RuntimeError(
                f"TrendRadar latest requires Python {requirement}, current Python is {py_version}. "
                "Use an independent Python 3.12 runtime before updating."
            )

    if args.install_deps:
        requirement = remote_requirement() if args.update == "latest" else locked_requirement(lock)
        py_version = current_python_version()
        print(f"[sync_trendradar] dependency_python={requirement or 'unknown'} current_python={py_version}")
        if not python_satisfies(requirement, py_version):
            raise RuntimeError(
                f"TrendRadar dependencies require Python {requirement}, current Python is {py_version}. "
                "Run this script with Python 3.12+ or set the app's TRENDRADAR_PYTHON_PATH."
            )

    if args.check:
        if (target / ".git").exists():
            run(["git", "rev-parse", "HEAD"], cwd=target)
            run(["git", "status", "--short"], cwd=target)
        else:
            print("[sync_trendradar] TrendRadar is not cloned")
        return

    sync_to_ref(
        target,
        selected_ref,
        dry_run=args.dry_run,
        allow_dirty_if_at_ref=(not args.ref and args.update == "lock"),
    )
    if args.install_deps:
        install_deps(target, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
