"""
Source guard: enforce per-domain crawl/licensing policies loaded from config files.
"""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional
from urllib.parse import urlparse

import yaml


@dataclasses.dataclass(slots=True)
class SourcePolicy:
    domain: str
    license: str = "unknown"
    crawl_allowed: bool = True
    source_type: str = "unknown"
    notes: str | None = None
    extra: dict[str, Any] = dataclasses.field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = dataclasses.asdict(self)
        data.update(data.pop("extra", {}))
        return data

    @property
    def allowed(self) -> bool:
        return self.crawl_allowed and self.license not in {"forbidden", "blocked"}


class SourceGuard:
    def __init__(self, config_dir: str | Path | None = None) -> None:
        self.config_dir = Path(config_dir or "./config/sources")
        self._policies: dict[str, SourcePolicy] = {}
        self.load()

    def load(self) -> None:
        self._policies.clear()
        if not self.config_dir.exists():
            return
        for path in sorted(self.config_dir.glob("*.yml")) + sorted(self.config_dir.glob("*.yaml")):
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            except Exception:
                continue
            sources = data if isinstance(data, list) else data.get("sources")
            if not isinstance(sources, Iterable):
                continue
            for entry in sources:
                if not isinstance(entry, Mapping):
                    continue
                domain = str(entry.get("domain") or entry.get("host") or "").lower().strip()
                if not domain:
                    continue
                policy = SourcePolicy(
                    domain=domain,
                    license=str(entry.get("license") or "unknown").lower(),
                    crawl_allowed=bool(entry.get("crawl_allowed", True)),
                    source_type=str(entry.get("source_type") or "unknown"),
                    notes=entry.get("notes"),
                    extra={k: v for k, v in entry.items() if k not in {"domain", "license", "crawl_allowed", "source_type", "notes"}},
                )
                self._policies[domain] = policy

    @staticmethod
    def _domain_from_url(url: str | None) -> str:
        if not url:
            return ""
        try:
            parsed = urlparse(url)
            host = (parsed.netloc or "").lower()
            if host.startswith("www."):
                host = host[4:]
            return host
        except Exception:
            return ""

    def lookup(self, domain_or_url: str | None) -> SourcePolicy | None:
        if not domain_or_url:
            return None
        if "://" in domain_or_url:
            domain = self._domain_from_url(domain_or_url)
        else:
            domain = domain_or_url.lower()
        if not domain:
            return None

        if domain in self._policies:
            return self._policies[domain]

        # Try parent domains (e.g. news.example.com -> example.com)
        parts = domain.split(".")
        for i in range(1, len(parts) - 1):
            parent = ".".join(parts[i:])
            if parent in self._policies:
                return self._policies[parent]
        return None

    def check(self, *, url: str | None = None, domain: str | None = None) -> dict[str, Any]:
        target_domain = domain or self._domain_from_url(url)
        policy = self.lookup(target_domain)
        if policy is None:
            return {
                "domain": target_domain,
                "allowed": True,
                "reason": [],
                "policy": {
                    "license": "unknown",
                    "crawl_allowed": True,
                    "source_type": "unknown",
                },
            }

        allowed = policy.allowed
        reasons: list[str] = []
        if not policy.crawl_allowed:
            reasons.append("crawl_not_allowed")
        if policy.license in {"forbidden", "blocked"}:
            reasons.append(f"license:{policy.license}")

        return {
            "domain": target_domain,
            "allowed": allowed,
            "reason": reasons,
            "policy": policy.to_dict(),
        }


__all__ = [
    "SourcePolicy",
    "SourceGuard",
]
