from protocol.rss_validator import validate_rss_feed


def test_rss_validator_accepts_local_preview_relative_enclosure():
    rss = _rss("dist/episodes/demo/final.mp3", length="1234")
    result = validate_rss_feed(rss, public_base_url="", expected_enclosure_url="dist/episodes/demo/final.mp3")
    assert result["ok"] is True
    assert result["local_preview_only"] is True
    assert result["warnings"]


def test_rss_validator_rejects_absolute_local_enclosure():
    rss = _rss("E:\\Neo\\auto-podcast\\final.mp3", length="1234")
    result = validate_rss_feed(rss)
    assert result["ok"] is False
    assert any("absolute local path" in err for err in result["errors"])


def test_rss_validator_requires_public_base_url_prefix():
    rss = _rss("https://cdn.example.com/episodes/demo/final.mp3", length="1234")
    result = validate_rss_feed(rss, public_base_url="https://podcast.example.com")
    assert result["ok"] is False
    assert any("public_base_url" in err for err in result["errors"])


def _rss(enclosure_url: str, *, length: str = "1234") -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>通勤早咖啡</title>
    <description>demo</description>
    <language>zh-CN</language>
    <item>
      <guid>demo</guid>
      <title>demo</title>
      <description>demo</description>
      <pubDate>Wed, 01 Jul 2026 00:00:00 +0000</pubDate>
      <enclosure url="{enclosure_url}" length="{length}" type="audio/mpeg"/>
    </item>
  </channel>
</rss>"""
