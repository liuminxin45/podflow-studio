"""
Batch Researcher Module

批量研究处理器，支持对多个新闻主题进行并行或串行研究。

功能概述：
- 接收拆分后的新闻主题列表
- 并行执行多个研究任务
- 汇总研究结果
- 支持重试和错误处理

主要类：
- BatchResearcher: 批量研究器
- BatchResearchResult: 批量研究结果

使用示例：
    researcher = BatchResearcher()
    result = researcher.research_topics(topics, max_concurrent=3)

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-29
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from src.research.processing.news_splitter import NewsTopic
from src.research.sources.research_client import UnifiedResearchClient, create_client_from_env


class TopicResearchResult(BaseModel):
    """单个主题的研究结果"""
    topic: NewsTopic = Field(description="研究主题")
    success: bool = Field(description="是否成功")
    content: Optional[str] = Field(default=None, description="研究内容")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="元数据")
    error: Optional[str] = Field(default=None, description="错误信息")
    processing_time_ms: int = Field(default=0, description="处理时间（毫秒）")


class BatchResearchResult(BaseModel):
    """批量研究结果"""
    total_topics: int = Field(description="总主题数")
    successful_topics: int = Field(description="成功研究的主题数")
    failed_topics: int = Field(description="失败的主题数")
    total_processing_time_ms: int = Field(description="总处理时间（毫秒）")
    topic_results: List[TopicResearchResult] = Field(description="各主题的研究结果")
    summary_content: Optional[str] = Field(default=None, description="汇总内容")


class BatchResearcher:
    """批量研究器"""
    
    def __init__(self, 
                 research_client: Optional[UnifiedResearchClient] = None,
                 max_concurrent: int = 3,
                 timeout_seconds: int = 300):
        """
        初始化批量研究器
        
        Args:
            research_client: 研究客户端，如果为None则自动创建
            max_concurrent: 最大并发数
            timeout_seconds: 超时时间
        """
        self.research_client = research_client or create_client_from_env()
        self.max_concurrent = max_concurrent
        self.timeout_seconds = timeout_seconds
        self.logger = logging.getLogger("research.batch_researcher")
    
    def _research_single_topic(self, topic: NewsTopic) -> TopicResearchResult:
        """
        研究单个主题
        
        Args:
            topic: 新闻主题
            
        Returns:
            TopicResearchResult: 研究结果
        """
        start_time = time.time()
        
        try:
            self.logger.info(f"开始研究主题: {topic.title}")
            
            # 转换为研究格式
            item = {
                "title": topic.title,
                "content": topic.content,
                "source": topic.source,
                "url": topic.url,
                "id": topic.id
            }
            
            # 执行研究
            research_result = self.research_client.research_items([item], use_retry=True)
            
            processing_time = int((time.time() - start_time) * 1000)
            
            if research_result.success:
                self.logger.info(f"主题研究成功: {topic.title}，耗时 {processing_time}ms")
                return TopicResearchResult(
                    topic=topic,
                    success=True,
                    content=research_result.content,
                    metadata=research_result.metadata,
                    processing_time_ms=processing_time
                )
            else:
                self.logger.warning(f"主题研究失败: {topic.title}，错误: {research_result.error}")
                return TopicResearchResult(
                    topic=topic,
                    success=False,
                    error=research_result.error,
                    processing_time_ms=processing_time
                )
                
        except Exception as e:
            processing_time = int((time.time() - start_time) * 1000)
            error_msg = str(e)
            self.logger.error(f"主题研究异常: {topic.title}，错误: {error_msg}")
            return TopicResearchResult(
                topic=topic,
                success=False,
                error=error_msg,
                processing_time_ms=processing_time
            )
    
    def research_topics(self, topics: List[NewsTopic], 
                       max_concurrent: Optional[int] = None) -> BatchResearchResult:
        """
        批量研究主题
        
        Args:
            topics: 主题列表
            max_concurrent: 最大并发数，覆盖初始化设置
            
        Returns:
            BatchResearchResult: 批量研究结果
        """
        if not topics:
            return BatchResearchResult(
                total_topics=0,
                successful_topics=0,
                failed_topics=0,
                total_processing_time_ms=0,
                topic_results=[]
            )
        
        max_concurrent = max_concurrent or self.max_concurrent
        start_time = time.time()
        
        self.logger.info(f"开始批量研究 {len(topics)} 个主题，最大并发数: {max_concurrent}")
        
        topic_results = []
        
        # 使用线程池并行处理
        with ThreadPoolExecutor(max_workers=max_concurrent) as executor:
            # 提交所有任务
            future_to_topic = {
                executor.submit(self._research_single_topic, topic): topic 
                for topic in topics
            }
            
            # 收集结果
            for future in as_completed(future_to_topic, timeout=self.timeout_seconds):
                try:
                    result = future.result()
                    topic_results.append(result)
                except Exception as e:
                    topic = future_to_topic[future]
                    self.logger.error(f"获取主题结果异常: {topic.title}，错误: {e}")
                    topic_results.append(TopicResearchResult(
                        topic=topic,
                        success=False,
                        error=f"Future execution error: {e}",
                        processing_time_ms=0
                    ))
        
        # 统计结果
        successful_count = sum(1 for r in topic_results if r.success)
        failed_count = len(topic_results) - successful_count
        total_processing_time = int((time.time() - start_time) * 1000)
        
        self.logger.info(f"批量研究完成：成功 {successful_count}/{len(topics)}，总耗时 {total_processing_time}ms")
        
        # 生成汇总
        summary = self._generate_summary(topic_results)
        
        return BatchResearchResult(
            total_topics=len(topics),
            successful_topics=successful_count,
            failed_topics=failed_count,
            total_processing_time_ms=total_processing_time,
            topic_results=topic_results,
            summary_content=summary
        )
    
    def _generate_summary(self, topic_results: List[TopicResearchResult]) -> str:
        """
        生成研究结果汇总
        
        Args:
            topic_results: 主题研究结果列表
            
        Returns:
            str: 汇总内容
        """
        if not topic_results:
            return "无研究结果"
        
        # 筛选成功的研究结果
        successful_results = [r for r in topic_results if r.success]
        
        if not successful_results:
            return "所有主题研究均失败"
        
        summary_parts = [f"## 研究结果汇总\n"]
        summary_parts.append(f"成功研究 {len(successful_results)}/{len(topic_results)} 个主题\n\n")
        
        for i, result in enumerate(successful_results, 1):
            summary_parts.append(f"### {i}. {result.topic.title}\n")
            summary_parts.append(f"**主题类型**: {result.topic.topic_type}\n")
            
            # 从metadata中提取实际的研究内容
            content = None
            if result.metadata:
                response_json = result.metadata.get("response_json", {})
                if isinstance(response_json, dict):
                    content = response_json.get("summary", "")
            
            # 如果metadata中没有，尝试使用content字段
            if not content and result.content:
                content = result.content
            
            if content:
                content = content.strip()
                if len(content) > 500:
                    content = content[:500] + "..."
                summary_parts.append(f"{content}\n\n")
            else:
                summary_parts.append("暂无详细内容\n\n")
        
        return "".join(summary_parts)


def research_topics_batch(topics: List[NewsTopic], 
                         max_concurrent: int = 3) -> BatchResearchResult:
    """
    便捷函数：批量研究主题
    
    Args:
        topics: 主题列表
        max_concurrent: 最大并发数
        
    Returns:
        BatchResearchResult: 批量研究结果
    """
    researcher = BatchResearcher(max_concurrent=max_concurrent)
    return researcher.research_topics(topics)


__all__ = [
    "TopicResearchResult",
    "BatchResearchResult",
    "BatchResearcher",
    "research_topics_batch",
]
