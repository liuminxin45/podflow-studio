"""
Date Parser Utilities
"""

import re
from datetime import date, datetime, timezone
from typing import Optional


def parse_published_date(entry) -> Optional[str]:
    """
    从RSS entry中解析发布日期
    
    Args:
        entry: feedparser entry对象
    
    Returns:
        Optional[str]: ISO8601格式的日期字符串
    """
    # 尝试从published字段获取
    if getattr(entry, "published", None):
        try:
            return _to_iso8601(getattr(entry, "published"))
        except Exception:
            pass
    
    # 尝试从published_parsed获取
    if getattr(entry, "published_parsed", None):
        try:
            t = getattr(entry, "published_parsed")
            return datetime(*t[:6], tzinfo=timezone.utc).isoformat()
        except Exception:
            pass
    
    return None


def parse_date_from_title(title: str) -> Optional[date]:
    """
    从标题中提取日期
    
    支持格式：
    - 📅 2025-12-30 星期二
    - 2025-12-30
    - 2025年12月30日
    
    Args:
        title: 标题字符串
    
    Returns:
        Optional[date]: 日期对象
    """
    # 匹配 YYYY-MM-DD 格式
    match = re.search(r'(\d{4})-(\d{2})-(\d{2})', title)
    if match:
        try:
            year, month, day = match.groups()
            return date(int(year), int(month), int(day))
        except ValueError:
            pass
    
    # 匹配 YYYY年MM月DD日 格式
    match = re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日', title)
    if match:
        try:
            year, month, day = match.groups()
            return date(int(year), int(month), int(day))
        except ValueError:
            pass
    
    return None


def _to_iso8601(date_str: str) -> Optional[str]:
    """将日期字符串转换为ISO8601格式"""
    try:
        # 尝试多种日期格式
        for fmt in [
            "%a, %d %b %Y %H:%M:%S %z",
            "%a, %d %b %Y %H:%M:%S %Z",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%d %H:%M:%S",
        ]:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.isoformat()
            except ValueError:
                continue
        return None
    except Exception:
        return None
