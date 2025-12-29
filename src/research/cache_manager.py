"""
Cache Manager for Research Results

支持TTL、版本控制、去重
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, Optional

from pydantic import BaseModel


class CacheEntry(BaseModel):
    """缓存条目"""
    key: str
    value: Any
    version: str = "v1"
    created_at: float
    ttl_seconds: int
    hit_count: int = 0


class CacheManager:
    """缓存管理器"""
    
    def __init__(self, cache_dir: str = ".cache/research", default_ttl: int = 86400):
        """
        初始化缓存管理器
        
        Args:
            cache_dir: 缓存目录
            default_ttl: 默认TTL（秒）
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.default_ttl = default_ttl
        self.logger = logging.getLogger("research.cache")
        
        # 内存缓存（热数据）
        self._memory_cache: Dict[str, CacheEntry] = {}
    
    def _make_key(self, query: str, source: str = "anspire") -> str:
        """生成缓存key"""
        raw = f"{source}:{query}"
        return hashlib.md5(raw.encode()).hexdigest()
    
    def _get_cache_path(self, key: str) -> Path:
        """获取缓存文件路径"""
        # 使用两级目录避免单目录文件过多
        return self.cache_dir / key[:2] / f"{key}.json"
    
    def get(self, query: str, source: str = "anspire") -> Optional[Any]:
        """
        获取缓存
        
        Args:
            query: 查询文本
            source: 来源
            
        Returns:
            缓存值，如果未命中或过期则返回None
        """
        key = self._make_key(query, source)
        
        # 先查内存缓存
        if key in self._memory_cache:
            entry = self._memory_cache[key]
            if self._is_valid(entry):
                entry.hit_count += 1
                self.logger.debug(f"Memory cache hit: {key[:8]}")
                return entry.value
            else:
                del self._memory_cache[key]
        
        # 查磁盘缓存
        cache_path = self._get_cache_path(key)
        if not cache_path.exists():
            return None
        
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            entry = CacheEntry(**data)
            
            if not self._is_valid(entry):
                cache_path.unlink(missing_ok=True)
                return None
            
            # 加载到内存缓存
            entry.hit_count += 1
            self._memory_cache[key] = entry
            
            self.logger.debug(f"Disk cache hit: {key[:8]}")
            return entry.value
            
        except Exception as e:
            self.logger.warning(f"Failed to load cache {key[:8]}: {e}")
            cache_path.unlink(missing_ok=True)
            return None
    
    def set(self, query: str, value: Any, source: str = "anspire", 
            ttl: Optional[int] = None, version: str = "v1") -> None:
        """
        设置缓存
        
        Args:
            query: 查询文本
            value: 缓存值
            source: 来源
            ttl: TTL（秒），None则使用默认值
            version: 版本号
        """
        key = self._make_key(query, source)
        ttl = ttl or self.default_ttl
        
        entry = CacheEntry(
            key=key,
            value=value,
            version=version,
            created_at=time.time(),
            ttl_seconds=ttl,
            hit_count=0
        )
        
        # 写入内存缓存
        self._memory_cache[key] = entry
        
        # 写入磁盘缓存
        cache_path = self._get_cache_path(key)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(entry.model_dump(), f, ensure_ascii=False, indent=2)
            
            self.logger.debug(f"Cache set: {key[:8]}")
        except Exception as e:
            self.logger.error(f"Failed to write cache {key[:8]}: {e}")
    
    def _is_valid(self, entry: CacheEntry) -> bool:
        """检查缓存是否有效"""
        age = time.time() - entry.created_at
        return age < entry.ttl_seconds
    
    def clear_expired(self) -> int:
        """清理过期缓存"""
        count = 0
        
        # 清理内存缓存
        expired_keys = [
            k for k, v in self._memory_cache.items()
            if not self._is_valid(v)
        ]
        for k in expired_keys:
            del self._memory_cache[k]
            count += 1
        
        # 清理磁盘缓存
        for cache_file in self.cache_dir.rglob("*.json"):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                entry = CacheEntry(**data)
                
                if not self._is_valid(entry):
                    cache_file.unlink()
                    count += 1
            except Exception:
                cache_file.unlink(missing_ok=True)
                count += 1
        
        self.logger.info(f"Cleared {count} expired cache entries")
        return count
    
    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计"""
        total_entries = len(self._memory_cache)
        total_hits = sum(e.hit_count for e in self._memory_cache.values())
        
        disk_entries = len(list(self.cache_dir.rglob("*.json")))
        
        return {
            "memory_entries": total_entries,
            "disk_entries": disk_entries,
            "total_hits": total_hits,
            "cache_dir": str(self.cache_dir)
        }


__all__ = ["CacheManager", "CacheEntry"]
