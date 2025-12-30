"""
Research Step

研究步骤：对选中的内容进行深度研究（可选）
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.app.pipelines.base_step import BaseStep

if TYPE_CHECKING:
    from src.app.core.context import EpisodeContext


class ResearchStep(BaseStep):
    """研究步骤"""
    
    def execute(self, ctx: EpisodeContext) -> None:
        """执行 Research 步骤
        
        注：当前版本暂时跳过 research，后续可根据需要补充
        """
        self.logger.info("Research 步骤（当前版本跳过）")
        ctx.research_results = []
        ctx.add_event("research_skipped")
