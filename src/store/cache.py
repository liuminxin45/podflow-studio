"""
Enhanced caching layer for expensive operations (Metaso/LLM/TTS).

强制规范：
1. build payload
2. stable serialize
3. hash → cache key
4. cache lookup
5. miss 才请求

This version uses JSON files under ``.cache`` by default; later we can
swap in SQLite or Redis without changing call sites.

作者：Auto-Podcast Team
版本：2.0.0
更新：2025-12-26
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from src.utils.metrics import get_metrics
from src.utils.serialization import serialize_for_cache, deserialize_from_cache

DEFAULT_CACHE_DIR = Path(".cache")


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


@dataclass
class CacheEntry:
    """缓存条目（带元数据）"""
    value: Any
    created_at: float = field(default_factory=time.time)
    accessed_at: float = field(default_factory=time.time)
    hit_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "value": self.value,
            "created_at": self.created_at,
            "accessed_at": self.accessed_at,
            "hit_count": self.hit_count,
            "metadata": self.metadata,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> CacheEntry:
        return cls(
            value=data["value"],
            created_at=data.get("created_at", time.time()),
            accessed_at=data.get("accessed_at", time.time()),
            hit_count=data.get("hit_count", 0),
            metadata=data.get("metadata", {}),
        )


@dataclass
class CacheStore:
    base_dir: Path = DEFAULT_CACHE_DIR
    enable_metrics: bool = True

    def __post_init__(self) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.logger = logging.getLogger("cache")

    def _path_for(self, key: str) -> Path:
        hashed = _hash_key(key)
        return self.base_dir / f"{hashed[:2]}" / f"{hashed}.json"

    def get(self, key: str) -> Any | None:
        """获取缓存值"""
        path = self._path_for(key)
        if not path.exists():
            if self.enable_metrics:
                get_metrics().increment("cache.miss", tags={"key_prefix": key.split(":")[0]})
            return None
        
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            entry = CacheEntry.from_dict(data)
            
            # 更新访问信息
            entry.accessed_at = time.time()
            entry.hit_count += 1
            self._save_entry(path, entry)
            
            if self.enable_metrics:
                get_metrics().increment("cache.hit", tags={"key_prefix": key.split(":")[0]})
            
            self.logger.debug(f"Cache hit: {key[:50]}... (hits: {entry.hit_count})")
            return entry.value
        except Exception as e:
            self.logger.warning(f"Cache read error: {e}")
            return None

    def set(self, key: str, value: Any, metadata: Optional[Dict[str, Any]] = None) -> None:
        """设置缓存值"""
        path = self._path_for(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        
        entry = CacheEntry(
            value=value,
            metadata=metadata or {},
        )
        
        self._save_entry(path, entry)
        
        if self.enable_metrics:
            get_metrics().increment("cache.set", tags={"key_prefix": key.split(":")[0]})
        
        self.logger.debug(f"Cache set: {key[:50]}...")
    
    def _save_entry(self, path: Path, entry: CacheEntry) -> None:
        """保存缓存条目"""
        path.write_text(
            json.dumps(entry.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
    
    def exists(self, key: str) -> bool:
        """检查缓存是否存在"""
        return self._path_for(key).exists()
    
    def delete(self, key: str) -> bool:
        """删除缓存"""
        path = self._path_for(key)
        if path.exists():
            path.unlink()
            return True
        return False
    
    def clear_all(self) -> int:
        """清空所有缓存"""
        count = 0
        for path in self.base_dir.rglob("*.json"):
            path.unlink()
            count += 1
        return count
    
    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计"""
        total_files = sum(1 for _ in self.base_dir.rglob("*.json"))
        total_size = sum(p.stat().st_size for p in self.base_dir.rglob("*.json"))
        
        return {
            "total_entries": total_files,
            "total_size_bytes": total_size,
            "total_size_mb": total_size / (1024 * 1024),
            "cache_dir": str(self.base_dir),
        }


def cached_call(
    cache_key: str,
    fetch_fn: Callable[[], Any],
    *,
    cache_store: Optional[CacheStore] = None,
    force_refresh: bool = False,
    metadata: Optional[Dict[str, Any]] = None,
) -> tuple[Any, bool]:
    """
    缓存包装函数
    
    Args:
        cache_key: 缓存键
        fetch_fn: 获取数据的函数
        cache_store: 缓存存储（None使用全局）
        force_refresh: 强制刷新
        metadata: 缓存元数据
        
    Returns:
        (result, is_cache_hit)
    """
    if cache_store is None:
        cache_store = get_cache_store()
    
    # 检查缓存
    if not force_refresh:
        cached_value = cache_store.get(cache_key)
        if cached_value is not None:
            return cached_value, True
    
    # 缓存未命中，调用函数
    result = fetch_fn()
    
    # 保存到缓存
    cache_store.set(cache_key, result, metadata=metadata)
    
    return result, False


# 全局缓存实例
_global_cache = CacheStore()


def get_cache_store() -> CacheStore:
    """获取全局缓存存储"""
    return _global_cache


cache_store = _global_cache  # 向后兼容


__all__ = [
    "CacheEntry",
    "CacheStore",
    "cached_call",
    "get_cache_store",
    "cache_store",
]
