"""
Publish Step

发布步骤
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from src.app.pipelines.base_step import BaseStep
from src.publish.local import publish_local

if TYPE_CHECKING:
    from src.app.core.context import EpisodeContext


class PublishStep(BaseStep):
    """发布步骤"""
    
    def execute(self, ctx: EpisodeContext) -> None:
        """执行 Publish 步骤"""
        if not ctx.audio_paths or "rendered" not in ctx.audio_paths:
            self.logger.warning("没有渲染音频，跳过发布")
            ctx.publish_result = {}
            return
        
        self.logger.info("开始发布...")
        
        # 获取渲染音频路径
        rendered_path = Path(ctx.audio_paths["rendered"])
        if not rendered_path.exists():
            raise RuntimeError(f"渲染音频不存在: {rendered_path}")
        
        # 准备发布目录
        publish_dir = ctx.run_dir / "5_publish"
        publish_dir.mkdir(parents=True, exist_ok=True)
        
        # 获取脚本输出信息
        script_output = ctx.script_output or {}
        title = script_output.get("title", "")
        shownotes = script_output.get("shownotes", "")
        tags = script_output.get("tags", [])
        
        # 发布到本地
        published_path = publish_local(
            rendered_audio_path=rendered_path,
            episodes_dir=publish_dir,
            episode_date=ctx.episode_date,
            title=title,
            shownotes=shownotes,
            tags=tags,
        )
        
        ctx.publish_result = {
            "published_path": str(published_path),
            "title": title,
            "tags": tags,
        }
        
        self.logger.info(f"发布完成: {published_path}")
        ctx.add_event("published",
                     published_path=str(published_path),
                     title=title)
