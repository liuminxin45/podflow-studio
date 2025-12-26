from __future__ import annotations

import datetime as dt

from src.utils.time_parser import ParsedDate, parse_date, parse_date_to_iso


def test_parse_iso_date():
    assert parse_date_to_iso("2025-07-25") == "2025-07-25"


def test_parse_chinese_date():
    assert parse_date_to_iso("2022年04月29日") == "2022-04-29"


def test_parse_relative_date():
    now = dt.datetime(2025, 12, 26, tzinfo=dt.timezone.utc)
    parsed: ParsedDate = parse_date("2天前", default_tz=dt.timezone.utc, now=now)
    assert parsed.date_iso == "2025-12-24"
