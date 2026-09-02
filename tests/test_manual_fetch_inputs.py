from unittest.mock import Mock, patch

import pytest
import requests

from nodes.fetch.config import FetchConfig
from nodes.fetch.manual_inputs import collect_manual_inputs, fetch_manual_url
from nodes.fetch.node import run


def test_manual_text_is_merged_without_network() -> None:
    state = {
        "source_inputs": [
            {
                "title": "人工提供的新闻",
                "content": "这是一段足够长的人工新闻素材，用来验证手动输入可以直接进入发现结果。",
                "source": "manual",
                "type": "manual_note",
            }
        ],
        "logs": [],
        "errors": [],
    }

    result = run(
        state,
        FetchConfig(
            enabled_sources=["__manual_only__"],
            quality=1,
            freshness=1,
            min_relevance=1,
            prefer_original=False,
        ),
    )

    assert result["fetch_contents"][0]["title"] == "人工提供的新闻"
    assert result["discover_meta"]["manual_input_errors"] == []


def test_manual_input_failure_is_preserved_without_faking_content() -> None:
    with patch("nodes.fetch.manual_inputs.fetch_manual_url", side_effect=ValueError("链接不可读取")):
        items, errors = collect_manual_inputs([{"url": "https://example.com/article"}])

    assert items == []
    assert errors == [{"input": "https://example.com/article", "message": "链接不可读取"}]


def test_manual_url_rejects_private_addresses() -> None:
    with pytest.raises(ValueError, match="本机或内网"):
        fetch_manual_url("http://127.0.0.1/private")


def test_manual_url_extracts_readable_html() -> None:
    response = Mock()
    response.url = "https://example.com/story"
    response.status_code = 200
    response.encoding = "utf-8"
    response.headers = {"content-type": "text/html; charset=utf-8"}
    response.raise_for_status.return_value = None
    response.iter_content.return_value = [
        "<html><head><title>示例标题</title><style>隐藏</style></head>"
        "<body><article>第一段正文。第二段正文。</article></body></html>".encode()
    ]

    with patch("nodes.fetch.manual_inputs._assert_public_http_url"), patch(
        "nodes.fetch.manual_inputs.requests.get", return_value=response
    ):
        item = fetch_manual_url("https://example.com/story")

    assert item["title"] == "示例标题"
    assert item["content"] == "第一段正文。第二段正文。"
    assert "隐藏" not in item["content"]


def test_manual_url_revalidates_redirect_target() -> None:
    response = Mock()
    response.status_code = 302
    response.headers = {"location": "http://127.0.0.1/private"}

    with patch(
        "nodes.fetch.manual_inputs._assert_public_http_url",
        side_effect=[None, ValueError("链接指向本机或内网地址，已拒绝读取")],
    ) as validate_url, patch(
        "nodes.fetch.manual_inputs.requests.get",
        return_value=response,
    ) as request:
        with pytest.raises(ValueError, match="本机或内网"):
            fetch_manual_url("https://example.com/redirect")

    assert validate_url.call_count == 2
    request.assert_called_once()
    response.close.assert_called_once()


def test_manual_url_closes_failed_response() -> None:
    response = Mock()
    response.url = "https://example.com/error"
    response.status_code = 500
    response.headers = {"content-type": "text/html"}
    response.raise_for_status.side_effect = requests.HTTPError("500 Server Error")

    with patch("nodes.fetch.manual_inputs._assert_public_http_url"), patch(
        "nodes.fetch.manual_inputs.requests.get",
        return_value=response,
    ):
        with pytest.raises(requests.HTTPError):
            fetch_manual_url("https://example.com/error")

    response.close.assert_called_once()
