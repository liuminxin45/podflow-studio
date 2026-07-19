"""RSS validation helpers for local-preview and public publish packages."""

from __future__ import annotations

import os
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import urlparse


def validate_rss_feed(
    rss_content: str,
    *,
    public_base_url: str = "",
    expected_enclosure_url: str = "",
) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    enclosure_url = ""
    local_preview_only = not bool(public_base_url.strip())

    try:
        root = ET.fromstring(rss_content)
    except ET.ParseError as exc:
        return {
            "ok": False,
            "errors": [f"RSS XML parse failed: {exc}"],
            "warnings": warnings,
            "enclosure_url": enclosure_url,
            "local_preview_only": local_preview_only,
        }

    channel = root.find("channel")
    if channel is None:
        errors.append("Missing channel")
    else:
        for tag in ["title", "description", "language"]:
            if not _text(channel.find(tag)):
                errors.append(f"Missing channel.{tag}")

        item = channel.find("item")
        if item is None:
            errors.append("Missing item")
        else:
            for tag in ["guid", "title", "description", "pubDate"]:
                if not _text(item.find(tag)):
                    errors.append(f"Missing item.{tag}")

            enclosure = item.find("enclosure")
            if enclosure is None:
                errors.append("Missing item.enclosure")
            else:
                enclosure_url = enclosure.attrib.get("url", "")
                length = enclosure.attrib.get("length", "")
                mime_type = enclosure.attrib.get("type", "")
                if not enclosure_url:
                    errors.append("Missing enclosure.url")
                elif _is_local_absolute_url(enclosure_url):
                    errors.append("enclosure.url must not be an absolute local path or file:// URL")
                if expected_enclosure_url and enclosure_url != expected_enclosure_url:
                    errors.append("enclosure.url does not match publish_outputs.enclosure_url")
                if not str(length).isdigit() or int(length) <= 0:
                    errors.append("enclosure.length must be a positive integer")
                if not mime_type.startswith("audio/"):
                    errors.append("enclosure.type must be an audio MIME type")

    if local_preview_only:
        warnings.append("RSS is local-preview only, not publicly subscribable.")
        if enclosure_url and urlparse(enclosure_url).scheme in {"http", "https"}:
            errors.append("local-preview RSS should not use a public HTTP enclosure URL")
    elif enclosure_url and not enclosure_url.startswith(public_base_url.rstrip("/") + "/"):
        errors.append("public RSS enclosure_url must start with public_base_url")

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "enclosure_url": enclosure_url,
        "local_preview_only": local_preview_only,
    }


def _text(node: ET.Element | None) -> str:
    return (node.text or "").strip() if node is not None else ""


def _is_local_absolute_url(value: str) -> bool:
    parsed = urlparse(value)
    if parsed.scheme == "file":
        return True
    if parsed.scheme and parsed.scheme not in {"http", "https"}:
        return True
    if re.match(r"^[A-Za-z]:[\\/]", value):
        return True
    return os.path.isabs(value)
