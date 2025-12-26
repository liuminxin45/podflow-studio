"""
Unit tests for src/store/cache.py
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from src.store.cache import CacheStore, CacheEntry, cached_call


def test_cache_store_basic():
    with tempfile.TemporaryDirectory() as tmpdir:
        cache = CacheStore(base_dir=Path(tmpdir))
        
        # Set and get
        cache.set("test_key", {"data": "value"})
        result = cache.get("test_key")
        
        assert result == {"data": "value"}


def test_cache_store_miss():
    with tempfile.TemporaryDirectory() as tmpdir:
        cache = CacheStore(base_dir=Path(tmpdir))
        
        result = cache.get("nonexistent_key")
        
        assert result is None


def test_cache_store_with_metadata():
    with tempfile.TemporaryDirectory() as tmpdir:
        cache = CacheStore(base_dir=Path(tmpdir))
        
        cache.set("test_key", "value", metadata={"source": "test"})
        result = cache.get("test_key")
        
        assert result == "value"


def test_cache_entry_hit_count():
    with tempfile.TemporaryDirectory() as tmpdir:
        cache = CacheStore(base_dir=Path(tmpdir))
        
        cache.set("test_key", "value")
        
        # Multiple gets should increment hit count
        cache.get("test_key")
        cache.get("test_key")
        result = cache.get("test_key")
        
        assert result == "value"


def test_cache_store_exists():
    with tempfile.TemporaryDirectory() as tmpdir:
        cache = CacheStore(base_dir=Path(tmpdir))
        
        assert not cache.exists("test_key")
        
        cache.set("test_key", "value")
        
        assert cache.exists("test_key")


def test_cache_store_delete():
    with tempfile.TemporaryDirectory() as tmpdir:
        cache = CacheStore(base_dir=Path(tmpdir))
        
        cache.set("test_key", "value")
        assert cache.exists("test_key")
        
        deleted = cache.delete("test_key")
        
        assert deleted is True
        assert not cache.exists("test_key")


def test_cache_store_stats():
    with tempfile.TemporaryDirectory() as tmpdir:
        cache = CacheStore(base_dir=Path(tmpdir))
        
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        
        stats = cache.get_stats()
        
        assert stats["total_entries"] == 2
        assert stats["total_size_bytes"] > 0


def test_cached_call_miss():
    with tempfile.TemporaryDirectory() as tmpdir:
        cache = CacheStore(base_dir=Path(tmpdir))
        
        call_count = 0
        
        def fetch_fn():
            nonlocal call_count
            call_count += 1
            return {"result": "data"}
        
        result, is_hit = cached_call("test_key", fetch_fn, cache_store=cache)
        
        assert result == {"result": "data"}
        assert is_hit is False
        assert call_count == 1


def test_cached_call_hit():
    with tempfile.TemporaryDirectory() as tmpdir:
        cache = CacheStore(base_dir=Path(tmpdir))
        
        call_count = 0
        
        def fetch_fn():
            nonlocal call_count
            call_count += 1
            return {"result": "data"}
        
        # First call - miss
        cached_call("test_key", fetch_fn, cache_store=cache)
        
        # Second call - hit
        result, is_hit = cached_call("test_key", fetch_fn, cache_store=cache)
        
        assert result == {"result": "data"}
        assert is_hit is True
        assert call_count == 1  # Function only called once


def test_cached_call_force_refresh():
    with tempfile.TemporaryDirectory() as tmpdir:
        cache = CacheStore(base_dir=Path(tmpdir))
        
        call_count = 0
        
        def fetch_fn():
            nonlocal call_count
            call_count += 1
            return {"result": f"data_{call_count}"}
        
        # First call
        cached_call("test_key", fetch_fn, cache_store=cache)
        
        # Force refresh
        result, is_hit = cached_call("test_key", fetch_fn, cache_store=cache, force_refresh=True)
        
        assert result == {"result": "data_2"}
        assert is_hit is False
        assert call_count == 2


def test_cache_entry_to_dict():
    entry = CacheEntry(
        value={"test": "data"},
        hit_count=5,
        metadata={"source": "test"},
    )
    
    data = entry.to_dict()
    
    assert data["value"] == {"test": "data"}
    assert data["hit_count"] == 5
    assert data["metadata"]["source"] == "test"


def test_cache_entry_from_dict():
    data = {
        "value": {"test": "data"},
        "created_at": 1234567890.0,
        "accessed_at": 1234567900.0,
        "hit_count": 3,
        "metadata": {"key": "value"},
    }
    
    entry = CacheEntry.from_dict(data)
    
    assert entry.value == {"test": "data"}
    assert entry.hit_count == 3
    assert entry.metadata["key"] == "value"


def test_cache_store_clear_all():
    with tempfile.TemporaryDirectory() as tmpdir:
        cache = CacheStore(base_dir=Path(tmpdir))
        
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")
        
        count = cache.clear_all()
        
        assert count == 3
        assert not cache.exists("key1")
        assert not cache.exists("key2")
        assert not cache.exists("key3")
