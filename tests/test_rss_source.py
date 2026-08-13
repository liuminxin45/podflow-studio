"""Unit tests for the key-free RSS source HTML cleaning and URL resolution."""

from nodes.fetch.sources.rss import _strip_html, _resolve_urls, RSSSource


class _Cfg:
    def __init__(self, rss_urls):
        self.rss_urls = rss_urls


def test_strip_html_removes_tags_and_keeps_text():
    assert _strip_html('<p>你好 <a href="https://x.com">链接</a> 世界</p>') == "你好 链接 世界"


def test_strip_html_splits_block_tags_into_spaces():
    assert _strip_html("<p>a</p><p>b</p>") == "a b"
    assert _strip_html("<div>多<br>行</div>测试") == "多 行 测试"


def test_strip_html_unescapes_entities():
    assert _strip_html("IT之家 &amp; 科技 &lt;news&gt;") == "IT之家 & 科技 <news>"


def test_strip_html_plain_text_passthrough():
    assert _strip_html("plain text 无需处理") == "plain text 无需处理"


def test_strip_html_collapses_whitespace_and_empty():
    assert _strip_html("  多   个\n\n空格  ") == "多 个 空格"
    assert _strip_html("") == ""
    assert _strip_html("<p></p>") == ""


def test_resolve_urls_prefers_config():
    cfg = _Cfg(["https://a.example/rss", "https://b.example/rss"])
    assert _resolve_urls(cfg) == ["https://a.example/rss", "https://b.example/rss"]


def test_resolve_urls_falls_back_to_default_when_empty():
    urls = _resolve_urls(_Cfg([]))
    assert urls and all(u.startswith("http") for u in urls)


def test_rss_source_metadata():
    src = RSSSource()
    assert src.name
    assert src.description
