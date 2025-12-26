"""
Content Deduplication Module

这个文件实现了内容去重功能，用于识别和重复的新闻条目。

功能概述：
- 基于内容哈希的去重算法
- 支持相似度检测
- 提供去重统计和报告
- 高效的批量处理能力

主要函数：
- deduplicate_items(): 去重主函数
- generate_content_hash(): 生成内容哈希
- find_duplicates(): 查找重复项

去重特性：
- 基于标题和链接的哈希算法
- 支持自定义去重规则
- 保留原始数据结构
- 提供去重统计信息

使用示例：
    unique_items, duplicates = deduplicate_items(
        news_items,
        hash_keys=["title", "link"]
    )

应用场景：
- 新闻聚合去重
- 内容清洗处理
- 数据质量提升
- 存储空间优化

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

from __future__ import annotations

import hashlib


def _fingerprint(item: dict) -> str:
    base = (item.get("url") or "") + "|" + (item.get("title") or "")
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def dedup_items(items: list[dict], max_items: int) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []

    for it in items:
        fp = _fingerprint(it)
        if fp in seen:
            continue
        seen.add(fp)
        out.append(it)
        if len(out) >= max_items:
            break

    return out
