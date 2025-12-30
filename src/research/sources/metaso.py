"""
MetaSo Research Module

这个文件实现了MetaSo研究服务的数据获取和处理功能。

功能概述：
- MetaSo API数据获取
- 研究内容解析和清洗
- 数据标准化处理
- 研究结果整合

主要函数：
- fetch_metaso_data(): 获取MetaSo数据
- parse_research_content(): 解析研究内容
- integrate_findings(): 整合研究结果

研究特性：
- 多源数据整合
- 智能内容分析
- 结构化数据输出
- 实时数据更新

使用示例：
    research_data = fetch_metaso_data(
        query="AI technology trends",
        max_results=10
    )

应用场景：
- 深度研究分析
- 背景资料收集
- 内容增强处理
- 知识图谱构建

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

from __future__ import annotations

import http.client
import json
import logging
import os
from typing import Any


def _build_prompt(items: list[dict], max_items: int) -> str:
    max_items2 = max(0, int(max_items))
    groups: dict[str, list[dict]] = {}
    for it in items[:max_items2]:
        if not isinstance(it, dict):
            continue
        src = (it.get("source") or "").strip() or "<unknown>"
        groups.setdefault(src, []).append(it)

    parts: list[str] = []
    idx = 1
    for src in sorted(groups.keys()):
        parts.append(f"\n## 来源：{src} (count={len(groups[src])})")
        for it in groups[src]:
            title = (it.get("title") or "").strip()
            content = (it.get("content") or "").strip()
            url = (it.get("url") or "").strip()
            
            if not title and not content:
                continue
                
            # 构建条目内容，优先使用完整内容
            item_text = title
            if content and content != title:
                # 如果content和title不同，包含完整内容
                item_text = f"{title}\n   内容: {content}"
            
            if url:
                parts.append(f"{idx}. {item_text}\n   链接: {url}")
            else:
                parts.append(f"{idx}. {item_text}")
            idx += 1

    joined = "\n".join([p for p in parts if p.strip()]).strip()
    if not joined:
        joined = "(no items)"

    return (
        "请基于以下新闻条目（按来源分组，包含标题+完整内容+链接）进行一次网络调查：\n"
        "1) 请按【来源】分组输出调查结果；\n"
        "2) 针对每条新闻的完整内容补充关键背景与事实要点；\n"
        "3) 若能从链接/公开信息验证或澄清，请给出引用来源；\n"
        "4) 最后给出一个跨来源的【汇总】（用 5-10 条要点）。\n\n"
        "新闻条目：\n"
        f"{joined}\n"
    )


def metaso_research_items(
    *,
    items: list[dict],
    timeout_seconds: int,
    model: str | None = None,
    max_items: int | None = None,
) -> dict[str, Any] | None:
    log = logging.getLogger("research.metaso")

    api_key = (os.environ.get("METASO_API_KEY") or "").strip()
    if not api_key:
        log.warning("METASO_API_KEY not set; skip metaso research")
        return None

    model2 = (model or os.environ.get("METASO_MODEL") or "fast").strip() or "fast"
    max_items2 = int(max_items) if max_items is not None else int(len(items))

    input_sources: dict[str, int] = {}
    for it in items:
        if not isinstance(it, dict):
            continue
        src = (it.get("source") or "").strip() or "<unknown>"
        input_sources[src] = input_sources.get(src, 0) + 1

    prompt = _build_prompt(items, max_items=max_items2)
    payload = {
        "model": model2,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
    }

    body = json.dumps(payload, ensure_ascii=False)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    conn = http.client.HTTPSConnection("metaso.cn", timeout=timeout_seconds)
    try:
        conn.request("POST", "/api/v1/chat/completions", body=body.encode("utf-8"), headers=headers)
        res = conn.getresponse()
        raw_bytes = res.read() or b""
        raw_text = raw_bytes.decode("utf-8", errors="replace")

        ok = 200 <= int(res.status) < 300
        if not ok:
            log.warning("metaso request failed: status=%s body=%s", res.status, raw_text[:500])

        data: Any
        try:
            data = json.loads(raw_text) if raw_text.strip() else None
        except Exception:
            data = None

        return {
            "ok": bool(ok),
            "status": int(res.status),
            "model": model2,
            "max_items": int(max_items2),
            "input_items_count": int(len(items)),
            "input_sources": input_sources,
            "used_items_count": int(min(len(items), max_items2)),
            "request": payload,
            "response_text": raw_text,
            "response_json": data,
        }
    finally:
        try:
            conn.close()
        except Exception:
            pass
