"""
Topic Selection Data Models

定义自动选题模块的所有数据结构
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class TopicArchetype(str, Enum):
    """主题母型：6类听众兴趣原型"""
    CHANGE_HAPPENING = "change_happening"           # 变化正在发生
    PERSONAL_IMPACT = "personal_impact"             # 影响到我/工作/钱/习惯
    COMPETITION_CONFLICT = "competition_conflict"   # 输赢/冲突/竞争格局
    RISK_OPPORTUNITY = "risk_opportunity"           # 风险或机会
    COUNTER_INTUITIVE = "counter_intuitive"         # 反直觉/争议
    INFLECTION_TREND = "inflection_trend"           # 趋势拐点


class SignalScores(BaseModel):
    """单条新闻的信号评分"""
    archetypes: Dict[TopicArchetype, float] = Field(default_factory=dict, description="母型评分 0-3")
    continuity: float = Field(default=0.0, ge=0.0, le=1.0, description="非一次性 0-1")
    why_now: float = Field(default=0.0, ge=0.0, le=1.0, description="时机性 0-1")
    data_enrichable: float = Field(default=0.0, ge=0.0, le=1.0, description="可补充历史/对比 0-1")
    follow_up_potential: float = Field(default=0.0, ge=0.0, le=1.0, description="可跟进性 0-1")
    domains: List[str] = Field(default_factory=list, description="语义域标签（如 national_culture, real_estate）")
    
    def mean_archetype_score(self) -> float:
        """计算母型平均分"""
        if not self.archetypes:
            return 0.0
        return sum(self.archetypes.values()) / len(self.archetypes)


class ProxySignals(BaseModel):
    """听众兴趣代理信号"""
    trend_signal: float = Field(default=0.0, ge=0.0, le=1.0, description="趋势信号：讨论度/上升度")
    time_signal: float = Field(default=0.0, ge=0.0, le=1.0, description="时间信号：周期/窗口匹配")
    persona_relevance: float = Field(default=0.0, ge=0.0, le=1.0, description="人群相关性")
    history_echo: float = Field(default=0.0, ge=0.0, le=1.0, description="历史播客呼应")
    
    # 详细信息（可观测）
    trend_details: Optional[Dict[str, Any]] = Field(default=None, description="趋势信号详情")
    history_hits: List[str] = Field(default_factory=list, description="历史播客命中列表")


class TopicCandidate(BaseModel):
    """主题候选"""
    topic_id: str = Field(..., description="稳定的主题ID（同一事件跨天复用）")
    title: str = Field(..., description="主题标题")
    items: List[str] = Field(default_factory=list, description="包含的item IDs")
    entities: List[str] = Field(default_factory=list, description="关键实体")
    
    # 信号汇总
    signal_profile: SignalScores = Field(default_factory=SignalScores, description="信号画像")
    domains: List[str] = Field(default_factory=list, description="聚合后的语义域标签")
    
    # 统一分数体系 0-100
    topic_score: float = Field(default=0.0, ge=0.0, le=100.0, description="主题总分 0-100")
    score_breakdown: Dict[str, float] = Field(default_factory=dict, description="分数详细构成")
    
    # 规则决策
    should_publish_by_rule: bool = Field(default=False, description="规则判断是否发布")
    publish_priority: int = Field(default=1, ge=1, le=5, description="发布优先级 1-5（5最高）")
    
    # 代理信号
    proxy_signals: Optional[ProxySignals] = Field(default=None, description="代理信号")
    
    # LLM Gate决策（可选）
    should_publish: bool = Field(default=False, description="最终是否发布（Gate后）")
    
    # 元数据
    created_at: str = Field(..., description="创建时间 ISO8601")
    first_seen_at: Optional[str] = Field(default=None, description="首次出现时间")
    last_seen_at: Optional[str] = Field(default=None, description="最后出现时间")
    
    # 聚类来源（兼容现有StoryCluster）
    source_cluster_id: Optional[str] = Field(default=None, description="来源cluster ID")


class TopicDecision(BaseModel):
    """LLM决策门输出"""
    topic_id: str = Field(..., description="主题ID")
    should_publish: bool = Field(..., description="是否应该发布")
    publish_priority: int = Field(..., ge=1, le=5, description="发布优先级 1-5（5最高）")
    target_audience: List[str] = Field(default_factory=list, description="目标听众")
    core_hook: str = Field(default="", description="一句话为什么值得听")
    risk: str = Field(default="", description="风险：无聊/争议/数据不足等")
    
    # LLM元数据
    model_used: Optional[str] = Field(default=None, description="使用的模型")
    processing_time_ms: Optional[int] = Field(default=None, description="处理耗时ms")


class TopicScoreBreakdown(BaseModel):
    """主题打分详情（可观测）- 统一0-100分数体系"""
    topic_id: str
    
    # 内容价值分 (0-60)
    content_score: float = Field(default=0.0, description="内容价值分 0-60")
    archetype_mean_score: float = Field(default=0.0, description="母型平均分贡献")
    personal_impact_score: float = Field(default=0.0, description="个人影响分贡献")
    counter_intuitive_score: float = Field(default=0.0, description="反直觉分贡献")
    
    # 代理信号分 (0-25)
    proxy_score: float = Field(default=0.0, description="代理信号分 0-25")
    trend_score: float = Field(default=0.0, description="趋势信号贡献")
    time_score: float = Field(default=0.0, description="时间信号贡献")
    persona_score: float = Field(default=0.0, description="人群相关性贡献")
    history_echo_score: float = Field(default=0.0, description="历史呼应贡献")
    
    # 结构加成 (-10 ~ +15)
    structure_bonus: float = Field(default=0.0, description="结构加成 -10~+15")
    continuity_bonus: float = Field(default=0.0, description="连续性加成")
    data_enrichable_bonus: float = Field(default=0.0, description="数据可补充加成")
    follow_up_bonus: float = Field(default=0.0, description="可跟进加成")
    
    # 策略增强加成（新增）
    strategy_adjustment: float = Field(default=0.0, description="策略调整分（keywords/patterns/compounds/domains）")
    matched_keywords: List[str] = Field(default_factory=list, description="命中的关键词")
    matched_patterns: List[str] = Field(default_factory=list, description="命中的正则模式")
    matched_compounds: List[str] = Field(default_factory=list, description="命中的联合规则")
    matched_domains: List[str] = Field(default_factory=list, description="命中的语义域")
    domain_bonus: float = Field(default=0.0, description="语义域加成")
    
    # 总分 (0-100)
    total_score: float = Field(default=0.0, description="总分 0-100")
    
    # 决策阈值
    threshold_must_publish: float = Field(default=70.0, description="必播阈值")
    threshold_maybe_publish: float = Field(default=55.0, description="可能播阈值")
    
    decision: str = Field(default="discard", description="决策：must/maybe/discard")
    
    def to_dict(self) -> Dict[str, Any]:
        """转为字典（便于日志）"""
        return self.model_dump()


class ItemSignalTagging(BaseModel):
    """单条item的信号标注结果"""
    item_id: str
    signals: SignalScores
    entities: List[str] = Field(default_factory=list, description="提取的实体")
    why_now_reason: str = Field(default="", description="时机分析")
    
    # LLM元数据
    model_used: Optional[str] = Field(default=None)
    processing_time_ms: Optional[int] = Field(default=None)


__all__ = [
    "TopicArchetype",
    "SignalScores",
    "ProxySignals",
    "TopicCandidate",
    "TopicDecision",
    "TopicScoreBreakdown",
    "ItemSignalTagging",
]
