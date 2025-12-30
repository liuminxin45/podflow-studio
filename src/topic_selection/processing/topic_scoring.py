"""
Topic Scoring and Filtering

计算TopicScore + breakdown + 阈值淘汰
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple

from src.topic_selection.core.models import (
    TopicCandidate,
    TopicScoreBreakdown,
)


class TopicScorerConfig:
    """打分配置 - 统一0-100分数体系"""
    def __init__(
        self,
        # 内容价值分配置 (0-60)
        archetype_mean_max: float = 40.0,
        personal_impact_max: float = 10.0,
        counter_intuitive_max: float = 10.0,
        # 代理信号分配置 (0-25)
        trend_max: float = 10.0,
        time_max: float = 5.0,
        persona_max: float = 5.0,
        history_echo_max: float = 5.0,
        # 结构加成配置 (-10 ~ +15)
        continuity_max: float = 6.0,
        data_enrichable_max: float = 6.0,
        follow_up_max: float = 3.0,
        # 阈值配置
        threshold_must_publish: float = 70.0,
        threshold_maybe_publish: float = 55.0,
    ):
        # 内容价值分
        self.archetype_mean_max = archetype_mean_max
        self.personal_impact_max = personal_impact_max
        self.counter_intuitive_max = counter_intuitive_max
        # 代理信号分
        self.trend_max = trend_max
        self.time_max = time_max
        self.persona_max = persona_max
        self.history_echo_max = history_echo_max
        # 结构加成
        self.continuity_max = continuity_max
        self.data_enrichable_max = data_enrichable_max
        self.follow_up_max = follow_up_max
        # 阈值
        self.threshold_must_publish = threshold_must_publish
        self.threshold_maybe_publish = threshold_maybe_publish


class TopicScorer:
    """主题打分器"""
    
    def __init__(self, config: TopicScorerConfig | None = None):
        self.config = config or TopicScorerConfig()
        self.logger = logging.getLogger("topic_selection.topic_scoring")
    
    def score_and_filter(
        self,
        candidates: List[TopicCandidate]
    ) -> Tuple[List[TopicCandidate], List[TopicScoreBreakdown]]:
        """打分并过滤"""
        
        breakdowns = []
        filtered_candidates = []
        
        for candidate in candidates:
            try:
                breakdown = self._score_single(candidate)
                breakdowns.append(breakdown)
                
                # 始终更新candidate的topic_score和score_breakdown以保持一致性
                candidate.topic_score = breakdown.total_score
                candidate.score_breakdown = breakdown.to_dict()
                
                # 应用淘汰规则
                if breakdown.decision != "discard":
                    # 根据decision设置should_publish_by_rule和priority
                    if breakdown.decision == "must":
                        candidate.should_publish_by_rule = True
                        candidate.publish_priority = 5  # 5最高
                    elif breakdown.decision == "maybe":
                        candidate.should_publish_by_rule = True
                        candidate.publish_priority = 3
                    
                    filtered_candidates.append(candidate)
                else:
                    self.logger.debug(f"淘汰主题: {candidate.topic_id} (分数={breakdown.total_score:.2f})")
                    
            except Exception as e:
                self.logger.error(f"打分失败: {candidate.topic_id} - {e}")
        
        self.logger.info(f"打分完成: {len(filtered_candidates)}/{len(candidates)} 通过筛选")
        return filtered_candidates, breakdowns
    
    def _score_single(self, candidate: TopicCandidate) -> TopicScoreBreakdown:
        """计算单个主题的分数 - 统一0-100分数体系
        
        分数构成：
        - 内容价值分 (0-60): archetype_mean + personal_impact + counter_intuitive
        - 代理信号分 (0-25): trend + time + persona + history_echo
        - 结构加成 (-10 ~ +15): continuity + data_enrichable + follow_up
        """
        
        signals = candidate.signal_profile
        proxy = candidate.proxy_signals
        
        from src.topic_selection.core.models import TopicArchetype
        
        # === 1. 结构性淘汰规则（先淘汰） ===
        if signals.continuity < 0.2:
            self.logger.debug(f"淘汰: {candidate.topic_id} - 一次性事件 (continuity={signals.continuity:.2f})")
            return self._create_discard_breakdown(candidate.topic_id, "一次性事件")
        
        if signals.data_enrichable < 0.3 and signals.follow_up_potential < 0.3:
            self.logger.debug(f"淘汰: {candidate.topic_id} - 无法补充数据且无后续")
            return self._create_discard_breakdown(candidate.topic_id, "无法扩展")
        
        archetype_mean = signals.mean_archetype_score()
        personal_impact_raw = signals.archetypes.get(TopicArchetype.PERSONAL_IMPACT, 0.0)
        
        if archetype_mean < 0.7 and personal_impact_raw < 0.7:
            self.logger.debug(f"淘汰: {candidate.topic_id} - 听众价值弱")
            return self._create_discard_breakdown(candidate.topic_id, "听众价值弱")
        
        # === 2. 内容价值分 (0-60) ===
        # archetype_mean: 0-3 → 0-40
        archetype_mean_score = (archetype_mean / 3.0) * self.config.archetype_mean_max
        
        # personal_impact: 0-3 → 0-10
        personal_impact_score = (personal_impact_raw / 3.0) * self.config.personal_impact_max
        
        # counter_intuitive: 0-3 → 0-10
        counter_intuitive_raw = signals.archetypes.get(TopicArchetype.COUNTER_INTUITIVE, 0.0)
        counter_intuitive_score = (counter_intuitive_raw / 3.0) * self.config.counter_intuitive_max
        
        content_score = archetype_mean_score + personal_impact_score + counter_intuitive_score
        
        # === 3. 代理信号分 (0-25) ===
        trend_score = 0.0
        time_score = 0.0
        persona_score = 0.0
        history_echo_score = 0.0
        
        if proxy:
            # trend: 0-1 → 0-10
            trend_score = proxy.trend_signal * self.config.trend_max
            # time: 0-1 → 0-5
            time_score = proxy.time_signal * self.config.time_max
            # persona: 0-1 → 0-5
            persona_score = proxy.persona_relevance * self.config.persona_max
            # history_echo: 0-1 → 0-5
            history_echo_score = proxy.history_echo * self.config.history_echo_max
        
        proxy_score = trend_score + time_score + persona_score + history_echo_score
        
        # === 4. 结构加成 (-10 ~ +15) ===
        # continuity: 0-1 → 0-6
        continuity_bonus = signals.continuity * self.config.continuity_max
        # data_enrichable: 0-1 → 0-6
        data_enrichable_bonus = signals.data_enrichable * self.config.data_enrichable_max
        # follow_up: 0-1 → 0-3
        follow_up_bonus = signals.follow_up_potential * self.config.follow_up_max
        
        structure_bonus = continuity_bonus + data_enrichable_bonus + follow_up_bonus
        
        # === 5. 总分 (0-100) ===
        total_score = content_score + proxy_score + structure_bonus
        total_score = max(0.0, min(100.0, total_score))  # clamp到0-100
        
        # === 6. 决策 ===
        if total_score >= self.config.threshold_must_publish:
            decision = "must"
        elif total_score >= self.config.threshold_maybe_publish:
            decision = "maybe"
        else:
            decision = "discard"
        
        return TopicScoreBreakdown(
            topic_id=candidate.topic_id,
            content_score=content_score,
            archetype_mean_score=archetype_mean_score,
            personal_impact_score=personal_impact_score,
            counter_intuitive_score=counter_intuitive_score,
            proxy_score=proxy_score,
            trend_score=trend_score,
            time_score=time_score,
            persona_score=persona_score,
            history_echo_score=history_echo_score,
            structure_bonus=structure_bonus,
            continuity_bonus=continuity_bonus,
            data_enrichable_bonus=data_enrichable_bonus,
            follow_up_bonus=follow_up_bonus,
            total_score=total_score,
            threshold_must_publish=self.config.threshold_must_publish,
            threshold_maybe_publish=self.config.threshold_maybe_publish,
            decision=decision
        )
    
    def _create_discard_breakdown(self, topic_id: str, reason: str) -> TopicScoreBreakdown:
        """创建淘汰的breakdown（分数全0）"""
        return TopicScoreBreakdown(
            topic_id=topic_id,
            content_score=0.0,
            proxy_score=0.0,
            structure_bonus=0.0,
            total_score=0.0,
            threshold_must_publish=self.config.threshold_must_publish,
            threshold_maybe_publish=self.config.threshold_maybe_publish,
            decision="discard"
        )


__all__ = ["TopicScorer", "TopicScorerConfig"]
