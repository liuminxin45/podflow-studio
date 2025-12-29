"""
Base Step

所有 Pipeline Step 的基类
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.app.context import EpisodeContext


class BaseStep(ABC):
    """Pipeline Step 基类"""
    
    def __init__(self):
        self.logger = logging.getLogger(f"{self.__class__.__module__}.{self.__class__.__name__}")
    
    @abstractmethod
    def execute(self, ctx: EpisodeContext) -> None:
        """执行步骤
        
        Args:
            ctx: Episode 上下文（可读写）
        
        Raises:
            Exception: 步骤执行失败
        """
        pass
    
    def run(self, ctx: EpisodeContext) -> None:
        """运行步骤（带日志）"""
        step_name = self.__class__.__name__
        self.logger.info(f">>> 开始执行: {step_name}")
        
        try:
            self.execute(ctx)
            self.logger.info(f"<<< 完成执行: {step_name}")
        except Exception as e:
            self.logger.error(f"<<< 执行失败: {step_name} - {e}")
            raise
