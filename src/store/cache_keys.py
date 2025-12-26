"""
Cache Keys Module

定义各种外部API调用的缓存键生成规则。

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

from typing import Any, Dict, List

from src.utils.serialization import create_cache_key, normalize_payload


def metaso_cache_key(query: str, max_results: int = 10, **kwargs) -> str:
    """
    生成MetaSo API调用的缓存键
    
    Args:
        query: 查询文本
        max_results: 最大结果数
        **kwargs: 其他参数
        
    Returns:
        缓存键
    """
    payload = {
        "query": query,
        "max_results": max_results,
        **kwargs
    }
    
    # 规范化负载
    normalized = normalize_payload(payload)
    
    return create_cache_key("metaso", normalized, version="v1")


def llm_cache_key(
    prompt: str,
    model: str,
    temperature: float = 0.7,
    max_tokens: int = 1000,
    **kwargs
) -> str:
    """
    生成LLM API调用的缓存键
    
    Args:
        prompt: 提示词
        model: 模型名称
        temperature: 温度参数
        max_tokens: 最大token数
        **kwargs: 其他参数
        
    Returns:
        缓存键
    """
    payload = {
        "prompt": prompt,
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        **kwargs
    }
    
    normalized = normalize_payload(payload)
    
    return create_cache_key("llm", normalized, version="v1")


def tts_cache_key(
    text: str,
    voice: str,
    speed: float = 1.0,
    **kwargs
) -> str:
    """
    生成TTS API调用的缓存键
    
    Args:
        text: 文本内容
        voice: 语音ID
        speed: 语速
        **kwargs: 其他参数
        
    Returns:
        缓存键
    """
    payload = {
        "text": text,
        "voice": voice,
        "speed": speed,
        **kwargs
    }
    
    normalized = normalize_payload(payload)
    
    return create_cache_key("tts", normalized, version="v1")


def research_cache_key(
    items: List[Dict[str, Any]],
    max_items: int = 10,
    **kwargs
) -> str:
    """
    生成Research API调用的缓存键
    
    Args:
        items: 新闻条目列表
        max_items: 最大条目数
        **kwargs: 其他参数
        
    Returns:
        缓存键
    """
    # 只使用条目ID和关键字段
    item_keys = [
        {
            "id": item.get("id"),
            "title": item.get("title"),
            "url": item.get("url"),
        }
        for item in items[:max_items]
    ]
    
    payload = {
        "items": item_keys,
        "max_items": max_items,
        **kwargs
    }
    
    normalized = normalize_payload(payload)
    
    return create_cache_key("research", normalized, version="v1")


__all__ = [
    "metaso_cache_key",
    "llm_cache_key",
    "tts_cache_key",
    "research_cache_key",
]
