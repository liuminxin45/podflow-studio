"""
Life Consumer Scoring Policy

国内生活消费赛道的打分策略
"""

from __future__ import annotations

from typing import Any, Dict

from src.tracks.base import ScoringPolicy


class LifeConsumerScoringPolicy(ScoringPolicy):
    """国内生活消费打分策略
    
    特点：
    - 强调个人影响（personal_impact）权重
    - 降低阈值，让更多民生话题通过
    - 对"价格变动"、"政策调整"等给予加分
    """
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
    
    def get_scoring_config(self) -> Dict[str, Any]:
        """获取打分配置"""
        return {
            # 内容价值分 (0-60)
            "archetype_mean_max": 40.0,
            "personal_impact_max": 10.0,
            "counter_intuitive_max": 10.0,
            # 代理信号分 (0-25)
            "trend_max": 10.0,
            "time_max": 5.0,
            "persona_max": 5.0,
            "history_echo_max": 5.0,
            # 结构加成 (-10 ~ +15)
            "continuity_max": 6.0,
            "data_enrichable_max": 6.0,
            "follow_up_max": 3.0,
            # 阈值 (0-100) - 生活消费赛道降低阈值
            "threshold_must_publish": 65.0,  # 从 70 降到 65
            "threshold_maybe_publish": 50.0,  # 从 55 降到 50
        }
    
    def adjust_score(self, topic: Any, base_score: float) -> float:
        """根据 Track 特性调整分数"""
        adjusted_score = base_score
        
        # 获取 topic 信息
        title = topic.title if hasattr(topic, "title") else ""
        entities = topic.entities if hasattr(topic, "entities") else []
        
        # 加分项：价格相关
        if any(keyword in title for keyword in ["价格", "涨价", "降价", "便宜", "贵"]):
            adjusted_score += 5.0
        
        # 加分项：政策相关
        if any(keyword in title for keyword in ["政策", "新规", "法规", "通知"]):
            adjusted_score += 5.0
        
        # 加分项：安全相关
        if any(keyword in title for keyword in ["安全", "事故", "火灾", "地震"]):
            adjusted_score += 3.0
        
        # 加分项：维权相关
        if any(keyword in title for keyword in ["维权", "投诉", "曝光", "处罚"]):
            adjusted_score += 3.0
        
        # 确保不超过 100
        return min(adjusted_score, 100.0)
