"""
Digest Splitter - 使用LLM拆分汇总型RSS为独立事件

目标：将1条"汇总型RSS"拆成N条"单一事件item"
约束：不得补充事实，不得脑补，输出必须可追溯
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

from src.llm.client.api_client import DeepSeekClient
from src.utils.hash_utils import stable_hash


@dataclass
class SubEvent:
    """拆分后的子事件"""
    sub_id: str  # 稳定ID，可追溯到原item
    title: str
    summary: str
    entities: list[str]
    keywords: list[str]
    evidence_span: str  # 原文片段（可追溯性）


@dataclass
class SplitResult:
    """拆分结果"""
    success: bool
    sub_events: list[SubEvent]
    error: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class DigestSplitter:
    """汇总型RSS拆分器（使用LLM）"""
    
    SYSTEM_PROMPT = """你是一个新闻事件拆分专家。你的任务是将包含多个不相关事件的汇总型新闻拆分成独立的单一事件。

**严格要求**：
1. 只拆分原文中明确存在的事件，不得补充、推测或脑补任何信息
2. 每个子事件必须是独立的、单一主题的
3. 必须提供evidence_span（原文片段）证明该事件确实存在
4. 如果无法可靠拆分，返回空数组[]

**输出格式**（JSON数组）：
```json
[
  {
    "title": "子事件标题（简洁明确）",
    "summary": "子事件摘要（必须能在原文找到对应句子）",
    "entities": ["实体1", "实体2"],
    "keywords": ["关键词1", "关键词2"],
    "evidence_span": "原文中的对应片段（用于可追溯性）"
  }
]
```

**注意**：
- 不要合并相关事件，每个事件独立输出
- 不要添加原文没有的信息
- evidence_span必须是原文的真实片段
"""
    
    def __init__(
        self,
        llm_client: Optional[DeepSeekClient] = None,
        cache_ttl_seconds: int = 86400,  # 24小时
        enable_cache: bool = True,
        timeout_seconds: int = 180  # 增加超时时间到180秒
    ):
        self.llm_client = llm_client or self._create_default_client()
        self.logger = logging.getLogger("fetch.digest_splitter")
        self.cache_ttl_seconds = cache_ttl_seconds
        self.enable_cache = enable_cache
        self._cache: dict[str, tuple[float, SplitResult]] = {}
    
    def _create_default_client(self) -> DeepSeekClient:
        import os
        return DeepSeekClient(
            base_url=os.environ.get("DEEPSEEK_BASE_URL", ""),
            api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
            model=os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
            timeout_seconds=60
        )
    
    def split(self, item: dict) -> SplitResult:
        """
        拆分单个汇总型item
        
        Args:
            item: 汇总型RSS item
            
        Returns:
            SplitResult
        """
        start_time = time.time()
        item_id = item.get("id", "unknown")[:30]
        item_title = item.get("title", "")[:60]
        
        self.logger.info(f"=" * 60)
        self.logger.info(f"开始拆分汇总item: {item_id}")
        self.logger.info(f"  标题: {item_title}")
        
        # 生成缓存key
        cache_key = self._generate_cache_key(item)
        self.logger.debug(f"  缓存key: {cache_key[:16]}...")
        
        # 检查缓存
        if self.enable_cache and cache_key in self._cache:
            cached_time, cached_result = self._cache[cache_key]
            if time.time() - cached_time < self.cache_ttl_seconds:
                age_seconds = int(time.time() - cached_time)
                self.logger.info(f"✓ 使用缓存结果 (缓存年龄: {age_seconds}秒)")
                self.logger.info(f"  子事件数: {len(cached_result.sub_events)}")
                return cached_result
            else:
                self.logger.debug(f"  缓存已过期，重新拆分")
        
        # 构建prompt
        title = (item.get("title") or "").strip()
        content = (item.get("content") or item.get("summary") or "").strip()
        
        self.logger.info(f"  内容长度: {len(content)} 字符")
        
        if not content:
            self.logger.warning(f"✗ 内容为空，跳过拆分")
            return SplitResult(
                success=False,
                sub_events=[],
                error="内容为空",
                metadata={"duration_ms": 0}
            )
        
        user_prompt = f"""请拆分以下汇总型新闻：

