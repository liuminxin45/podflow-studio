from datetime import date

import requests

from nodes.fetch.config import FetchConfig
from nodes.fetch.sources.ai_news_daily import AIDailyNewsSource, _resolve_fetch_dates


def test_fetch_config_preserves_discover_recency_hours():
    config = FetchConfig.from_dict({"recency_hours": 168, "freshness": 1})

    assert config.recency_hours == 168


def test_ai_news_daily_fetches_recent_seven_day_window(monkeypatch):
    calls: list[dict] = []

    class FakeResponse:
        def __init__(self, news_date: str):
            self.news_date = news_date

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "code": 200,
                "data": {
                    "date": self.news_date,
                    "news": [
                        {
                            "title": f"AI 日报 {self.news_date}",
                            "detail": "这是一条来自测试接口的 AI 新闻详情，内容足够用于质量过滤。",
                            "link": f"https://example.com/ai-news/{self.news_date}",
                        }
                    ],
                },
            }

    def fake_get(url, params=None, timeout=None):
        calls.append({"url": url, "params": params, "timeout": timeout})
        return FakeResponse(params["date"])

    monkeypatch.setattr(requests, "get", fake_get)
    source = AIDailyNewsSource()
    config = FetchConfig(recency_hours=168)

    items = source.fetch(fetch_logs=[], config=config)

    assert len(items) == 7
    assert len(calls) == 7
    assert [call["params"]["date"] for call in calls] == _resolve_fetch_dates(config)
    assert items[0]["published"] == date.today().isoformat()
