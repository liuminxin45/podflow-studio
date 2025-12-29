"""
Life Consumer Gate Policy

国内生活消费赛道的 LLM Gate 策略
"""

from __future__ import annotations

from typing import Any, Dict

from src.tracks.base import GatePolicy


class LifeConsumerGatePolicy(GatePolicy):
    """国内生活消费 Gate 策略
    
    特点：
    - 强调"对听众生活的实际影响"
    - 关注"可操作性"（听完能做什么）
    - 避免过度严格，保留有价值的民生话题
    """
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
    
    def get_system_prompt(self) -> str:
        return """你是生活消费类播客的选题编辑，负责决策哪些主题值得做成播客。

评估标准：
1. 生活相关性：是否与听众的日常生活密切相关（衣食住行、工作学习、健康安全）
2. 实用价值：听众听完能获得什么（省钱、避坑、维权、决策参考）
3. 时效性：是否现在就该讲（新政策、价格变动、安全警示）
4. 可讨论性：是否有足够素材和角度展开

注意：
- 单条新闻不等于数据不足，重要民生事件值得深度解读
- 价格变动、政策调整、安全事故等都是高价值话题
- 即使有争议，只要对听众有价值就应该讲
- 保持平衡的标准，不要过度严格"""
    
    def get_user_prompt_template(self) -> str:
        return """评估这个主题是否值得做成生活消费类播客。

【主题】{title}
【实体】{entities}
【包含新闻数】{items_count}（注：单条重要新闻也值得深度解读）
【主题总分】{topic_score:.1f}/100

【分数构成】
{score_breakdown}

【代表性新闻样本】
{sample_items}

输出JSON格式：
```json
{{
  "should_publish": true|false,
  "publish_priority": 5-1,
  "target_audience": ["普通消费者", "家长", "上班族", "老年人"],
  "core_hook": "一句话说明为什么值得听（强调实用价值）",
  "risk": "无聊/争议/数据不足/无"
}}
```

决策要点：
- should_publish: 是否值得播（关注实用价值）
- publish_priority: 5=最高优先级（影响大、时效强），1=最低优先级
- target_audience: 谁会感兴趣
- core_hook: 用一句话说明为什么值得听（强调能帮听众做什么）
- risk: 潜在风险或问题"""
    
    def get_gate_config(self) -> Dict[str, Any]:
        return {
            "top_n": 10,
            "fallback_to_score": True,
        }
