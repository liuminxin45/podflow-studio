"""
Episode Pipeline

Episode 主流程编排：Fetch → Cluster → Selection → Research → Script → Audio → Publish
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from src.app.pipelines.steps import (
    FetchStep,
    ClusterStep,
    SelectionStep,
    ResearchStep,
    ScriptStep,
    AudioStep,
    PublishStep,
)

if TYPE_CHECKING:
    from src.app.context import EpisodeContext


class EpisodePipeline:
    """Episode 主流程 Pipeline"""
    
    def __init__(self):
        self.logger = logging.getLogger("app.episode_pipeline")
        
        # 定义步骤顺序
        self.steps = [
            FetchStep(),
            ClusterStep(),
            SelectionStep(),
            ResearchStep(),
            ScriptStep(),
            AudioStep(),
            PublishStep(),
        ]
    
    def run(self, ctx: EpisodeContext) -> EpisodeContext:
        """运行完整的 Episode Pipeline
        
        Args:
            ctx: Episode 上下文
            
        Returns:
            更新后的 Episode 上下文
            
        Raises:
            Exception: 任何步骤执行失败
        """
        self.logger.info("=" * 80)
        self.logger.info(f"开始执行 Episode Pipeline: {ctx.episode_id}")
        self.logger.info("=" * 80)
        
        try:
            # 按顺序执行所有步骤
            for step in self.steps:
                step.run(ctx)
            
            # 标记完成
            ctx.mark_completed()
            self.logger.info("=" * 80)
            self.logger.info(f"Episode Pipeline 执行完成: {ctx.episode_id}")
            self.logger.info("=" * 80)
            
        except Exception as e:
            # 标记失败
            ctx.mark_failed(str(e))
            self.logger.error(f"Episode Pipeline 执行失败: {e}")
            raise
        
        return ctx
