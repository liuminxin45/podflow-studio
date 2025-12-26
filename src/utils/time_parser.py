"""
Time parsing utilities for the Auto-Podcast pipeline.

This module normalises heterogeneous date/time strings coming from
news sources and external APIs (e.g. Metaso) into ISO-formatted values.
It focuses on the formats mentioned in the vNext design doc:

* ISO strings such as ``2025-07-25`` or ``2025-07-25T11:23:45+08:00``
* Chinese literals such as ``2022年04月29日`` or ``2024年7月3日 18:30``
* Common dash/solid formats ``2016-09-17`` / ``20240612``
* Relative expressions like ``2小时前`` (optional best-effort)

The central helper is :func:`parse_date` which returns a ``ParsedDate``
dataclass capturing both the ``datetime`` object (always timezone-aware)
and a ``date_iso`` string for downstream freshness scoring.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass
from typing import Callable, Literal, Sequence

from dateutil import parser as date_parser
from zoneinfo import ZoneInfo

__all__ = [
    "ParsedDate",
    "parse_date",
    "parse_date_to_iso",
    "normalize_datetime",
]


_CHINESE_DATE_RE = re.compile(
    r"""
    ^
    (?P<year>\d{2,4})年
    (?P<month>\d{1,2})月
    (?P<day>\d{1,2})日
    (?:\s*
        (?P<hour>\d{1,2})
        (?::|点)
        (?P<minute>\d{1,2})
        (?:
            (?::|分)
            (?P<second>\d{1,2})
        )?
    )?
    $
    """,
    re.VERBOSE,
)

_RELATIVE_RE = re.compile(r"(?P<num>\d+)(?P<unit>秒|分钟|分|小时|天)前")

_SIMPLE_DATE_RE = re.compile(r"^(?P<year>\d{4})[-/\.](?P<month>\d{1,2})[-/\.](?P<day>\d{1,2})$")
_COMPACT_DATE_RE = re.compile(r"^(?P<year>\d{4})(?P<month>\d{2})(?P<day>\d{2})$")


@dataclass(frozen=True)
class ParsedDate:
    """Normalised representation of a parsed date/time string."""

    raw: str | None
    datetime: dt.datetime | None
    date_iso: str | None
    parser: str | None = None
    confidence: float = 0.0

    def isoformat(self) -> str | None:
        """Return ``datetime.isoformat()`` if available."""
        return self.datetime.isoformat() if self.datetime else None


def _get_tz(tz_or_name: str | dt.tzinfo | None) -> dt.tzinfo:
    if isinstance(tz_or_name, dt.tzinfo):
        return tz_or_name
    if isinstance(tz_or_name, str) and tz_or_name:
        return ZoneInfo(tz_or_name)
    return dt.timezone.utc


def normalize_datetime(value: dt.datetime, tz: str | dt.tzinfo | None = "Asia/Shanghai") -> dt.datetime:
    """Ensure a datetime is timezone-aware and converted to the requested tz."""
    target_tz = _get_tz(tz)
    if value.tzinfo is None:
        value = value.replace(tzinfo=target_tz)
    return value.astimezone(target_tz)


def _try_int_timestamp(raw: str, tz: dt.tzinfo) -> dt.datetime | None:
    if not raw.isdigit():
        return None
    try:
        ivalue = int(raw)
    except ValueError:
        return None
    # Heuristic: treat 13 digits as milliseconds.
    if len(raw) >= 13:
        ivalue = ivalue // 1000
    try:
        return dt.datetime.fromtimestamp(ivalue, tz)
    except (OverflowError, OSError):
        return None


def _parse_chinese_literal(raw: str, tz: dt.tzinfo) -> dt.datetime | None:
    m = _CHINESE_DATE_RE.match(raw)
    if not m:
        return None
    parts = {k: int(v) if v else 0 for k, v in m.groupdict().items()}
    year = parts["year"]
    if year < 100:
        year += 2000
    try:
        return dt.datetime(
            year=year,
            month=max(1, min(parts["month"], 12)),
            day=max(1, min(parts["day"], 31)),
            hour=parts.get("hour", 0),
            minute=parts.get("minute", 0),
            second=parts.get("second", 0),
            tzinfo=tz,
        )
    except ValueError:
        return None


def _parse_simple_date(raw: str, tz: dt.tzinfo) -> dt.datetime | None:
    m = _SIMPLE_DATE_RE.match(raw)
    if m:
        year = int(m.group("year"))
        month = int(m.group("month"))
        day = int(m.group("day"))
    else:
        m = _COMPACT_DATE_RE.match(raw)
        if not m:
            return None
        year = int(m.group("year"))
        month = int(m.group("month"))
        day = int(m.group("day"))
    try:
        return dt.datetime(year, month, day, tzinfo=tz)
    except ValueError:
        return None


def _parse_relative(raw: str, tz: dt.tzinfo, now: dt.datetime) -> dt.datetime | None:
    match = _RELATIVE_RE.search(raw)
    if not match:
        return None
    num = int(match.group("num"))
    unit = match.group("unit")
    delta_kwargs: dict[str, int] = {}
    if unit in {"秒"}:
        delta_kwargs = {"seconds": num}
    elif unit in {"分钟", "分"}:
        delta_kwargs = {"minutes": num}
    elif unit == "小时":
        delta_kwargs = {"hours": num}
    elif unit == "天":
        delta_kwargs = {"days": num}
    else:
        return None
    return now - dt.timedelta(**delta_kwargs)


def _parse_with_dateutil(raw: str, tz: dt.tzinfo) -> dt.datetime | None:
    try:
        dt_obj = date_parser.parse(raw)
    except (ValueError, OverflowError, TypeError):
        return None
    if dt_obj.tzinfo is None:
        dt_obj = dt_obj.replace(tzinfo=tz)
    return dt_obj.astimezone(tz)


def parse_date(
    value: str | dt.datetime | None,
    *,
    default_tz: str | dt.tzinfo | None = "Asia/Shanghai",
    now: dt.datetime | None = None,
) -> ParsedDate:
    """
    Parse arbitrary date/time input into a :class:`ParsedDate`.

    Parameters
    ----------
    value:
        String or ``datetime`` to parse.
    default_tz:
        Timezone applied when the input is naive. Defaults to ``Asia/Shanghai``.
    now:
        Reference time for relative expressions (defaults to ``datetime.now(tz)``).
    """

    tz = _get_tz(default_tz)
    reference_now = now.astimezone(tz) if now else dt.datetime.now(tz)

    if value is None:
        return ParsedDate(raw=None, datetime=None, date_iso=None, parser=None, confidence=0.0)

    if isinstance(value, dt.datetime):
        normalized = normalize_datetime(value, tz)
        return ParsedDate(
            raw=value.isoformat(),
            datetime=normalized,
            date_iso=normalized.date().isoformat(),
            parser="datetime",
            confidence=1.0,
        )

    raw = str(value).strip()
    if not raw:
        return ParsedDate(raw="", datetime=None, date_iso=None, parser=None, confidence=0.0)

    strategies: Sequence[tuple[str, Callable[[str], dt.datetime | None]]] = (
        ("timestamp", lambda s: _try_int_timestamp(s, tz)),
        ("chinese", lambda s: _parse_chinese_literal(s, tz)),
        ("simple", lambda s: _parse_simple_date(s, tz)),
        ("relative", lambda s: _parse_relative(s, tz, reference_now)),
        ("dateutil", lambda s: _parse_with_dateutil(s, tz)),
    )

    for name, handler in strategies:
        dt_obj = handler(raw)
        if dt_obj is not None:
            return ParsedDate(
                raw=raw,
                datetime=dt_obj,
                date_iso=dt_obj.date().isoformat(),
                parser=name,
                confidence=0.9 if name != "dateutil" else 0.7,
            )

    return ParsedDate(raw=raw, datetime=None, date_iso=None, parser=None, confidence=0.0)


def parse_date_to_iso(value: str | dt.datetime | None, *, default_tz: str | dt.tzinfo | None = "Asia/Shanghai") -> str | None:
    """
    Convenience helper returning only the ISO date string (``YYYY-MM-DD``).

    Returns ``None`` when parsing fails.
    """

    parsed = parse_date(value, default_tz=default_tz)
    return parsed.date_iso
