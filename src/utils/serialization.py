"""
Stable Serialization Module

提供稳定的序列化方法，确保相同输入产生相同的哈希值。

功能：
- 稳定的JSON序列化（键排序）
- 对象哈希计算
- 缓存键生成

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional, Union


def stable_json_dumps(obj: Any, **kwargs) -> str:
    """
    稳定的JSON序列化
    
    Args:
        obj: 要序列化的对象
        **kwargs: json.dumps的额外参数
        
    Returns:
        JSON字符串
    """
    # 确保键排序，不包含空白
    return json.dumps(
        obj,
        sort_keys=True,
        ensure_ascii=False,
        separators=(',', ':'),
        **kwargs
    )


def compute_hash(data: Union[str, bytes, Dict, List], algorithm: str = "sha256") -> str:
    """
    计算数据哈希
    
    Args:
        data: 数据（字符串、字节或可序列化对象）
        algorithm: 哈希算法（sha256/md5）
        
    Returns:
        十六进制哈希字符串
    """
    if isinstance(data, (dict, list)):
        # 序列化为JSON
        data = stable_json_dumps(data)
    
    if isinstance(data, str):
        data = data.encode('utf-8')
    
    if algorithm == "sha256":
        hasher = hashlib.sha256()
    elif algorithm == "md5":
        hasher = hashlib.md5()
    else:
        raise ValueError(f"Unsupported hash algorithm: {algorithm}")
    
    hasher.update(data)
    return hasher.hexdigest()


def create_cache_key(
    prefix: str,
    payload: Dict[str, Any],
    *,
    version: str = "v1",
    include_fields: Optional[List[str]] = None,
) -> str:
    """
    创建缓存键
    
    Args:
        prefix: 键前缀（如 "metaso", "llm", "tts"）
        payload: 请求负载
        version: 版本号
        include_fields: 只包含指定字段（None表示全部）
        
    Returns:
        缓存键
    """
    # 过滤字段
    if include_fields:
        filtered_payload = {k: v for k, v in payload.items() if k in include_fields}
    else:
        filtered_payload = payload
    
    # 计算哈希
    payload_hash = compute_hash(filtered_payload)
    
    # 组合缓存键
    cache_key = f"{prefix}:{version}:{payload_hash}"
    
    return cache_key


def normalize_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    规范化请求负载（移除不影响结果的字段）
    
    Args:
        payload: 原始负载
        
    Returns:
        规范化后的负载
    """
    # 移除常见的不稳定字段
    exclude_fields = {
        'timestamp',
        'request_id',
        'trace_id',
        'user_id',
        'session_id',
    }
    
    normalized = {
        k: v for k, v in payload.items()
        if k not in exclude_fields
    }
    
    return normalized


def serialize_for_cache(obj: Any) -> bytes:
    """
    序列化对象用于缓存存储
    
    Args:
        obj: 对象
        
    Returns:
        字节数据
    """
    json_str = stable_json_dumps(obj)
    return json_str.encode('utf-8')


def deserialize_from_cache(data: bytes) -> Any:
    """
    从缓存反序列化对象
    
    Args:
        data: 字节数据
        
    Returns:
        对象
    """
    json_str = data.decode('utf-8')
    return json.loads(json_str)


__all__ = [
    "stable_json_dumps",
    "compute_hash",
    "create_cache_key",
    "normalize_payload",
    "serialize_for_cache",
    "deserialize_from_cache",
]
