from __future__ import annotations

import pytest

from protocol.bocha_search import BochaSearchError, search_bocha


class Response:
    def __init__(self, status: int, payload=None, text: str = ""):
        self.status_code = status
        self._payload = payload
        self.text = text
        self.ok = 200 <= status < 300

    def json(self):
        return self._payload


def test_bocha_normalizes_and_deduplicates_sources():
    response = Response(
        200,
        {
            "code": 200,
            "data": {
                "webPages": {
                    "value": [
                        {"name": "Source", "url": "https://example.com/a", "summary": "  useful   evidence "},
                        {"name": "Duplicate", "url": "https://example.com/a", "summary": "again"},
                        {"name": "Missing summary", "url": "https://example.com/b"},
                    ]
                }
            },
        },
    )
    results = search_bocha("test", api_key="secret", request=lambda *args, **kwargs: response)
    assert results == [{
        "title": "Source", "url": "https://example.com/a", "content": "useful evidence",
        "summary": "useful evidence", "source": "bocha", "published_at": "",
    }]


def test_bocha_retries_429_then_succeeds():
    responses = iter([
        Response(429),
        Response(200, {"code": 200, "data": {"webPages": {"value": [
            {"name": "Source", "url": "https://example.com/a", "summary": "evidence"}
        ]}}}),
    ])
    waits = []
    results = search_bocha(
        "test", api_key="secret", request=lambda *args, **kwargs: next(responses), wait=waits.append,
    )
    assert len(results) == 1
    assert len(waits) == 1


@pytest.mark.parametrize("status, message", [(401, "authentication"), (403, "authentication"), (500, "HTTP 500")])
def test_bocha_preserves_provider_failures(status, message):
    with pytest.raises(BochaSearchError, match=message):
        search_bocha("test", api_key="secret", request=lambda *args, **kwargs: Response(status, text="failure"))


def test_bocha_rejects_missing_key_and_empty_results(monkeypatch):
    monkeypatch.delenv("PODFLOW_BOCHA_API_KEY", raising=False)
    with pytest.raises(BochaSearchError, match="PODFLOW_BOCHA_API_KEY"):
        search_bocha("test")
    with pytest.raises(BochaSearchError, match="no traceable results"):
        search_bocha(
            "test", api_key="secret",
            request=lambda *args, **kwargs: Response(200, {"code": 200, "data": {"webPages": {"value": []}}}),
        )
