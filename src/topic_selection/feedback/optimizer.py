"""
策略优化器 - Phase 2 核心模块

基于人工反馈数据优化选题策略：
1. 阈值自适应调整
2. 权重动态优化
3. Few-shot 提示生成
"""

import logging
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import statistics

from .models import FeedbackSession, TopicFeedback


logger = logging.getLogger(__name__)


@dataclass
class ThresholdOptimization:
    """阈值优化结果"""
    current_must_publish: float
    current_maybe_publish: float
    suggested_must_publish: float
    suggested_maybe_publish: float
    adjustment_must: float
    adjustment_maybe: float
    confidence: float  # 0-1, 置信度
    reason: str


@dataclass
class WeightOptimization:
    """权重优化结果"""
    dimension: str
    current_max: float
    suggested_max: float
    adjustment: float
    confidence: float
    reason: str


@dataclass
class FewShotExample:
    """Few-shot 示例"""
    title: str
    system_decision: str
    system_score: float
    human_decision: str
    feedback_reason: str
    tags: List[str]


@dataclass
class OptimizationReport:
    """优化报告"""
    feedback_sessions_count: int
    total_feedbacks: int
    inconsistent_count: int
    threshold_optimization: Optional[ThresholdOptimization]
    weight_optimizations: List[WeightOptimization]
    few_shot_examples: List[FewShotExample]
    overall_confidence: float


