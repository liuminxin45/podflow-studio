"""
Research Pipeline Data Models

定义LLM#1、Retrieval#2、LLM#2的数据结构
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from datetime import datetime

from pydantic import BaseModel, Field


# ============================================================================
# LLM#1 输出模型
# ============================================================================

class RetrievalQuery(BaseModel):
    """单个检索查询"""
    intent: str = Field(
        description="检索意图: history_frequency|ranking|economic_impact|context_recall|timeline|entity_background"
    )
    query: str = Field(description="检索查询文本")
    entities: List[str] = Field(default_factory=list, description="关键实体")
    time_range: Optional[Dict[str, str]] = Field(default=None, description="时间范围 {start, end}")
    priority: int = Field(default=3, ge=1, le=5, description="优先级 1-5")
    expected_output: str = Field(
        default="summary",
        description="期望输出类型: list|table|summary|numbers|citations"
    )
    must_have: bool = Field(default=False, description="是否必须有结果")


class RetrievalPlan(BaseModel):
    """检索计划"""
    queries: List[RetrievalQuery] = Field(description="检索查询列表")
    constraints: Dict[str, bool] = Field(
        default_factory=lambda: {
            "no_fabrication": True,
            "if_missing_use_range_words": True
        },
        description="约束条件"
    )


class EnhancementFields(BaseModel):
    """增强字段"""
    event_summary: str = Field(description="事件级理解")
    data_enrichment: str = Field(description="有趣数据/结构化补充")
    why_now: str = Field(description="Why Now分析")
    actual_impact: str = Field(description="实际影响")
    counter_intuitive: str = Field(description="反直觉点")


class LLM1Output(BaseModel):
    """LLM#1 输出"""
    draft_script: str = Field(description="播客草稿")
    enhancement: EnhancementFields = Field(description="结构化增强字段")
    retrieval_plan: RetrievalPlan = Field(description="检索计划")
    
    # 元数据
    topic_title: str = Field(description="主题标题")
    processing_time_ms: int = Field(default=0, description="处理时间")
    model_used: str = Field(default="", description="使用的模型")


# ============================================================================
# Retrieval#2 输出模型
# ============================================================================

class Citation(BaseModel):
    """引用来源"""
    title: str = Field(description="标题")
    url: str = Field(description="URL")
    source: str = Field(description="来源")
    extracted_at: str = Field(description="提取时间")
    quote_or_summary: str = Field(description="引用或摘要")
    relevance_score: float = Field(default=0.0, description="相关性分数")


class HistoryPodcastHit(BaseModel):
    """历史播客命中"""
    episode_id: str = Field(description="集ID")
    date: str = Field(description="日期")
    snippet: str = Field(description="片段")
    similarity: float = Field(description="相似度")
    url_or_path: str = Field(description="URL或路径")


class StatOrRanking(BaseModel):
    """统计或排名数据"""
    metric: str = Field(description="指标名称")
    value: str = Field(description="值（可以是区间）")
    source: str = Field(description="来源")
    time_period: Optional[str] = Field(default=None, description="时间段")
    confidence: str = Field(default="medium", description="置信度: low|medium|high")


class Comparison(BaseModel):
    """对比数据"""
    subject_a: str = Field(description="对比对象A")
    subject_b: str = Field(description="对比对象B")
    dimension: str = Field(description="对比维度")
    result: str = Field(description="对比结果")
    source: str = Field(description="来源")


class TimelineEvent(BaseModel):
    """时间线事件"""
    date: str = Field(description="日期")
    event: str = Field(description="事件描述")
    source: str = Field(description="来源")


class RetrievalBundle(BaseModel):
    """检索结果包"""
    hard_facts: List[str] = Field(default_factory=list, description="硬事实")
    stats_and_rankings: List[StatOrRanking] = Field(default_factory=list, description="统计和排名")
    comparisons: List[Comparison] = Field(default_factory=list, description="对比数据")
    timeline: List[TimelineEvent] = Field(default_factory=list, description="时间线")
    history_podcast_hits: List[HistoryPodcastHit] = Field(default_factory=list, description="历史播客命中")
    citations: List[Citation] = Field(default_factory=list, description="引用来源")
    gaps: List[str] = Field(default_factory=list, description="缺失项说明")
    
    # 元数据
    total_queries: int = Field(default=0, description="总查询数")
    successful_queries: int = Field(default=0, description="成功查询数")
    cache_hits: int = Field(default=0, description="缓存命中数")
    processing_time_ms: int = Field(default=0, description="处理时间")


# ============================================================================
# LLM#2 输出模型
# ============================================================================

class LLM2Output(BaseModel):
    """LLM#2 输出"""
    final_podcast_script: str = Field(description="最终播客脚本")
    shownotes: Optional[str] = Field(default=None, description="节目笔记")
    citations_used: List[str] = Field(default_factory=list, description="使用的引用")
    
    # 质量标记
    has_hard_data: bool = Field(default=False, description="是否包含硬数据")
    degraded: bool = Field(default=False, description="是否降级输出")
    data_quality_score: float = Field(default=0.0, ge=0.0, le=1.0, description="数据质量分数")
    
    # 元数据
    topic_title: str = Field(description="主题标题")
    processing_time_ms: int = Field(default=0, description="处理时间")
    model_used: str = Field(default="", description="使用的模型")


# ============================================================================
# Pipeline 状态模型
# ============================================================================

class PipelineStage(BaseModel):
    """Pipeline阶段状态"""
    stage_name: str = Field(description="阶段名称")
    item_id: str = Field(description="条目ID")
    status: str = Field(description="状态: pending|running|success|failed|degraded")
    start_time: Optional[datetime] = Field(default=None, description="开始时间")
    end_time: Optional[datetime] = Field(default=None, description="结束时间")
    duration_ms: int = Field(default=0, description="耗时")
    error: Optional[str] = Field(default=None, description="错误信息")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="元数据")


class PipelineResult(BaseModel):
    """Pipeline完整结果"""
    item_id: str = Field(description="条目ID")
    topic_title: str = Field(description="主题标题")
    
    # 各阶段输出
    llm1_output: Optional[LLM1Output] = Field(default=None, description="LLM#1输出")
    retrieval_bundle: Optional[RetrievalBundle] = Field(default=None, description="检索结果")
    llm2_output: Optional[LLM2Output] = Field(default=None, description="LLM#2输出")
    
    # 状态追踪
    stages: List[PipelineStage] = Field(default_factory=list, description="阶段状态")
    final_status: str = Field(default="pending", description="最终状态")
    total_duration_ms: int = Field(default=0, description="总耗时")
    
    # 降级标记
    used_fallback: bool = Field(default=False, description="是否使用降级方案")
    fallback_reason: Optional[str] = Field(default=None, description="降级原因")


__all__ = [
    # LLM#1
    "RetrievalQuery",
    "RetrievalPlan",
    "EnhancementFields",
    "LLM1Output",
    # Retrieval#2
    "Citation",
    "HistoryPodcastHit",
    "StatOrRanking",
    "Comparison",
    "TimelineEvent",
    "RetrievalBundle",
    # LLM#2
    "LLM2Output",
    # Pipeline
    "PipelineStage",
    "PipelineResult",
]
