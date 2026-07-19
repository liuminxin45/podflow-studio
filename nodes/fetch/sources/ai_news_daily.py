"""
AI资讯快报数据源
从 https://ai-bot.cn/daily-ai-news 获取每日AI资讯
API: https://60s.viki.moe/v2/ai-news
"""

from math import ceil
from typing import Any
from nodes.fetch.sources.base import FetchSourceBase
import requests
from datetime import date as date_cls, datetime, timedelta


API_URL = "https://60s.viki.moe/v2/ai-news"
MAX_LOOKBACK_DAYS = 7
FRESHNESS_TO_HOURS = {
    1: 24,
    2: 24 * 7,
    3: 72,
    4: 24,
    5: 6,
}


class AIDailyNewsSource(FetchSourceBase):
    """AI资讯快报数据源"""

    @property
    def name(self) -> str:
        return "AI资讯快报"

    @property
    def description(self) -> str:
        return "每日AI、大模型领域最新资讯（来源：ai-bot.cn）"

    def fetch(
        self, fetch_logs: list[str] | None = None, config: Any | None = None
    ) -> list[dict[str, Any]]:
        """
        从API获取AI资讯

        API文档: https://60s.viki.moe/v2/ai-news
        - date: 新闻日期（可选，默认当天）
        - encoding: 编码方式（text/json/markdown）
        """
        try:
            dates = _resolve_fetch_dates(config)
            if fetch_logs:
                fetch_logs.append(
                    f"[AIDailyNews] Fetching {len(dates)} day(s): {', '.join(dates)}"
                )

            all_items: list[dict[str, Any]] = []
            seen: set[tuple[str, str, str]] = set()
            for news_date in dates:
                for item in self._fetch_by_date(API_URL, news_date, fetch_logs):
                    identity = (
                        str(item.get("url") or ""),
                        str(item.get("title") or ""),
                        str(item.get("published") or ""),
                    )
                    if identity in seen:
                        continue
                    seen.add(identity)
                    all_items.append(item)

            if not all_items and len(dates) == 1:
                yesterday = (date_cls.today() - timedelta(days=1)).isoformat()
                if fetch_logs:
                    fetch_logs.append(f"[AIDailyNews] 今日无数据，尝试昨日({yesterday})")
                all_items = self._fetch_by_date(API_URL, yesterday, fetch_logs)

            if not all_items and fetch_logs:
                fetch_logs.append("[AIDailyNews] 指定日期范围内无数据，来源可能暂时不可用")

            return all_items
        except Exception as e:
            if fetch_logs:
                fetch_logs.append(f"[AIDailyNews] ✗ fetch异常: {type(e).__name__}: {e}")
            return []

    def _fetch_by_date(
        self, url: str, date: str = None, fetch_logs: list[str] | None = None
    ) -> list[dict[str, Any]]:
        """按日期获取资讯"""
        try:
            params = {"encoding": "json"}
            if date:
                params["date"] = date

            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()

            data = response.json()

            # 检查响应格式
            code = data.get("code")
            if code != 200:
                if fetch_logs:
                    fetch_logs.append(
                        f"[AIDailyNews] API返回非200状态: code={code}, msg={data.get('message', data.get('msg', ''))[:100]}"
                    )
                return []

            # 提取新闻数据
            news_data = data.get("data", {})
            news_list = news_data.get("news", [])
            news_date = news_data.get("date", date or datetime.now().strftime("%Y-%m-%d"))

            if not news_list:
                if fetch_logs:
                    fetch_logs.append(
                        f"[AIDailyNews] API响应正常但news列表为空 (date={news_date}), data keys={list(news_data.keys())}"
                    )
                return []

            # 转换为标准格式
            items = []
            for news_item in news_list:
                items.append(
                    {
                        "title": news_item.get("title", ""),
                        "content": news_item.get("detail", ""),
                        "url": news_item.get("link", ""),
                        "published": news_item.get("date", news_date),
                        "source": "ai_news_daily",
                        "type": "api",
                    }
                )

            return items

        except requests.exceptions.RequestException as e:
            if fetch_logs:
                fetch_logs.append(f"[AIDailyNews] ✗ 网络请求失败: {type(e).__name__}: {e}")
            return []
        except Exception as e:
            if fetch_logs:
                fetch_logs.append(f"[AIDailyNews] ✗ 解析异常: {type(e).__name__}: {e}")
            return []


# 导出实例供fetch节点使用
source = AIDailyNewsSource()


def _resolve_fetch_dates(config: Any | None) -> list[str]:
    today = date_cls.today()
    hours = _resolve_recency_hours(config)
    if hours is None or hours <= 0:
        day_count = MAX_LOOKBACK_DAYS
    else:
        day_count = max(1, ceil(hours / 24))
        day_count = min(day_count, MAX_LOOKBACK_DAYS)
    return [(today - timedelta(days=offset)).isoformat() for offset in range(day_count)]


def _resolve_recency_hours(config: Any | None) -> int | None:
    if config is None:
        return 24
    recency_hours = getattr(config, "recency_hours", None)
    if recency_hours is not None:
        try:
            return int(recency_hours)
        except (TypeError, ValueError):
            return 24

    freshness = getattr(config, "freshness", 4)
    try:
        freshness_key = int(freshness)
    except (TypeError, ValueError):
        freshness_key = 4
    return FRESHNESS_TO_HOURS.get(freshness_key, 24)