标题：{title}

内容：
{content[:3000]}

请输出JSON数组（如无法可靠拆分，返回空数组[]）："""
        
        self.logger.info(f"  调用LLM拆分...")
        self.logger.debug(f"  Prompt长度: {len(user_prompt)} 字符")
        
        # 调用LLM
        try:
            payload = {
                "model": self.llm_client.model,
                "temperature": 0.1,  # 低温度，减少创造性
                "messages": [
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                "response_format": {"type": "json_object"}
            }
            
            response = self.llm_client._post_json(payload)
            response_text = ((((response.get("choices") or [])[0] or {}).get("message") or {}).get("content") or "").strip()
            
            llm_duration = int((time.time() - start_time) * 1000)
            self.logger.info(f"  LLM响应完成 (耗时: {llm_duration}ms)")
            self.logger.debug(f"  响应长度: {len(response_text)} 字符")
            
            # 解析JSON
            try:
                # 尝试直接解析为数组
                parsed = json.loads(response_text)
                if isinstance(parsed, dict) and "events" in parsed:
                    parsed = parsed["events"]
                elif isinstance(parsed, dict) and "sub_events" in parsed:
                    parsed = parsed["sub_events"]
                
                if not isinstance(parsed, list):
                    raise ValueError("LLM输出不是数组")
                
                # 转换为SubEvent对象
                sub_events = []
                parent_id = item.get("id") or stable_hash([title, content[:500]])
                
                for idx, event_dict in enumerate(parsed):
                    if not isinstance(event_dict, dict):
                        continue
                    
                    # 生成稳定的sub_id
                    sub_id = f"{parent_id}:sub{idx+1}"
                    
                    sub_event = SubEvent(
                        sub_id=sub_id,
                        title=str(event_dict.get("title", "")).strip(),
                        summary=str(event_dict.get("summary", "")).strip(),
                        entities=event_dict.get("entities", [])[:5],
                        keywords=event_dict.get("keywords", [])[:5],
                        evidence_span=str(event_dict.get("evidence_span", "")).strip()
                    )
                    
                    # 验证必填字段
                    if sub_event.title and sub_event.summary and sub_event.evidence_span:
                        sub_events.append(sub_event)
                
                duration_ms = int((time.time() - start_time) * 1000)
                
                result = SplitResult(
                    success=True,
                    sub_events=sub_events,
                    error=None,
                    metadata={
                        "duration_ms": duration_ms,
                        "llm_response_length": len(response_text),
                        "sub_event_count": len(sub_events)
                    }
                )
                
                # 缓存结果
                if self.enable_cache:
                    self._cache[cache_key] = (time.time(), result)
                    self.logger.debug(f"  结果已缓存")
                
                self.logger.info(f"✓ 拆分成功!")
                self.logger.info(f"  生成子事件: {len(sub_events)} 个")
                self.logger.info(f"  总耗时: {duration_ms}ms")
                
                for idx, sub in enumerate(sub_events, 1):
                    self.logger.info(f"  [{idx}] {sub.title}")
                    self.logger.debug(f"      实体: {', '.join(sub.entities[:3])}")
                
                self.logger.info(f"=" * 60)
                
                return result
                
            except json.JSONDecodeError as e:
                duration_ms = int((time.time() - start_time) * 1000)
                self.logger.error(f"✗ JSON解析失败: {e}")
                self.logger.error(f"  响应内容: {response_text[:200]}...")
                self.logger.info(f"=" * 60)
                return SplitResult(
                    success=False,
                    sub_events=[],
                    error=f"JSON解析失败: {e}",
                    metadata={"duration_ms": duration_ms}
                )
        
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            self.logger.error(f"✗ LLM调用失败: {e}")
            self.logger.info(f"=" * 60)
            return SplitResult(
                success=False,
                sub_events=[],
                error=str(e),
                metadata={"duration_ms": duration_ms}
            )
    
    def _generate_cache_key(self, item: dict) -> str:
        """生成缓存key（基于内容hash）"""
        content = (item.get("content") or item.get("summary") or "").strip()
        title = (item.get("title") or "").strip()
        
        combined = f"{title}\n{content[:2000]}"
        return hashlib.sha256(combined.encode("utf-8")).hexdigest()
    
    def split_items_to_dict(self, item: dict) -> list[dict]:
        """
        拆分item并转换为标准dict格式（与普通RSS item兼容）
        
        Args:
            item: 汇总型RSS item
            
        Returns:
            拆分后的item列表（标准dict格式）
        """
        result = self.split(item)
        
        if not result.success or not result.sub_events:
            return []
        
        split_items = []
        parent_id = item.get("id", "unknown")
        parent_source = item.get("source", "unknown")
        parent_url = item.get("url", "")
        parent_published_at = item.get("published_at")
        parent_category = item.get("category")
        
        for sub_event in result.sub_events:
            # 构建与普通RSS item兼容的dict
            split_item = {
                "id": sub_event.sub_id,
                "title": sub_event.title,
                "summary": sub_event.summary,
                "content": sub_event.summary,  # 使用summary作为content
                "url": f"{parent_url}#{sub_event.sub_id}",  # 添加锚点区分
                "published_at": parent_published_at,
                "source": parent_source,
                "category": parent_category,
                # 元数据：标记这是拆分来的
                "_split_from": {
                    "parent_id": parent_id,
                    "parent_title": item.get("title"),
                    "evidence_span": sub_event.evidence_span,
                    "entities": sub_event.entities,
                    "keywords": sub_event.keywords,
                }
            }
            
            split_items.append(split_item)
        
        return split_items


def split_digest_items(
    digest_items: list[dict],
    splitter: Optional[DigestSplitter] = None
) -> tuple[list[dict], dict[str, Any]]:
    """
    批量拆分汇总型items
    
    Args:
        digest_items: 汇总型items列表
        splitter: DigestSplitter实例（可选）
        
    Returns:
        (split_items, stats)
    """
    logger = logging.getLogger("fetch.digest_splitter")
    logger.info(f"开始批量拆分 {len(digest_items)} 个汇总items...")
    
    splitter = splitter or DigestSplitter()
    
    all_split_items = []
    stats = {
        "total_digest_items": len(digest_items),
        "successfully_split": 0,
        "failed_split": 0,
        "total_sub_events": 0,
        "avg_sub_events_per_digest": 0.0,
    }
    
    for idx, item in enumerate(digest_items, 1):
        logger.info(f"拆分进度: {idx}/{len(digest_items)}")
        split_items = splitter.split_items_to_dict(item)
        
        if split_items:
            all_split_items.extend(split_items)
            stats["successfully_split"] += 1
            stats["total_sub_events"] += len(split_items)
            logger.info(f"  ✓ 拆分成功: {len(split_items)} 个子事件")
        else:
            stats["failed_split"] += 1
            logger.warning(f"  ✗ 拆分失败")
    
    if stats["successfully_split"] > 0:
        stats["avg_sub_events_per_digest"] = (
            stats["total_sub_events"] / stats["successfully_split"]
        )
    
    logger.info(f"批量拆分完成:")
    logger.info(f"  - 成功: {stats['successfully_split']}/{stats['total_digest_items']}")
    logger.info(f"  - 失败: {stats['failed_split']}")
    logger.info(f"  - 总子事件: {stats['total_sub_events']}")
    logger.info(f"  - 平均每个汇总拆出: {stats['avg_sub_events_per_digest']:.1f} 个")
    
    return all_split_items, stats


__all__ = [
    "DigestSplitter",
    "SubEvent",
    "SplitResult",
    "split_digest_items",
]
