"""
Script Merger

脚本合并工具，将多个段落脚本合并为一个完整脚本
"""

from __future__ import annotations

from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from src.models.segment import SegmentScript


class ScriptMerger:
    """脚本合并工具"""
    
    def __init__(self, config: dict):
        """
        初始化脚本合并器
        
        Args:
            config: unified模式配置
        """
        self.config = config
        self.strategy = config.get("merge_strategy", "simple")
        self.transition_text = config.get("transition_text", "\n\n")
        self.add_pauses = config.get("add_pauses", True)
        self.pause_duration_ms = config.get("pause_duration_ms", 800)
        self.use_ssml = config.get("use_ssml", False)
    
    def merge(self, segments: List["SegmentScript"]) -> str:
        """
        合并多个脚本段落
        
        Args:
            segments: 脚本段落列表
            
        Returns:
            str: 合并后的完整脚本
        """
        if not segments:
            return ""
        
        if self.strategy == "simple":
            return self._simple_merge(segments)
        elif self.strategy == "smart":
            return self._smart_merge(segments)
        else:
            return self._simple_merge(segments)
    
    def _simple_merge(self, segments: List["SegmentScript"]) -> str:
        """
        简单合并：用过渡文本连接
        
        Args:
            segments: 脚本段落列表
            
        Returns:
            str: 合并后的脚本
        """
        parts = []
        
        for i, segment in enumerate(segments):
            parts.append(segment.text.strip())
            
            # 在段落间添加过渡（最后一个段落除外）
            if i < len(segments) - 1:
                if self.add_pauses:
                    parts.append(self._create_pause_mark())
                else:
                    parts.append(self.transition_text)
        
        return "".join(parts)
    
    def _smart_merge(self, segments: List["SegmentScript"]) -> str:
        """
        智能合并：根据段落类型添加不同过渡
        
        Args:
            segments: 脚本段落列表
            
        Returns:
            str: 合并后的脚本
        """
        parts = []
        
        for i, segment in enumerate(segments):
            parts.append(segment.text.strip())
            
            # 根据段落类型决定过渡方式
            if i < len(segments) - 1:
                next_segment = segments[i + 1]
                transition = self._get_transition(segment, next_segment)
                parts.append(transition)
        
        return "".join(parts)
    
    def _get_transition(self, current: "SegmentScript", next_seg: "SegmentScript") -> str:
        """
        根据段落类型获取过渡文本
        
        Args:
            current: 当前段落
            next_seg: 下一个段落
            
        Returns:
            str: 过渡文本
        """
        # 段落类型映射到过渡策略
        transitions = {
            ("OPENING", "HISTORY"): self._create_pause_mark(1000),  # 开场到历史：长停顿
            ("HISTORY", "DETAIL_NEWS"): self._create_pause_mark(1200),  # 历史到快讯：长停顿
            ("DETAIL_NEWS", "DEEP_DIVE"): self._create_pause_mark(1000),  # 快讯到深度：长停顿
            ("DEEP_DIVE", "CLOSING"): self._create_pause_mark(800),  # 深度到结尾：中等停顿
        }
        
        key = (current.type, next_seg.type)
        return transitions.get(key, self._create_pause_mark())
    
    def _create_pause_mark(self, duration_ms: int = None) -> str:
        """
        创建停顿标记
        
        Args:
            duration_ms: 停顿时长（毫秒），None则使用配置值
            
        Returns:
            str: 停顿标记（SSML或纯文本）
        """
        if duration_ms is None:
            duration_ms = self.pause_duration_ms
        
        if self.use_ssml:
            return f'<break time="{duration_ms}ms"/>'
        else:
            # 纯文本模式：使用换行作为停顿提示
            return self.transition_text
    
    def compute_cache_key(self, segments: List["SegmentScript"]) -> str:
        """
        计算合并脚本的缓存键
        
        Args:
            segments: 脚本段落列表
            
        Returns:
            str: 缓存键（MD5哈希）
        """
        import hashlib
        
        # 将所有段落文本和配置组合成字符串
        content = ""
        for segment in segments:
            content += f"{segment.id}:{segment.text}\n"
        
        # 添加配置参数到缓存键
        content += f"strategy:{self.strategy}\n"
        content += f"pause:{self.pause_duration_ms}\n"
        
        # 计算MD5哈希
        return hashlib.md5(content.encode("utf-8")).hexdigest()
