"""
Tech Innovation Strategy

技术创新策略：面向开发者、技术决策者、创业者
优先考虑技术突破、开源贡献、架构创新等
"""

from __future__ import annotations

from typing import Dict, List, Optional

from .base import BaseTopicStrategy
from src.topic_selection.processing.topic_scoring import TopicScorerConfig


class TechInnovationStrategy(BaseTopicStrategy):
    """技术创新策略"""
    
    @property
    def name(self) -> str:
        return "tech_innovation"
    
    @property
    def description(self) -> str:
        return "面向技术人群的创新话题策略，优先技术突破、开源、架构等"
    
    def get_signal_prompt_template(self) -> str:
        return """分析这条新闻的技术创新价值和行业影响，重点关注技术突破、开源贡献、架构创新、行业标准等。

【重要】优先评估技术先进性、创新性、对开发者/技术决策者的价值。民生类、消费类新闻如果技术含量不高，需要降低分数。

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
- archetypes: 每个母型0-3分，0=不相关，3=强相关。**对"技术突破、开源贡献、架构创新、性能提升"有价值的题材要给更高分；纯民生/消费类若技术含量不高，要降低分数。**
  - change_happening: 变化正在发生（**技术变革、标准更新、范式转移**）
  - personal_impact: 影响到听众（**对开发者工作流、技术栈的影响**）
  - competition_conflict: 输赢/冲突/竞争格局（**技术路线之争、生态竞争**）
  - risk_opportunity: 风险或机会（**技术债、迁移成本、新机会**）
  - counter_intuitive: 反直觉/争议/颠覆认知（**技术上的反常识、创新思路**）
  - inflection_trend: 趋势拐点（**技术趋势、采用率拐点**）
- continuity: 非一次性（0=一次性事件，1=持续事件/系列）
- why_now: 时机性（0=随时可说，1=现在必须说）
- data_enrichable: 可补充历史/对比/数据（0=无法补充，1=易补充，**技术指标、benchmark**）
- follow_up_potential: 可跟进性（0=无后续，1=有明确后续，**版本迭代、生态发展**）
- entities: 提取关键实体（人名/公司/产品/地点/技术名称）
- why_now_reason: 一句话说明时机"""
    
    def get_scorer_config(self) -> TopicScorerConfig:
        """技术策略打分配置
        
        特点：
        - 提高 archetype_mean 权重（技术母型占优）
        - 降低 personal_impact 权重（不强调民生影响）
        - 提高 trend 权重（技术趋势重要）
        - 提高 structure_bonus（技术文档完整性重要）
        """
        return TopicScorerConfig(
            # 内容价值分 (0-60)
            archetype_mean_max=45.0,      # 提高：技术母型占优
            personal_impact_max=5.0,      # 降低：不强调民生
            counter_intuitive_max=10.0,   # 保持
            # 代理信号分 (0-25)
            trend_max=15.0,               # 提高：技术趋势重要
            time_max=5.0,                 # 保持
            persona_max=3.0,              # 降低：人群匹配次要
            history_echo_max=2.0,         # 降低
            # 结构加成 (-10 ~ +15)
            continuity_max=6.0,           # 提高：系列技术文重要
            data_enrichable_max=6.0,      # 提高：benchmark数据
            follow_up_max=3.0,            # 保持
            # 阈值 (0-100)
            threshold_must_publish=70.0,
            threshold_maybe_publish=55.0,
        )
    
    def get_persona_whitelist(self) -> Optional[List[str]]:
        """技术策略人群白名单"""
        return [
            "开发者",
            "工程师",
            "架构师",
            "技术决策者",
            "CTO",
            "创业者",
            "极客",
            "研究员",
        ]
    
    def get_persona_penalty_keywords(self) -> List[str]:
        """技术策略人群惩罚关键词"""
        return [
            "普通消费者",
            "家长",
            "老年人",
            "家庭主妇",
        ]
    
    def get_keyword_adjustments(self) -> Dict[str, float]:
        """技术策略关键词调整
        
        加分：开源、模型、框架、性能等
        减分：纯民生、消费类（技术含量低）
        """
        return {
            # 加分关键词（技术相关）
            "开源": +10.0,
            "模型": +8.0,
            "框架": +8.0,
            "API": +5.0,
            "架构": +8.0,
            "算法": +8.0,
            "性能": +5.0,
            "优化": +5.0,
            "SOTA": +10.0,
            "突破": +10.0,
            "创新": +5.0,
            "benchmark": +8.0,
            "开发者": +5.0,
            "工具链": +5.0,
            "SDK": +5.0,
            "库": +5.0,
            "训练": +5.0,
            "推理": +5.0,
            "部署": +3.0,
            "基准": +5.0,
            "标准": +5.0,
            "协议": +3.0,
            
            # 减分关键词（纯民生，技术含量低）
            "优惠": -5.0,
            "促销": -5.0,
            "打折": -5.0,
            "便宜": -5.0,
        }


__all__ = ["TechInnovationStrategy"]
