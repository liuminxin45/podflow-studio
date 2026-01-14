"""
Publish Stage Implementation

发布阶段：将生成的音频发布到指定平台
"""

from __future__ import annotations

from pathlib import Path

from src.stages.base import BaseStage
from src.stages.registry import StageRegistry
from src.stages.schemas.publish import (
    PublishInput,
    PublishOutput,
    PublishResult,
    PublishStats,
)


@StageRegistry.register
class PublishStage(BaseStage[PublishInput, PublishOutput]):
    """发布 Stage"""
    
    @property
    def name(self) -> str:
        return "publish"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    @property
    def input_schema(self) -> type[PublishInput]:
        return PublishInput
    
    @property
    def output_schema(self) -> type[PublishOutput]:
        return PublishOutput
    
    def execute(self, input_data: PublishInput) -> PublishOutput:
        """执行发布"""
        run_dir = Path(input_data.run_dir)
        artifacts_dir = run_dir / "6_publish"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        
        cfg = input_data.publish_config
        results = []
        
        rendered_path = input_data.audio_paths.rendered
        if not rendered_path:
            self.logger.warning("没有渲染音频，跳过发布")
            return PublishOutput(
                run_id=input_data.run_id,
                episode_date=input_data.episode_date,
                artifacts_dir=str(artifacts_dir),
                results=[],
                stats=PublishStats(
                    run_id=input_data.run_id,
                    episode_date=input_data.episode_date,
                    run_dir=input_data.run_dir,
                ),
            )
        
        rendered_path = Path(rendered_path)
        if not rendered_path.exists():
            raise RuntimeError(f"渲染音频不存在: {rendered_path}")
        
        published_path = None
        
        # 本地发布
        if cfg.local_enabled:
            from src.publish.local import publish_local
            
            try:
                published_path = publish_local(
                    rendered_audio_path=rendered_path,
                    episodes_dir=artifacts_dir,
                    episode_date=input_data.episode_date,
                    title=input_data.title,
                    shownotes=input_data.shownotes,
                    tags=input_data.tags,
                )
                
                results.append(PublishResult(
                    run_id=input_data.run_id,
                    episode_date=input_data.episode_date,
                    run_dir=input_data.run_dir,
                    platform="local",
                    success=True,
                    url=str(published_path),
                ))
                
                self.logger.info(f"本地发布成功: {published_path}")
                
            except Exception as e:
                results.append(PublishResult(
                    run_id=input_data.run_id,
                    episode_date=input_data.episode_date,
                    run_dir=input_data.run_dir,
                    platform="local",
                    success=False,
                    error=str(e),
                ))
                self.logger.error(f"本地发布失败: {e}")
        
        # 远程发布（如果启用）
        if cfg.remote_enabled:
            for platform in cfg.platforms:
                try:
                    # TODO: 实现各平台的发布逻辑
                    self.logger.info(f"远程发布到 {platform}（待实现）")
                    results.append(PublishResult(
                        run_id=input_data.run_id,
                        episode_date=input_data.episode_date,
                        run_dir=input_data.run_dir,
                        platform=platform,
                        success=False,
                        error="Not implemented",
                    ))
                except Exception as e:
                    results.append(PublishResult(
                        run_id=input_data.run_id,
                        episode_date=input_data.episode_date,
                        run_dir=input_data.run_dir,
                        platform=platform,
                        success=False,
                        error=str(e),
                    ))
        
        succeeded = sum(1 for r in results if r.success)
        failed = sum(1 for r in results if not r.success)
        
        return PublishOutput(
            run_id=input_data.run_id,
            episode_date=input_data.episode_date,
            artifacts_dir=str(artifacts_dir),
            published_path=str(published_path) if published_path else None,
            results=results,
            stats=PublishStats(
                run_id=input_data.run_id,
                episode_date=input_data.episode_date,
                run_dir=input_data.run_dir,
                platforms_attempted=len(results),
                platforms_succeeded=succeeded,
                platforms_failed=failed,
            ),
        )
