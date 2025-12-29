"""
Track Base Classes

Track 抽象基类和策略接口定义
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class FilterPolicy(ABC):
    """内容过滤策略"""
    
    @abstractmethod
    def should_include_item(self, item: dict) -> bool:
        """判断 item 是否应该被包含
        
        Args:
            item: 新闻 item
            
        Returns:
            True 表示保留，False 表示过滤掉
        """
        pass
    
    @abstractmethod
    def get_priority_keywords(self) -> List[str]:
        """获取优先级关键词列表"""
        pass


class ScoringPolicy(ABC):
    """打分策略"""
    
    @abstractmethod
    def get_scoring_config(self) -> Dict[str, Any]:
        """获取打分配置
        
        Returns:
            包含阈值、权重等的配置字典
        """
        pass
    
    @abstractmethod
    def adjust_score(self, topic: Any, base_score: float) -> float:
        """根据 Track 特性调整分数
        
        Args:
            topic: TopicCandidate
            base_score: 基础分数
            
        Returns:
            调整后的分数
        """
        pass


class GatePolicy(ABC):
    """LLM Gate 策略"""
    
    @abstractmethod
    def get_system_prompt(self) -> str:
        """获取 LLM Gate 的 system prompt"""
        pass
    
    @abstractmethod
    def get_user_prompt_template(self) -> str:
        """获取 LLM Gate 的 user prompt 模板"""
        pass
    
    @abstractmethod
    def get_gate_config(self) -> Dict[str, Any]:
        """获取 Gate 配置（top_n, fallback 等）"""
        pass


class ScriptStyle(ABC):
    """脚本风格"""
    
    @abstractmethod
    def get_style_name(self) -> str:
        """获取风格名称"""
        pass
    
    @abstractmethod
    def get_narration_guidelines(self) -> str:
        """获取口播指导"""
        pass
    
    @abstractmethod
    def get_section_structure(self) -> List[str]:
        """获取段落结构"""
        pass


class Track(ABC):
    """Track 抽象基类
    
    每个 Track 代表一个内容赛道，提供该赛道特有的策略
    """
    
    @abstractmethod
    def get_name(self) -> str:
        """获取 Track 名称"""
        pass
    
    @abstractmethod
    def get_description(self) -> str:
        """获取 Track 描述"""
        pass
    
    @abstractmethod
    def get_filter_policy(self) -> FilterPolicy:
        """获取内容过滤策略"""
        pass
    
    @abstractmethod
    def get_scoring_policy(self) -> ScoringPolicy:
        """获取打分策略"""
        pass
    
    @abstractmethod
    def get_gate_policy(self) -> GatePolicy:
        """获取 LLM Gate 策略"""
        pass
    
    @abstractmethod
    def get_script_style(self) -> ScriptStyle:
        """获取脚本风格"""
        pass
    
    def get_sources(self) -> Optional[Dict[str, Any]]:
        """获取该 Track 特有的数据源配置（可选）
        
        Returns:
            None 表示使用全局配置的 sources
        """
        return None


class TrackRegistry:
    """Track 注册表"""
    
    _tracks: Dict[str, type[Track]] = {}
    
    @classmethod
    def register(cls, name: str, track_class: type[Track]):
        """注册一个 Track"""
        cls._tracks[name] = track_class
    
    @classmethod
    def get(cls, name: str, options: Optional[Dict[str, Any]] = None) -> Track:
        """获取一个 Track 实例
        
        Args:
            name: Track 名称
            options: Track 配置选项
            
        Returns:
            Track 实例
            
        Raises:
            ValueError: Track 不存在
        """
        if name not in cls._tracks:
            raise ValueError(f"Track '{name}' not found. Available: {list(cls._tracks.keys())}")
        
        track_class = cls._tracks[name]
        return track_class(options or {})
    
    @classmethod
    def list_available(cls) -> List[str]:
        """列出所有可用的 Track"""
        return list(cls._tracks.keys())