class StrategyOptimizer:
    """策略优化器"""
    
    def __init__(
        self,
        feedback_dir: str = "feedback_history",
        min_feedbacks: int = 10,
        confidence_threshold: float = 0.6,
    ):
        self.feedback_dir = Path(feedback_dir)
        self.min_feedbacks = min_feedbacks
        self.confidence_threshold = confidence_threshold
    
    def optimize(
        self,
        current_config: dict,
    ) -> OptimizationReport:
        """
        执行优化分析
        
        Args:
            current_config: 当前配置（从 settings.yaml 读取）
        
        Returns:
            OptimizationReport: 优化报告
        """
        # 1. 加载所有反馈数据
        sessions = self._load_all_feedback_sessions()
        all_feedbacks = self._extract_all_feedbacks(sessions)
        
        if len(all_feedbacks) < self.min_feedbacks:
            logger.warning(
                f"反馈数据不足：{len(all_feedbacks)} < {self.min_feedbacks}，"
                f"建议继续收集数据"
            )
        
        # 2. 识别不一致案例（系统 vs 人工）
        inconsistent_feedbacks = self._find_inconsistent_feedbacks(all_feedbacks)
        
        # 3. 阈值优化
        threshold_opt = self._optimize_thresholds(
            all_feedbacks,
            current_config
        )
        
        # 4. 权重优化
        weight_opts = self._optimize_weights(
            inconsistent_feedbacks,
            current_config
        )
        
        # 5. Few-shot 示例生成
        few_shot_examples = self._generate_few_shot_examples(
            inconsistent_feedbacks,
            max_examples=5
        )
        
        # 6. 计算总体置信度
        overall_confidence = self._calculate_overall_confidence(
            len(all_feedbacks),
            len(inconsistent_feedbacks)
        )
        
        return OptimizationReport(
            feedback_sessions_count=len(sessions),
            total_feedbacks=len(all_feedbacks),
            inconsistent_count=len(inconsistent_feedbacks),
            threshold_optimization=threshold_opt,
            weight_optimizations=weight_opts,
            few_shot_examples=few_shot_examples,
            overall_confidence=overall_confidence,
        )
    
    def _load_all_feedback_sessions(self) -> List[FeedbackSession]:
        """加载所有反馈会话"""
        import json
        
        sessions = []
        
        if not self.feedback_dir.exists():
            logger.warning(f"反馈目录不存在: {self.feedback_dir}")
            return sessions
        
        for feedback_file in self.feedback_dir.glob("feedback_*.json"):
            try:
                with open(feedback_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                session = FeedbackSession(**data)
                sessions.append(session)
                logger.debug(f"加载反馈会话: {session.session_id}")
            except Exception as e:
                logger.error(f"加载反馈失败 {feedback_file}: {e}")
        
        logger.info(f"加载了 {len(sessions)} 个反馈会话")
        return sessions
    
    def _extract_all_feedbacks(
        self,
        sessions: List[FeedbackSession]
    ) -> List[TopicFeedback]:
        """提取所有反馈"""
        all_feedbacks = []
        for session in sessions:
            all_feedbacks.extend(session.feedbacks)
        return all_feedbacks
    
    def _find_inconsistent_feedbacks(
        self,
        feedbacks: List[TopicFeedback]
    ) -> List[TopicFeedback]:
        """
        识别不一致的反馈
        
        不一致定义：
        - 系统 must/maybe, 人工 reject
        - 系统 discard, 人工 accept
        """
        inconsistent = []
        
        for fb in feedbacks:
            system_positive = fb.system_decision in ['must', 'maybe']
            human_negative = fb.human_decision == 'reject'
            
            system_negative = fb.system_decision == 'discard'
            human_positive = fb.human_decision == 'accept'
            
            if (system_positive and human_negative) or (system_negative and human_positive):
                inconsistent.append(fb)
        
        logger.info(f"发现 {len(inconsistent)} 个不一致案例")
        return inconsistent
    
    def _optimize_thresholds(
        self,
        feedbacks: List[TopicFeedback],
        current_config: dict,
    ) -> Optional[ThresholdOptimization]:
        """
        优化阈值
        
        策略：
        - 统计人工 reject 的主题平均分
        - 统计人工 accept 的主题平均分
        - 调整阈值以减少误报
        """
        if len(feedbacks) < 5:
            return None
        
        # 提取当前阈值
        scoring_cfg = current_config.get('auto_topic', {}).get('scoring', {})
        current_must = scoring_cfg.get('threshold_must_publish', 70.0)
        current_maybe = scoring_cfg.get('threshold_maybe_publish', 55.0)
        
        # 统计 reject 和 accept 的分数
        reject_scores = [
            fb.system_score for fb in feedbacks
            if fb.human_decision == 'reject'
        ]
        
        accept_scores = [
            fb.system_score for fb in feedbacks
            if fb.human_decision == 'accept'
        ]
        
        if not reject_scores:
            logger.info("没有 reject 反馈，不调整阈值")
            return None
        
        # 计算平均分
        reject_mean = statistics.mean(reject_scores)
        reject_std = statistics.stdev(reject_scores) if len(reject_scores) > 1 else 0
        
        # 建议阈值：拒绝分数均值 + 0.5个标准差
        suggested_maybe = min(reject_mean + 0.5 * reject_std, 75.0)
        suggested_maybe = max(suggested_maybe, current_maybe)  # 不降低阈值
        
        suggested_must = max(suggested_maybe + 10, current_must)
        
        # 限制调整幅度
        adjustment_maybe = suggested_maybe - current_maybe
        adjustment_must = suggested_must - current_must
        
        if adjustment_maybe < 2.0:
            # 调整幅度太小，不值得改
            return None
        
        # 置信度：基于样本数
        confidence = min(len(reject_scores) / 20.0, 1.0)
        
        reason = (
            f"人工拒绝的主题平均分为 {reject_mean:.1f}±{reject_std:.1f}，"
            f"建议提高阈值以减少误报"
        )
        
        return ThresholdOptimization(
            current_must_publish=current_must,
            current_maybe_publish=current_maybe,
            suggested_must_publish=suggested_must,
            suggested_maybe_publish=suggested_maybe,
            adjustment_must=adjustment_must,
            adjustment_maybe=adjustment_maybe,
            confidence=confidence,
            reason=reason,
        )
    
    def _optimize_weights(
        self,
        inconsistent_feedbacks: List[TopicFeedback],
        current_config: dict,
    ) -> List[WeightOptimization]:
        """
        优化权重
        
        策略：
        - 分析被拒绝主题在哪些维度得分异常高
        - 分析被接受主题在哪些维度得分偏低
        - 调整权重
        """
        if len(inconsistent_feedbacks) < 3:
            return []
        
        scoring_cfg = current_config.get('auto_topic', {}).get('scoring', {})
        
        # 维度列表
        dimensions = [
            'archetype_mean_max',
            'personal_impact_max',
            'counter_intuitive_max',
            'trend_max',
            'time_max',
            'persona_max',
            'history_echo_max',
            'continuity_max',
            'data_enrichable_max',
            'follow_up_max',
        ]
        
        # 统计每个维度的误报情况
        dimension_stats = {}
        
        for dim in dimensions:
            # 移除 _max 后缀得到 score_breakdown 中的 key
            score_key = dim.replace('_max', '')
            
            # 收集误报（系统认为好，人工拒绝）
            false_positive_scores = []
            for fb in inconsistent_feedbacks:
                if fb.human_decision == 'reject' and score_key in fb.score_breakdown:
                    false_positive_scores.append(fb.score_breakdown[score_key])
            
            if false_positive_scores:
                dimension_stats[dim] = {
                    'mean': statistics.mean(false_positive_scores),
                    'count': len(false_positive_scores),
                    'current_max': scoring_cfg.get(dim, 10.0),
                }
        
        # 生成优化建议
        optimizations = []
        
        for dim, stats in dimension_stats.items():
            current_max = stats['current_max']
            mean_score = stats['mean']
            count = stats['count']
            
            # 如果误报平均分超过当前最大值的 50%，建议降低权重
            if mean_score > current_max * 0.5 and count >= 2:
                suggested_max = max(current_max - 3.0, current_max * 0.85)
                adjustment = suggested_max - current_max
                confidence = min(count / 5.0, 1.0)
                
                reason = (
                    f"被拒绝的主题在此维度平均得分 {mean_score:.1f}，"
                    f"占最大值的 {mean_score/current_max*100:.0f}%，"
                    f"建议降低权重"
                )
                
                optimizations.append(WeightOptimization(
                    dimension=dim,
                    current_max=current_max,
                    suggested_max=suggested_max,
                    adjustment=adjustment,
                    confidence=confidence,
                    reason=reason,
                ))
        
        # 按调整幅度排序
        optimizations.sort(key=lambda x: abs(x.adjustment), reverse=True)
        
        return optimizations[:5]  # 最多返回 5 个建议
    
    def _generate_few_shot_examples(
        self,
        inconsistent_feedbacks: List[TopicFeedback],
        max_examples: int = 5,
    ) -> List[FewShotExample]:
        """
        生成 Few-shot 示例
        
        选择标准：
        - 人工反馈有详细原因
        - 不一致程度高
        - 多样性（不同类型的拒绝原因）
        """
        # 按反馈质量排序
        scored_feedbacks = []
        
        for fb in inconsistent_feedbacks:
            # 质量评分
            quality_score = 0
            
            # 有原因
            if fb.feedback_reason and len(fb.feedback_reason) > 10:
                quality_score += 3
            
            # 有标签
            if fb.tags:
                quality_score += len(fb.tags)
            
            # 不一致程度（分数差异）
            if fb.human_decision == 'reject' and fb.system_decision == 'must':
                quality_score += 5  # 高度不一致
            elif fb.human_decision == 'reject' and fb.system_decision == 'maybe':
                quality_score += 3
            
            scored_feedbacks.append((quality_score, fb))
        
        # 排序并选择
        scored_feedbacks.sort(reverse=True, key=lambda x: x[0])
        
        examples = []
        used_tags = set()
        
        for score, fb in scored_feedbacks:
            if len(examples) >= max_examples:
                break
            
            # 多样性：避免重复标签
            if fb.tags:
                tag_set = set(fb.tags)
                if tag_set & used_tags:
                    continue  # 跳过相似的案例
                used_tags.update(tag_set)
            
            examples.append(FewShotExample(
                title=fb.topic_snapshot.get('title', ''),
                system_decision=fb.system_decision.upper(),
                system_score=fb.system_score,
                human_decision=fb.human_decision.upper(),
                feedback_reason=fb.feedback_reason,
                tags=fb.tags,
            ))
        
        return examples
    
    def _calculate_overall_confidence(
        self,
        total_feedbacks: int,
        inconsistent_count: int,
    ) -> float:
        """计算整体置信度"""
        # 基于样本数
        sample_confidence = min(total_feedbacks / 30.0, 1.0)
        
        # 基于不一致率（需要足够的不一致案例）
        inconsistency_confidence = min(inconsistent_count / 10.0, 1.0)
        
        return (sample_confidence + inconsistency_confidence) / 2.0
