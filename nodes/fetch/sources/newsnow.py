"""
NewsNow aggregated hotlist source.

NewsNow exposes many sub-sources behind one HTTP API. This adapter keeps
NewsNow as one PodFlow source while letting FetchConfig select the sub-source
IDs to query.
"""

from datetime import datetime, UTC
import os
from typing import Any

import requests

from nodes.fetch.config import FetchConfig
from nodes.fetch.sources.base import FetchSourceBase


DEFAULT_BASE_URL = "https://newsnow.busiyi.world"
REQUEST_ATTEMPTS = 2
DEFAULT_SOURCE_IDS = [
    "weibo",
    "zhihu",
    "baidu",
    "ithome",
    "36kr-quick",
    "github-trending-today",
    "hackernews",
    "wallstreetcn-quick",
    "cls-telegraph",
    "zaobao",
]

SOURCE_NAMES = {
    "36kr-quick": "36氪",
    "36kr-renqi": "36氪",
    "aihot": "AIHOT",
    "baidu": "百度热搜",
    "bilibili-hot-search": "哔哩哔哩",
    "bilibili-hot-video": "哔哩哔哩",
    "bilibili-ranking": "哔哩哔哩",
    "cankaoxiaoxi": "参考消息",
    "chongbuluo-hot": "虫部落",
    "chongbuluo-latest": "虫部落",
    "cls-telegraph": "财联社",
    "cls-depth": "财联社",
    "cls-hot": "财联社",
    "coolapk": "酷安",
    "dongqiudi": "懂球帝",
    "douban": "豆瓣",
    "douyin": "抖音",
    "fastbull-express": "法布财经",
    "fastbull-news": "法布财经",
    "freebuf": "FreeBuf",
    "gelonghui": "格隆汇",
    "github-trending-today": "GitHub",
    "hackernews": "Hacker News",
    "hupu": "虎扑",
    "ifeng": "凤凰网",
    "iqiyi-hot-ranklist": "爱奇艺",
    "ithome": "IT之家",
    "jin10": "金十数据",
    "juejin": "稀土掘金",
    "kaopu": "靠谱新闻",
    "kuaishou": "快手",
    "mktnews-flash": "MKTNews",
    "nowcoder": "牛客",
    "pcbeta-windows11": "远景论坛",
    "producthunt": "Product Hunt",
    "qqvideo-tv-hotsearch": "腾讯视频",
    "solidot": "Solidot",
    "sputniknewscn": "卫星通讯社",
    "sspai": "少数派",
    "steam": "Steam",
    "tencent-hot": "腾讯新闻",
    "thepaper": "澎湃新闻",
    "tieba": "百度贴吧",
    "toutiao": "今日头条",
    "v2ex-share": "V2EX",
    "wallstreetcn-quick": "华尔街见闻",
    "wallstreetcn-hot": "华尔街见闻",
    "wallstreetcn-news": "华尔街见闻",
    "weibo": "微博",
    "xueqiu-hotstock": "雪球",
    "zaobao": "联合早报",
    "zhihu": "知乎",
}


class NewsNowSource(FetchSourceBase):
    """NewsNow multi-source hotlist adapter."""

    @property
    def name(self) -> str:
        return "NewsNow"

    @property
    def description(self) -> str:
        return "NewsNow 聚合热点源，可在二级开关中选择微博、知乎、IT之家等子源。"

    def fetch(
        self,
        fetch_logs: list[str] | None = None,
        config: FetchConfig | None = None,
    ) -> list[dict[str, Any]]:
        config = config or FetchConfig()
        base_url = (config.newsnow_base_url or os.getenv("NEWSNOW_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        source_ids = _resolve_source_ids(config)
        per_source_limit = max(1, int(getattr(config, "result_limit", 10) or 10))

        items: list[dict[str, Any]] = []
        for source_id in source_ids:
            try:
                payload = _fetch_payload(
                    base_url=base_url,
                    source_id=source_id,
                    fetch_logs=fetch_logs,
                )
            except Exception as exc:
                if fetch_logs is not None:
                    fetch_logs.append(
                        f"[NewsNow] Failed to fetch {source_id}: {type(exc).__name__}: {exc}"
                    )
                continue

            rows = payload.get("items", [])
            if not isinstance(rows, list):
                if fetch_logs is not None:
                    fetch_logs.append(f"[NewsNow] {source_id} returned non-list items")
                continue
            rows = rows[:per_source_limit]

            source_name = SOURCE_NAMES.get(source_id, source_id)
            updated_time = payload.get("updatedTime")
            for rank, row in enumerate(rows, start=1):
                if not isinstance(row, dict):
                    continue
                title = str(row.get("title") or row.get("id") or "").strip()
                extra = row.get("extra") if isinstance(row.get("extra"), dict) else {}
                content = str(extra.get("hover") or extra.get("info") or title).strip()
                url = str(row.get("url") or row.get("mobileUrl") or "").strip()
                items.append(
                    {
                        "title": title,
                        "content": content,
                        "url": url,
                        "published": _format_published(row.get("pubDate") or updated_time),
                        "source": f"newsnow:{source_id}",
                        "type": "hotlist",
                        "source_kind": "platform",
                        "source_id": source_id,
                        "source_name": source_name,
                        "rank": rank,
                    }
                )

        return items


def _resolve_source_ids(config: FetchConfig) -> list[str]:
    raw = config.newsnow_source_ids
    if not raw and os.getenv("NEWSNOW_SOURCE_IDS"):
        raw = _split_env(os.getenv("NEWSNOW_SOURCE_IDS"))
    seen: set[str] = set()
    source_ids: list[str] = []
    for source_id in raw:
        clean = str(source_id).strip()
        if clean and clean not in seen:
            source_ids.append(clean)
            seen.add(clean)
    return source_ids


def _fetch_payload(
    base_url: str,
    source_id: str,
    fetch_logs: list[str] | None,
) -> dict[str, Any]:
    last_exc: Exception | None = None
    for attempt in range(1, REQUEST_ATTEMPTS + 1):
        try:
            response = requests.get(
                f"{base_url}/api/s",
                params={"id": source_id},
                headers={
                    "Accept": "application/json",
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/125.0.0.0 Safari/537.36"
                    ),
                },
                timeout=20,
            )
            response.raise_for_status()
            payload = response.json()
            if isinstance(payload, dict):
                return payload
            raise ValueError("NewsNow response is not a JSON object")
        except Exception as exc:
            last_exc = exc
            if attempt >= REQUEST_ATTEMPTS or not _is_retryable(exc):
                raise
            if fetch_logs is not None:
                fetch_logs.append(
                    f"[NewsNow] Retrying {source_id} after {type(exc).__name__}: {exc}"
                )
    raise last_exc or RuntimeError("NewsNow request failed")


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, (requests.Timeout, requests.ConnectionError)):
        return True
    if isinstance(exc, requests.HTTPError):
        response = getattr(exc, "response", None)
        status_code = getattr(response, "status_code", None)
        return isinstance(status_code, int) and 500 <= status_code < 600
    return False


def _split_env(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _format_published(value: Any) -> str:
    if value in (None, ""):
        return ""
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp = timestamp / 1000
        try:
            return datetime.fromtimestamp(timestamp, tz=UTC).isoformat()
        except Exception:
            return ""
    return str(value)


source = NewsNowSource()
