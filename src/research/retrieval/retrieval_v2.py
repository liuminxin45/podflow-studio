"""
Retrieval V2 Executor

执行二次检索：安思派+本地缓存+历史播客
支持并发、去重、降级
"""

from __future__ import annotations

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Set

from src.research.core.models import (
    RetrievalPlan,
    RetrievalQuery,
    RetrievalBundle,
    Citation,
    StatOrRanking,
    Comparison,
    TimelineEvent,
)
from src.research.utils.cache_manager import CacheManager
from src.research.retrieval.history_search import HistoryPodcastSearcher
from src.research.sources.anspire import anspire_research_items


class RetrievalV2Executor:
    """二次检索执行器"""
    
    def __init__(self,
                 cache_manager: Optional[CacheManager] = None,
                 history_searcher: Optional[HistoryPodcastSearcher] = None,
                 max_concurrent: int = 2,
                 timeout_seconds: int = 60):
        """
        初始化检索执行器
        
        Args:
            cache_manager: 缓存管理器
            history_searcher: 历史播客检索器
            max_concurrent: 最大并发数
            timeout_seconds: 超时时间
        """
        self.cache_manager = cache_manager or CacheManager()
        self.history_searcher = history_searcher or HistoryPodcastSearcher()
        self.max_concurrent = max_concurrent
        self.timeout_seconds = timeout_seconds
        self.logger = logging.getLogger("research.retrieval_v2")
    
    def execute(self, retrieval_plan: RetrievalPlan) -> RetrievalBundle:
        """
        执行检索计划
        
        Args:
            retrieval_plan: 检索计划
            
        Returns:
            检索结果包
        """
        start_time = time.time()
        
        queries = retrieval_plan.queries
        total_queries = len(queries)
        
        self.logger.info(f"开始执行检索计划，共 {total_queries} 个查询")
        
        # 去重
        unique_queries = self._deduplicate_queries(queries)
        self.logger.info(f"去重后剩余 {len(unique_queries)} 个查询")
        
        # 并发执行查询
        results = self._execute_queries_concurrent(unique_queries)
        
        # 构建检索结果包
        bundle = self._build_retrieval_bundle(results, retrieval_plan)
        
        # 统计
        processing_time = int((time.time() - start_time) * 1000)
        bundle.total_queries = total_queries
        bundle.successful_queries = len([r for r in results if r.get("success")])
        bundle.processing_time_ms = processing_time
        
        self.logger.info(
            f"检索完成：成功 {bundle.successful_queries}/{total_queries}，"
            f"缓存命中 {bundle.cache_hits}，耗时 {processing_time}ms"
        )
        
        return bundle
    
    def _deduplicate_queries(self, queries: List[RetrievalQuery]) -> List[RetrievalQuery]:
        """去重查询"""
        seen: Set[str] = set()
        unique = []
        
        for query in queries:
            # 使用query文本+intent作为去重key
            key = f"{query.intent}:{query.query}"
            if key not in seen:
                seen.add(key)
                unique.append(query)
        
        return unique
    
    def _execute_queries_concurrent(self, queries: List[RetrievalQuery]) -> List[Dict[str, Any]]:
        """并发执行查询"""
        results = []
        
        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            future_to_query = {
                executor.submit(self._execute_single_query, query): query
                for query in queries
            }
            
            for future in as_completed(future_to_query):
                query = future_to_query[future]
                try:
                    result = future.result(timeout=float(self.timeout_seconds))
                    results.append(result)
                except Exception as e:
                    if not future.done():
                        future.cancel()
                    self.logger.error(f"查询失败: {query.query[:50]} - {e}")
                    results.append({
                        "query": query,
                        "success": False,
                        "error": str(e)
                    })

            # 兜底：确保没有遗漏未完成的future（避免上层出现 futures unfinished）
            for future, query in future_to_query.items():
                if future.done():
                    continue
                future.cancel()
                results.append({
                    "query": query,
                    "success": False,
                    "error": f"timeout after {self.timeout_seconds}s"
                })
        
        return results
    
    def _execute_single_query(self, query: RetrievalQuery) -> Dict[str, Any]:
        """执行单个查询"""
        self.logger.debug(f"执行查询: {query.intent} - {query.query[:50]}")
        
        result = {
            "query": query,
            "success": False,
            "cache_hit": False,
            "data": None
        }
        
        try:
            # 1. 检查缓存
            cached = self.cache_manager.get(query.query, source="anspire")
            if cached:
                result["cache_hit"] = True
                result["success"] = True
                result["data"] = cached
                self.logger.debug(f"缓存命中: {query.query[:50]}")
                return result
            
            # 2. 执行安思派搜索
            anspire_result = self._search_anspire(query)
            
            if anspire_result:
                result["success"] = True
                result["data"] = anspire_result
                
                # 写入缓存
                self.cache_manager.set(query.query, anspire_result, source="anspire")
            
            # 3. 如果需要历史播客检索
            if query.intent in ["context_recall", "history_frequency"]:
                history_hits = self.history_searcher.search(
                    query=query.query,
                    entities=query.entities,
                    top_k=3
                )
                
                if history_hits:
                    if result["data"] is None:
                        result["data"] = {}
                    result["data"]["history_hits"] = [h.model_dump() for h in history_hits]
                    result["success"] = True
            
            return result
            
        except Exception as e:
            self.logger.error(f"查询异常: {query.query[:50]} - {e}")
            result["error"] = str(e)
            return result
    
    def _search_anspire(self, query: RetrievalQuery) -> Optional[Dict[str, Any]]:
        """执行安思派搜索"""
        try:
            # 构建查询条目
            items = [{
                "title": query.query,
                "content": " ".join(query.entities) if query.entities else "",
                "source": "retrieval_v2"
            }]
            
            # 调用安思派
            result = anspire_research_items(
                items=items,
                timeout_seconds=int(self.timeout_seconds),
                top_k=5,
                is_stream=False,
                max_items=1
            )
            
            if result and result.get("ok"):
                return result.get("response_json", {})
            
            return None
            
        except Exception as e:
            self.logger.warning(f"安思派搜索失败: {e}")
            return None
    
    def _build_retrieval_bundle(self,
                                results: List[Dict[str, Any]],
                                plan: RetrievalPlan) -> RetrievalBundle:
        """构建检索结果包"""
        bundle = RetrievalBundle()
        
        cache_hits = 0
        gaps = []
        
        for result in results:
            query = result["query"]
            
            if result.get("cache_hit"):
                cache_hits += 1
            
            if not result.get("success"):
                if query.must_have:
                    gaps.append(f"必需查询失败: {query.intent} - {query.query[:50]}")
                continue
            
            data = result.get("data", {})
            if not data:
                continue
            
            # 提取数据到对应字段
            self._extract_data_to_bundle(bundle, data, query)
        
        bundle.cache_hits = cache_hits
        bundle.gaps = gaps
        
        return bundle
    
    def _extract_data_to_bundle(self,
                               bundle: RetrievalBundle,
                               data: Dict[str, Any],
                               query: RetrievalQuery) -> None:
        """从数据中提取信息到bundle"""
        # 提取硬事实
        summary = data.get("summary", "")
        if summary:
            bundle.hard_facts.append(summary)
        
        # 提取引用
        items = data.get("items", [])
        for item in items[:3]:  # 限制数量
            if isinstance(item, dict):
                citation = Citation(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    source=item.get("source", "anspire"),
                    extracted_at=str(time.time()),
                    quote_or_summary=item.get("content", "")[:200],
                    relevance_score=item.get("score", 0.0)
                )
                bundle.citations.append(citation)
        
        # 提取历史播客命中
        history_hits = data.get("history_hits", [])
        for hit_data in history_hits:
            from src.research.core.models import HistoryPodcastHit
            hit = HistoryPodcastHit(**hit_data)
            bundle.history_podcast_hits.append(hit)
        
        # 根据intent提取特定类型数据
        if query.intent == "ranking":
            # 尝试提取排名信息
            if "排名" in summary or "第" in summary:
                stat = StatOrRanking(
                    metric=query.query,
                    value=summary[:100],
                    source="anspire",
                    confidence="medium"
                )
                bundle.stats_and_rankings.append(stat)
        
        elif query.intent == "economic_impact":
            # 尝试提取经济影响数据
            if any(kw in summary for kw in ["亿", "万", "%", "增长", "下降"]):
                stat = StatOrRanking(
                    metric=query.query,
                    value=summary[:100],
                    source="anspire",
                    confidence="medium"
                )
                bundle.stats_and_rankings.append(stat)


__all__ = ["RetrievalV2Executor", "RetrievalBundle"]
