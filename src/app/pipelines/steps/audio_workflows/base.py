"""
Audio Workflow Base Classes

音频生成工作流的抽象基类和数据模型
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, List, Optional

if TYPE_CHECKING:
    from src.app.core.context import EpisodeContext


@dataclass
class AudioManifest:
    """音频清单数据模型"""
    
    episode_id: str
    final_path: str
    workflow_mode: str
    total_duration_ms: int = 0
    created_at: str = ""
    manifest_path: Optional[str] = None
    
    # 分段模式特有字段
    segments: Optional[List] = None
    bgm: Optional[List] = None
    
    # 统一模式特有字段
    merged_script: Optional[str] = None
    cache_key: Optional[str] = None
    
    def save(self, path: str) -> None:
        """保存manifest到文件"""
        import json
        from pathlib import Path
        
        output_path = Path(path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        data = {
            "episode_id": self.episode_id,
            "final_path": self.final_path,
            "workflow_mode": self.workflow_mode,
            "total_duration_ms": self.total_duration_ms,
            "created_at": self.created_at,
        }
        
        if self.segments:
            data["segments"] = [
                {
                    "segment_id": s.segment_id,
                    "mp3_path": s.mp3_path,
                    "duration_ms": s.duration_ms,
                    "cached": s.cached,
                }
                for s in self.segments
            ]
        
        if self.bgm:
            data["bgm"] = [
                {
                    "name": b.name,
                    "path": b.path,
                    "insert_after": b.insert_after,
                }
                for b in self.bgm
            ]
        
        if self.merged_script:
            data["merged_script_length"] = len(self.merged_script)
        
        if self.cache_key:
            data["cache_key"] = self.cache_key
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        self.manifest_path = str(output_path)


class AudioWorkflow(ABC):
    """音频生成工作流抽象基类"""
    
    def __init__(self, config: dict, logger):
        """
        初始化工作流
        
        Args:
            config: 音频配置字典
            logger: 日志记录器
        """
        self.config = config
        self.logger = logger
    
    @abstractmethod
    def execute(self, ctx: EpisodeContext) -> AudioManifest:
        """
        执行音频生成工作流
        
        Args:
            ctx: Episode上下文，包含脚本段落、配置等
            
        Returns:
            AudioManifest: 音频清单，包含生成的音频路径和元数据
        """
        pass
    
    def validate(self, ctx: EpisodeContext) -> bool:
        """
        验证工作流前置条件
        
        Args:
            ctx: Episode上下文
            
        Returns:
            bool: 是否满足执行条件
        """
        if not hasattr(ctx, 'script_segments') or not ctx.script_segments:
            self.logger.warning("没有脚本段落，无法执行音频生成")
            return False
        return True
    
    def _get_tts_timeout(self, ctx: EpisodeContext) -> int:
        """获取TTS超时时间"""
        return int(ctx.config.get("llm", {}).get("timeout_seconds", 120))
    
    def _get_output_dir(self, ctx: EpisodeContext, subdir: str) -> Path:
        """获取输出目录"""
        output_dir = ctx.run_dir / "4_tts" / subdir
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir
