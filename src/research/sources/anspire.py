"""
Anspire Research Module

这个文件实现了Anspire研究服务的数据获取和处理功能。

功能概述：
- Anspire Search Agent API数据获取
- 研究内容解析和清洗
- 数据标准化处理
- 研究结果整合

主要函数：
- anspire_research_items(): 获取Anspire数据
- _build_prompt(): 构建研究提示词
- _parse_response(): 解析响应数据

研究特性：
- 多源数据整合
- 智能内容分析
- 结构化数据输出
- 实时数据更新
- 支持流式和JSON两种输出格式

使用示例：
    research_data = anspire_research_items(
        items=[{"title": "...", "url": "...", "source": "..."}],
        timeout_seconds=60,
        top_k=5,
        is_stream=False
    )

应用场景：
- 深度研究分析
- 背景资料收集
- 内容增强处理
- 知识图谱构建

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-29
"""

from __future__ import annotations

import logging
import os
import urllib.parse
from typing import Any

import requests


def _build_prompt(items: list[dict], max_items: int = 10) -> str:
    """
    构建Anspire研究提示词
    
    Args:
        items: 新闻条目列表
        max_items: 最多处理多少条
        
    Returns:
        str: 构建好的提示词
    """
    max_items2 = max(0, int(max_items))
    
    # 对于Anspire，使用更简洁的查询方式
    # 直接提取标题和关键内容作为查询关键词
    if not items:
        return ""
    
    # 只使用第一条新闻的标题和简短内容作为查询
    first_item = items[0] if isinstance(items[0], dict) else {}
    title = (first_item.get("title") or "").strip()
    content = (first_item.get("content") or "").strip()
    
    if not title:
        return content[:200] if content else ""
    
    # 构建简洁的查询：标题 + 简短内容摘要
    query_parts = [title]
    
    if content and content != title:
        # 只取内容的前100个字符作为补充
        content_snippet = content[:100]
        if len(content) > 100:
            content_snippet += "..."
        query_parts.append(content_snippet)
    
    return " ".join(query_parts)


def _parse_response(response_data: Any, is_stream: bool) -> tuple[str | None, dict | None]:
    """
    解析Anspire API响应
    
    Args:
        response_data: 响应数据
        is_stream: 是否为流式响应
        
    Returns:
        tuple: (文本内容, JSON数据)
    """
    if is_stream:
        # 流式响应返回的是文本
        if isinstance(response_data, str):
            return response_data, None
        return str(response_data), None
    else:
        # JSON响应
        if isinstance(response_data, dict):
            # 提取data字段中的内容
            data = response_data.get("data", {})
            # 尝试获取文本内容
            content = data.get("answer") or data.get("content") or str(data)
            return content, response_data
        return str(response_data), None


def anspire_research_items(
    *,
    items: list[dict],
    timeout_seconds: int,
    top_k: int | None = None,
    is_stream: bool = False,
    max_items: int | None = None,
) -> dict[str, Any] | None:
    """
    使用Anspire Search Agent API进行研究
    
    Args:
        items: 新闻条目列表，每个条目包含title, url, source等字段
        timeout_seconds: 请求超时时间（秒）
        top_k: 搜索返回的最大结果数，默认为5
        is_stream: 是否使用流式输出，默认False（JSON格式）
        max_items: 最大研究条目数，默认使用全部条目
        
    Returns:
        dict: 包含研究结果的字典，如果失败则返回None
            - ok: bool, 请求是否成功
            - status: int, HTTP状态码
            - top_k: int, 使用的top_k值
            - is_stream: bool, 是否使用流式输出
            - max_items: int, 最大条目数
            - input_items_count: int, 输入条目总数
            - input_sources: dict, 输入来源统计
            - used_items_count: int, 实际使用的条目数
            - request_query: str, 请求的查询内容
            - response_text: str, 响应文本
            - response_json: dict | None, 响应JSON数据（仅非流式）
    """
    log = logging.getLogger("research.anspire")

    api_key = (os.environ.get("ANSPIRE_API_KEY") or "").strip()
    if not api_key:
        log.warning("ANSPIRE_API_KEY not set; skip anspire research")
        return None

    # 设置默认值
    top_k2 = int(top_k) if top_k is not None else 5
    max_items2 = int(max_items) if max_items is not None else int(len(items))

    # 统计输入来源
    input_sources: dict[str, int] = {}
    for it in items:
        if not isinstance(it, dict):
            continue
        src = (it.get("source") or "").strip() or "<unknown>"
        input_sources[src] = input_sources.get(src, 0) + 1

    # 构建查询提示词
    query = _build_prompt(items, max_items=max_items2)

    # 构建请求URL和参数
    base_url = "https://aisearchagent.anspire.cn/api/v1/agent/search/stream"
    params = {
        "query": query,
        "top_k": top_k2,
        "is_stream": "true" if is_stream else "false",
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json" if not is_stream else "text/event-stream",
    }

    try:
        log.info(f"Requesting Anspire API with top_k={top_k2}, is_stream={is_stream}")
        
        if is_stream:
            # 流式请求
            response = requests.get(
                base_url,
                params=params,
                headers=headers,
                timeout=timeout_seconds,
                stream=True
            )
            
            # 收集流式响应
            chunks = []
            for chunk in response.iter_content(chunk_size=1024, decode_unicode=True):
                if chunk:
                    chunks.append(chunk)
            
            raw_text = "".join(chunks)
            response_json = None
        else:
            # JSON请求
            response = requests.get(
                base_url,
                params=params,
                headers=headers,
                timeout=timeout_seconds
            )
            
            raw_text = response.text
            try:
                response_json = response.json() if raw_text.strip() else None
            except Exception as e:
                log.warning(f"Failed to parse JSON response: {e}")
                response_json = None

        ok = 200 <= response.status_code < 300
        if not ok:
            log.warning(
                f"Anspire request failed: status={response.status_code} body={raw_text[:500]}"
            )

        # 解析响应内容
        content_text, content_json = _parse_response(
            response_json if response_json else raw_text,
            is_stream
        )

        return {
            "ok": bool(ok),
            "status": int(response.status_code),
            "top_k": int(top_k2),
            "is_stream": bool(is_stream),
            "max_items": int(max_items2),
            "input_items_count": int(len(items)),
            "input_sources": input_sources,
            "used_items_count": int(min(len(items), max_items2)),
            "request_query": query,
            "response_text": content_text or raw_text,
            "response_json": content_json or response_json,
        }

    except requests.exceptions.Timeout:
        log.error(f"Anspire request timeout after {timeout_seconds}s")
        return {
            "ok": False,
            "status": 408,
            "top_k": int(top_k2),
            "is_stream": bool(is_stream),
            "max_items": int(max_items2),
            "input_items_count": int(len(items)),
            "input_sources": input_sources,
            "used_items_count": int(min(len(items), max_items2)),
            "request_query": query,
            "response_text": "Request timeout",
            "response_json": None,
        }
    except Exception as e:
        log.error(f"Anspire request failed with exception: {e}")
        return {
            "ok": False,
            "status": 500,
            "top_k": int(top_k2),
            "is_stream": bool(is_stream),
            "max_items": int(max_items2),
            "input_items_count": int(len(items)),
            "input_sources": input_sources,
            "used_items_count": int(min(len(items), max_items2)),
            "request_query": query,
            "response_text": str(e),
            "response_json": None,
        }
