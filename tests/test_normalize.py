"""
Unit tests for src/fetch/normalize.py
"""

from __future__ import annotations

from src.fetch.normalize import normalize_item, prepare_items, _domain_from_url
from src.fetch.extractor import ExtractResult
from src.fetch.source_guard import SourceGuard


def test_domain_from_url():
    assert _domain_from_url("https://example.com/path") == "example.com"
    assert _domain_from_url("https://www.example.com/path") == "example.com"
    assert _domain_from_url("http://news.example.com/article") == "news.example.com"
    assert _domain_from_url("") == ""
    assert _domain_from_url(None) == ""


def test_normalize_item_basic():
    raw = {
        "url": "https://example.com/news/1",
        "title": "Test Title",
        "summary": "Test summary",
        "content": "Test content body",
        "published_at": "2025-12-26T10:00:00Z",
    }
    
    result = normalize_item(raw)
    
    assert result["title"] == "Test Title"
    assert result["summary"] == "Test summary"
    assert result["content"] == "Test content body"
    assert result["source_domain"] == "example.com"
    assert result["published_at"] is not None
    assert "2025-12-26" in result["published_at"]
    assert "id" in result
    assert "fingerprints" in result
    assert "content_sha256" in result["fingerprints"]
    assert "simhash" in result["fingerprints"]


def test_normalize_item_with_extractor():
    raw = {
        "url": "https://example.com/news/2",
        "title": "Raw Title",
        "summary": "",
        "content": "",
    }
    
    extractor_result = ExtractResult(
        text="Extracted content from webpage",
        title="Extracted Title",
        summary="Extracted summary",
        metadata={"language": "zh"},
    )
    
    result = normalize_item(raw, extractor_result=extractor_result)
    
    assert result["title"] == "Extracted Title"
    assert result["summary"] == "Extracted summary"
    assert result["content"] == "Extracted content from webpage"
    assert result["lang"] == "zh"
    assert result["quality"]["extractor"] == "trafilatura"


def test_normalize_item_with_source_profile():
    raw = {
        "url": "https://news.example.com/article",
        "title": "Article",
        "content": "Content",
    }
    
    source_profile = {
        "domain": "example.com",
        "name": "Example News",
        "license": "allowed",
        "source_type": "news",
    }
    
    result = normalize_item(raw, source_profile=source_profile)
    
    assert result["source_name"] == "Example News"
    assert result["source_domain"] == "example.com"
    assert result["meta"]["source_profile"]["license"] == "allowed"


def test_prepare_items_with_source_guard(tmp_path):
    config_dir = tmp_path / "sources"
    config_dir.mkdir()
    
    config_file = config_dir / "test.yaml"
    config_file.write_text("""
sources:
  - domain: "blocked.com"
    license: "forbidden"
    crawl_allowed: false
  - domain: "allowed.com"
    license: "allowed"
    crawl_allowed: true
""")
    
    source_guard = SourceGuard(config_dir=config_dir)
    
    raw_items = [
        {"url": "https://allowed.com/news/1", "title": "Allowed", "content": "Content 1"},
        {"url": "https://blocked.com/news/2", "title": "Blocked", "content": "Content 2"},
        {"url": "https://unknown.com/news/3", "title": "Unknown", "content": "Content 3"},
    ]
    
    normalized, blocked = prepare_items(raw_items, source_guard=source_guard)
    
    assert len(normalized) == 2
    assert len(blocked) == 1
    assert blocked[0]["title"] == "Blocked"
    assert not blocked[0]["_source_guard"]["allowed"]


def test_prepare_items_with_min_content_length(tmp_path):
    config_dir = tmp_path / "sources"
    config_dir.mkdir()
    
    source_guard = SourceGuard(config_dir=config_dir)
    
    def mock_extractor(url: str) -> ExtractResult:
        return ExtractResult(
            text="Extracted long content for short item",
            title="Extracted Title",
        )
    
    raw_items = [
        {"url": "https://example.com/1", "title": "Short", "content": "Short"},
        {"url": "https://example.com/2", "title": "Long", "content": "A" * 200},
    ]
    
    normalized, blocked = prepare_items(
        raw_items,
        source_guard=source_guard,
        min_content_length=100,
        extractor_fetch=mock_extractor,
    )
    
    assert len(normalized) == 2
    assert "Extracted long content" in normalized[0]["content"]
    assert normalized[1]["content"] == "A" * 200


def test_normalize_item_fallback_title():
    raw = {
        "url": "https://example.com/news",
        "content": "Content without title",
    }
    
    result = normalize_item(raw)
    
    assert result["title"] == "Untitled"


def test_normalize_item_id_generation():
    raw1 = {
        "url": "https://example.com/news/1",
        "title": "Same Title",
        "content": "Same Content",
    }
    
    raw2 = {
        "url": "https://example.com/news/2",
        "title": "Same Title",
        "content": "Same Content",
    }
    
    result1 = normalize_item(raw1)
    result2 = normalize_item(raw2)
    
    assert result1["id"] != result2["id"]
