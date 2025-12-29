"""
AI Apps Track Implementation

AI应用赛道实现（预留骨架）
"""

from __future__ import annotations

from typing import Any, Dict

from src.tracks.base import Track, FilterPolicy, ScoringPolicy, GatePolicy, ScriptStyle


class AIAppsFilterPolicy(FilterPolicy):
    """AI应用过滤策略（待实现）"""
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
        self.priority_keywords = [
            "AI", "人工智能", "大模型", "ChatGPT", "豆包",
            "AI眼镜", "AI手机", "智能硬件",
        ]
    
    def should_include_item(self, item: dict) -> bool:
        text = f"{item.get('title', '')} {item.get('content', '')}".lower()
        return any(kw in text for kw in self.priority_keywords)
    
    def get_priority_keywords(self):
        return self.priority_keywords


class AIAppsScoringPolicy(ScoringPolicy):
    """AI应用打分策略（待实现）"""
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
    
    def get_scoring_config(self) -> Dict[str, Any]:
        return {
            "threshold_must_publish": 70.0,
            "threshold_maybe_publish": 55.0,
        }
    
    def adjust_score(self, topic: Any, base_score: float) -> float:
        return base_score


class AIAppsGatePolicy(GatePolicy):
    """AI应用 Gate 策略（待实现）"""
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
    
    def get_system_prompt(self) -> str:
        return "你是AI应用类播客的选题编辑（待完善）"
    
    def get_user_prompt_template(self) -> str:
        return "评估AI应用主题（待完善）"
    
    def get_gate_config(self) -> Dict[str, Any]:
        return {"top_n": 10, "fallback_to_score": True}


class AIAppsScriptStyle(ScriptStyle):
    """AI应用脚本风格（待实现）"""
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
    
    def get_style_name(self) -> str:
        return "ai_apps_tech"
    
    def get_narration_guidelines(self) -> str:
        return "AI应用脚本风格（待完善）"
    
    def get_section_structure(self):
        return ["开场", "产品介绍", "技术分析", "使用体验", "总结"]


class AIAppsTrack(Track):
    """AI应用赛道（预留骨架）"""
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
        self._filter_policy = AIAppsFilterPolicy(options)
        self._scoring_policy = AIAppsScoringPolicy(options)
        self._gate_policy = AIAppsGatePolicy(options)
        self._script_style = AIAppsScriptStyle(options)
    
    def get_name(self) -> str:
        return "ai_apps"
    
    def get_description(self) -> str:
        return "AI应用赛道：关注AI软硬件产品、技术、生态（预留骨架）"
    
    def get_filter_policy(self) -> FilterPolicy:
        return self._filter_policy
    
    def get_scoring_policy(self) -> ScoringPolicy:
        return self._scoring_policy
    
    def get_gate_policy(self) -> GatePolicy:
        return self._gate_policy
    
    def get_script_style(self) -> ScriptStyle:
        return self._script_style
