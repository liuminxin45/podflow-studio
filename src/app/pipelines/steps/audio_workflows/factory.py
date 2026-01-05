"""
Audio Workflow Factory

工作流工厂，根据配置创建对应的工作流实例
"""

from typing import TYPE_CHECKING

from .base import AudioWorkflow
from .segmented_workflow import SegmentedWorkflow
from .unified_workflow import UnifiedWorkflow

if TYPE_CHECKING:
    import logging


class WorkflowFactory:
    """音频工作流工厂"""
    
    @staticmethod
    def create_workflow(mode: str, config: dict, logger: "logging.Logger") -> AudioWorkflow:
        """
        创建工作流实例
        
        Args:
            mode: 工作流模式 (segmented | unified)
            config: 音频配置字典
            logger: 日志记录器
            
        Returns:
            AudioWorkflow: 工作流实例
            
        Raises:
            ValueError: 未知的工作流模式
        """
        mode = mode.lower().strip()
        
        if mode == "segmented":
            logger.info("创建分段音频工作流 (Segmented Workflow)")
            return SegmentedWorkflow(config, logger)
        elif mode == "unified":
            logger.info("创建统一音频工作流 (Unified Workflow)")
            return UnifiedWorkflow(config, logger)
        else:
            raise ValueError(
                f"未知的音频工作流模式: {mode}. "
                f"支持的模式: segmented, unified"
            )
    
    @staticmethod
    def get_available_modes() -> list[str]:
        """获取所有可用的工作流模式"""
        return ["segmented", "unified"]
