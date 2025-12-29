"""
Life Consumer Track Implementation

国内生活消费赛道实现
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from src.tracks.base import Track, FilterPolicy, ScoringPolicy, GatePolicy, ScriptStyle
from src.tracks.life_consumer.filter_policy import LifeConsumerFilterPolicy
from src.tracks.life_consumer.scoring_policy import LifeConsumerScoringPolicy
from src.tracks.life_consumer.gate_policy import LifeConsumerGatePolicy
from src.tracks.life_consumer.script_style import LifeConsumerScriptStyle


class LifeConsumerTrack(Track):
    """国内生活消费赛道
    
    关注：
    - 民生政策（医疗、教育、住房、就业）
    - 消费市场（价格、产品、服务、维权）
    - 公共安全（食品、交通、灾害、犯罪）
    - 社会热点（舆论、文化、娱乐）
    """
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
        self._filter_policy = LifeConsumerFilterPolicy(options)
        self._scoring_policy = LifeConsumerScoringPolicy(options)
        self._gate_policy = LifeConsumerGatePolicy(options)
        self._script_style = LifeConsumerScriptStyle(options)
    
    def get_name(self) -> str:
        return "life_consumer"
    
    def get_description(self) -> str:
        return "国内生活消费赛道：关注民生、消费、政策、安全等与普通人生活密切相关的话题"
    
    def get_filter_policy(self) -> FilterPolicy:
        return self._filter_policy
    
    def get_scoring_policy(self) -> ScoringPolicy:
        return self._scoring_policy
    
    def get_gate_policy(self) -> GatePolicy:
        return self._gate_policy
    
    def get_script_style(self) -> ScriptStyle:
        return self._script_style
