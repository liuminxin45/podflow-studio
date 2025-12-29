"""
Headline Track Implementation

头条大新闻赛道实现（预留骨架）
"""

from __future__ import annotations

from typing import Any, Dict

from src.tracks.base import Track, FilterPolicy, ScoringPolicy, GatePolicy, ScriptStyle


class HeadlineFilterPolicy(FilterPolicy):
    """头条过滤策略（待实现）"""
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
        self.priority_keywords = [
            "突发", "重大", "紧急", "地震", "台风", "火灾",
            "政策", "法律", "国际", "战争", "外交",
        ]
    
    def should_include_item(self, item: dict) -> bool:
        text = f"{item.get('title', '')} {item.get('content', '')}".lower()
        return any(kw in text for kw in self.priority_keywords)
    
    def get_priority_keywords(self):
        return self.priority_keywords


class HeadlineScoringPolicy(ScoringPolicy):
    """头条打分策略（待实现）"""
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
    
    def get_scoring_config(self) -> Dict[str, Any]:
        return {
            "threshold_must_publish": 75.0,  # 头条要求更高
            "threshold_maybe_publish": 60.0,
        }
    
    def adjust_score(self, topic: Any, base_score: float) -> float:
        return base_score


class HeadlineGatePolicy(GatePolicy):
    """头条 Gate 策略（待实现）"""
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
    
    def get_system_prompt(self) -> str:
        return "你是头条新闻类播客的选题编辑（待完善）"
    
    def get_user_prompt_template(self) -> str:
        return "评估头条新闻主题（待完善）"
    
    def get_gate_config(self) -> Dict[str, Any]:
        return {"top_n": 10, "fallback_to_score": True}


class HeadlineScriptStyle(ScriptStyle):
    """头条脚本风格（待实现）"""
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
    
    def get_style_name(self) -> str:
        return "headline_breaking"
    
    def get_narration_guidelines(self) -> str:
        return "头条新闻脚本风格（待完善）"
    
    def get_section_structure(self):
        return ["快讯", "背景", "影响", "展望"]


class HeadlineTrack(Track):
    """头条大新闻赛道（预留骨架）"""
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
        self._filter_policy = HeadlineFilterPolicy(options)
        self._scoring_policy = HeadlineScoringPolicy(options)
        self._gate_policy = HeadlineGatePolicy(options)
        self._script_style = HeadlineScriptStyle(options)
    
    def get_name(self) -> str:
        return "headline"
    
    def get_description(self) -> str:
        return "头条大新闻赛道：关注重大突发、政策、国际大事件（预留骨架）"
    
    def get_filter_policy(self) -> FilterPolicy:
        return self._filter_policy
    
    def get_scoring_policy(self) -> ScoringPolicy:
        return self._scoring_policy
    
    def get_gate_policy(self) -> GatePolicy:
        return self._gate_policy
    
    def get_script_style(self) -> ScriptStyle:
        return self._script_style
