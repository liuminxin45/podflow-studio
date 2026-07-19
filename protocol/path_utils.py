"""Cross-platform path component normalization for generated artifacts."""

from __future__ import annotations

import hashlib
import re
from typing import Any


_WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
}


def safe_path_part(value: Any, fallback: str = "unknown", max_length: int = 120) -> str:
    """Return one portable, collision-resistant filesystem path component."""

    max_bytes = max(1, int(max_length))

    def normalize(raw: Any) -> str:
        text = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", str(raw or ""))
        text = re.sub(r"\s+", "_", text)
        return text.strip(" ._")

    def truncate_utf8(text: str, byte_limit: int) -> str:
        if byte_limit <= 0:
            return ""
        encoded = text.encode("utf-8")
        if len(encoded) <= byte_limit:
            return text
        return encoded[:byte_limit].decode("utf-8", errors="ignore").rstrip(" ._")

    raw = str(value or "")
    safe = normalize(raw)
    comparison = raw
    digest_source = raw
    if not safe:
        comparison = str(fallback or "unknown")
        digest_source = raw or comparison
        safe = normalize(comparison) or "unknown"

    reserved = safe.split(".", 1)[0].upper() in _WINDOWS_RESERVED_NAMES
    case_collides = safe != safe.casefold()
    lossy = (
        safe != comparison
        or bool(raw and not normalize(raw))
        or reserved
        or case_collides
        or len(safe.encode("utf-8")) > max_bytes
    )
    if reserved:
        safe = f"_{safe}"
    if not lossy:
        return safe

    digest = hashlib.sha256(digest_source.encode("utf-8")).hexdigest()[:8]
    suffix = f"_{digest}"
    suffix_bytes = len(suffix.encode("utf-8"))
    if suffix_bytes >= max_bytes:
        return digest[:max_bytes]
    prefix = truncate_utf8(safe, max_bytes - suffix_bytes).rstrip(" ._")
    if not prefix:
        return digest[:max_bytes]
    return f"{prefix}{suffix}"
