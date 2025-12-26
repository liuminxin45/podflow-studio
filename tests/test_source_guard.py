"""
Unit tests for src/fetch/source_guard.py
"""

from __future__ import annotations

from pathlib import Path
from src.fetch.source_guard import SourceGuard, SourcePolicy


def test_source_policy_allowed():
    policy = SourcePolicy(
        domain="example.com",
        license="allowed",
        crawl_allowed=True,
    )
    assert policy.allowed is True
    
    policy2 = SourcePolicy(
        domain="blocked.com",
        license="forbidden",
        crawl_allowed=False,
    )
    assert policy2.allowed is False
    
    policy3 = SourcePolicy(
        domain="partial.com",
        license="allowed",
        crawl_allowed=False,
    )
    assert policy3.allowed is False


def test_source_guard_load_yaml(tmp_path):
    config_dir = tmp_path / "sources"
    config_dir.mkdir()
    
    config_file = config_dir / "test.yaml"
    config_file.write_text("""
sources:
  - domain: "example.com"
    license: "allowed"
    crawl_allowed: true
    source_type: "news"
    notes: "Test domain"
  
  - domain: "forbidden.com"
    license: "forbidden"
    crawl_allowed: false
    source_type: "unknown"
""")
    
    guard = SourceGuard(config_dir=config_dir)
    
    assert len(guard._policies) == 2
    assert "example.com" in guard._policies
    assert "forbidden.com" in guard._policies
    
    policy = guard._policies["example.com"]
    assert policy.license == "allowed"
    assert policy.crawl_allowed is True
    assert policy.source_type == "news"


def test_source_guard_lookup_exact():
    guard = SourceGuard(config_dir=None)
    guard._policies["example.com"] = SourcePolicy(
        domain="example.com",
        license="allowed",
        crawl_allowed=True,
    )
    
    policy = guard.lookup("example.com")
    assert policy is not None
    assert policy.domain == "example.com"
    
    policy2 = guard.lookup("https://example.com/path")
    assert policy2 is not None
    assert policy2.domain == "example.com"


def test_source_guard_lookup_subdomain():
    guard = SourceGuard(config_dir=None)
    guard._policies["example.com"] = SourcePolicy(
        domain="example.com",
        license="allowed",
        crawl_allowed=True,
    )
    
    policy = guard.lookup("news.example.com")
    assert policy is not None
    assert policy.domain == "example.com"
    
    policy2 = guard.lookup("https://api.example.com/data")
    assert policy2 is not None
    assert policy2.domain == "example.com"


def test_source_guard_lookup_not_found():
    guard = SourceGuard(config_dir=None)
    guard._policies["example.com"] = SourcePolicy(
        domain="example.com",
        license="allowed",
        crawl_allowed=True,
    )
    
    policy = guard.lookup("other.com")
    assert policy is None


def test_source_guard_check_allowed():
    guard = SourceGuard(config_dir=None)
    guard._policies["example.com"] = SourcePolicy(
        domain="example.com",
        license="allowed",
        crawl_allowed=True,
        source_type="news",
    )
    
    result = guard.check(url="https://example.com/article")
    
    assert result["domain"] == "example.com"
    assert result["allowed"] is True
    assert result["reason"] == []
    assert result["policy"]["license"] == "allowed"
    assert result["policy"]["source_type"] == "news"


def test_source_guard_check_blocked():
    guard = SourceGuard(config_dir=None)
    guard._policies["blocked.com"] = SourcePolicy(
        domain="blocked.com",
        license="forbidden",
        crawl_allowed=False,
    )
    
    result = guard.check(url="https://blocked.com/article")
    
    assert result["domain"] == "blocked.com"
    assert result["allowed"] is False
    assert "crawl_not_allowed" in result["reason"]
    assert "license:forbidden" in result["reason"]


def test_source_guard_check_unknown_domain():
    guard = SourceGuard(config_dir=None)
    
    result = guard.check(url="https://unknown.com/article")
    
    assert result["domain"] == "unknown.com"
    assert result["allowed"] is True
    assert result["reason"] == []
    assert result["policy"]["license"] == "unknown"
    assert result["policy"]["crawl_allowed"] is True


def test_source_guard_domain_from_url():
    assert SourceGuard._domain_from_url("https://example.com/path") == "example.com"
    assert SourceGuard._domain_from_url("https://www.example.com/path") == "example.com"
    assert SourceGuard._domain_from_url("http://news.example.com") == "news.example.com"
    assert SourceGuard._domain_from_url("") == ""
    assert SourceGuard._domain_from_url(None) == ""


def test_source_guard_multiple_yaml_files(tmp_path):
    config_dir = tmp_path / "sources"
    config_dir.mkdir()
    
    (config_dir / "news.yaml").write_text("""
sources:
  - domain: "news1.com"
    license: "allowed"
    crawl_allowed: true
""")
    
    (config_dir / "blogs.yml").write_text("""
sources:
  - domain: "blog1.com"
    license: "allowed"
    crawl_allowed: true
""")
    
    guard = SourceGuard(config_dir=config_dir)
    
    assert len(guard._policies) == 2
    assert "news1.com" in guard._policies
    assert "blog1.com" in guard._policies


def test_source_policy_to_dict():
    policy = SourcePolicy(
        domain="example.com",
        license="allowed",
        crawl_allowed=True,
        source_type="news",
        notes="Test notes",
        extra={"custom_field": "custom_value"},
    )
    
    data = policy.to_dict()
    
    assert data["domain"] == "example.com"
    assert data["license"] == "allowed"
    assert data["crawl_allowed"] is True
    assert data["source_type"] == "news"
    assert data["notes"] == "Test notes"
    assert data["custom_field"] == "custom_value"


def test_source_guard_check_with_domain_param():
    guard = SourceGuard(config_dir=None)
    guard._policies["example.com"] = SourcePolicy(
        domain="example.com",
        license="allowed",
        crawl_allowed=True,
    )
    
    result = guard.check(domain="example.com")
    
    assert result["domain"] == "example.com"
    assert result["allowed"] is True
