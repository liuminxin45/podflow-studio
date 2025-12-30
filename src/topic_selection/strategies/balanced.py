"""
Balanced Strategy

平衡策略：兼顾技术创新和民生价值
适用于综合性播客，既关注技术趋势也关注生活应用
"""

from __future__ import annotations

from typing import Dict, List, Optional

from .base import BaseTopicStrategy
from src.topic_selection.processing.topic_scoring import TopicScorerConfig


class BalancedStrategy(BaseTopicStrategy):
    """平衡策略"""
    
    @property
    def name(self) -> str:
        return "balanced"
    
    @property
    def description(self) -> str:
        return "平衡技术与民生的综合策略，兼顾创新性和实用性"
    
    def get_signal_prompt_template(self) -> str:
        return """分析这条新闻的听众价值，兼顾技术创新性和对普通人的实际影响。

【评估维度】
1. 技术价值：是否有技术突破、创新、行业影响
2. 民生价值：是否改善生活、消费体验、安全健康
3. 综合价值：技术如何服务于生活，创新如何落地应用

【标题】{title}
【内容】{content}

输出JSON格式：
```json
{{
  "archetypes": {{
    "change_happening": 0-3,
    "personal_impact": 0-3,
    "competition_conflict": 0-3,
    "risk_opportunity": 0-3,
    "counter_intuitive": 0-3,
    "inflection_trend": 0-3
  }},
  "continuity": 0-1,
  "why_now": 0-1,
  "data_enrichable": 0-1,
  "follow_up_potential": 0-1,
  "entities": ["实体1", "实体2"],
  "why_now_reason": "为什么现在值得关注"
}}
```

评分标准：
- archetypes: 每个母型0-3分，0=不相关，3=强相关。**平衡考虑技术创新性和民生实用性，两者兼具的题材优先。**
  - change_happening: 变化正在发生（技术/政策/市场变化）
  - personal_impact: 影响到听众（工作/生活/消费，技术人群和普通人群都考虑）
  - competition_conflict: 输赢/冲突/竞争格局
  - risk_opportunity: 风险或机会
  - counter_intuitive: 反直觉/争议/颠覆认知
  - inflection_trend: 趋势拐点
- continuity: 非一次性（0=一次性事件，1=持续事件/系列）
- why_now: 时机性（0=随时可说，1=现在必须说）
- data_enrichable: 可补充历史/对比/数据（0=无法补充，1=易补充）
- follow_up_potential: 可跟进性（0=无后续，1=有明确后续）
- entities: 提取关键实体（人名/公司/产品/地点）
- why_now_reason: 一句话说明时机"""
    
    def get_scorer_config(self) -> TopicScorerConfig:
        """平衡策略打分配置
        
        特点：
        - archetype_mean 和 personal_impact 权重均衡
        - 各项代理信号权重适中
        - structure_bonus 适中
        """
        return TopicScorerConfig(
            # 内容价值分 (0-60)
            archetype_mean_max=35.0,      # 中等：平衡技术和民生
            personal_impact_max=15.0,     # 中等：重视但不过分
            counter_intuitive_max=10.0,   # 保持
            # 代理信号分 (0-25)
            trend_max=10.0,               # 中等
            time_max=5.0,                 # 保持
            persona_max=7.0,              # 中等：兼顾多人群
            history_echo_max=3.0,         # 中等
            # 结构加成 (-10 ~ +15)
            continuity_max=5.0,           # 中等
            data_enrichable_max=5.0,      # 中等
            follow_up_max=3.0,            # 保持
            # 阈值 (0-100)
            threshold_must_publish=70.0,
            threshold_maybe_publish=55.0,
        )
    
    def get_persona_whitelist(self) -> Optional[List[str]]:
        """平衡策略不限制人群"""
        return None
    
    def get_persona_penalty_keywords(self) -> List[str]:
        """平衡策略不惩罚任何人群"""
        return []
    
    def get_keyword_adjustments(self) -> Dict[str, float]:
        """平衡策略关键词调整
        
        适度加分：技术+应用结合的关键词
        不做极端调整
        """
        return {
            # 技术应用结合（加分）
            "AI应用": +5.0,
            "智能": +3.0,
            "便利": +3.0,
            "效率": +3.0,
            "创新": +3.0,
            "突破": +5.0,
            "实用": +3.0,
            "落地": +3.0,
            
            # 极端技术或极端民生（略减分，鼓励平衡）
            "纯理论": -3.0,
            "学术": -3.0,
        }


__all__ = ["BalancedStrategy"]
