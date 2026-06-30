"""
AI资讯快报数据源
从 https://ai-bot.cn/daily-ai-news 获取每日AI资讯
API: https://60s.viki.moe/v2/ai-news
"""

from typing import Any
from nodes.fetch.sources.base import FetchSourceBase
import requests
from datetime import datetime


class AIDailyNewsSource(FetchSourceBase):
    """AI资讯快报数据源"""

    @property
    def name(self) -> str:
        return "AI资讯快报"

    @property
    def description(self) -> str:
        return "每日AI、大模型领域最新资讯（来源：ai-bot.cn）"

    def fetch(self, fetch_logs: list[str] | None = None) -> list[dict[str, Any]]:
        """
        从API获取AI资讯

        API文档: https://60s.viki.moe/v2/ai-news
        - date: 新闻日期（可选，默认当天）
        - encoding: 编码方式（text/json/markdown）
        """
        url = "https://60s.viki.moe/v2/ai-news"
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - __import__("datetime").timedelta(days=1)).strftime("%Y-%m-%d")

        try:
            items = self._fetch_by_date(url, None, fetch_logs)
            if items:
                return items
            if fetch_logs:
                fetch_logs.append(f"[AIDailyNews] 今日({today})无数据，尝试昨日({yesterday})")
            items = self._fetch_by_date(url, yesterday, fetch_logs)
            if not items and fetch_logs:
                fetch_logs.append("[AIDailyNews] 昨日亦无数据，来源可能暂时不可用")
            return items
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
