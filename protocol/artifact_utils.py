"""Helpers for binding review and publish metadata to concrete artifacts."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any


def file_fingerprint(value: Any) -> dict[str, Any]:
    """Return a stable identity for an existing file, or an empty mapping."""

    raw_path = str(value or "").strip()
    if not raw_path:
        return {}
    path = Path(raw_path)
    try:
        if not path.is_file():
            return {}
        digest = hashlib.sha256()
        with path.open("rb") as artifact:
            for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
                digest.update(chunk)
        return {
            "path": str(path.resolve()),
            "size_bytes": path.stat().st_size,
            "sha256": digest.hexdigest(),
        }
    except OSError:
        return {}
