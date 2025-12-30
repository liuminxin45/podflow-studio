"""
Orchestrator

主编排器：负责构建 EpisodeContext 并调用 EpisodePipeline
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from src.app.core.context import EpisodeContext
from src.app.pipelines.episode_pipeline import EpisodePipeline
from src.tracks import TrackRegistry


def run_episode(
    episode_id: str,
    episode_date: str,
    config: Dict[str, Any],
    output_dir: Path,
) -> EpisodeContext:
    """运行一个 Episode
    
    Args:
        episode_id: Episode ID (例如: "life-consumer:2025-12-29")
        episode_date: Episode 日期 (例如: "2025-12-29")
        config: 完整配置字典
        output_dir: 输出目录
        
    Returns:
        执行完成的 EpisodeContext
        
    Raises:
        Exception: Pipeline 执行失败
    """
    logger = logging.getLogger("app.orchestrator")
    
    # 生成 run_id
    run_id = datetime.now().strftime("%H%M%S_%f")[:13]
    
    # 创建 run 目录
    run_dir = output_dir / "runs" / episode_date.replace("-", "") / f"{run_id}_{episode_id.split(':')[0][:6]}"
    run_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"创建 Episode Context: {episode_id}")
    logger.info(f"Run ID: {run_id}")
    logger.info(f"Run Dir: {run_dir}")
    
    # 加载 Track
    track_cfg = config.get("track", {})
    track_name = track_cfg.get("name", "life_consumer")
    track_options = track_cfg.get("options", {})
    
    try:
        track = TrackRegistry.get(track_name, track_options)
        logger.info(f"加载 Track: {track.get_name()} - {track.get_description()}")
    except ValueError as e:
        logger.warning(f"Track 加载失败: {e}，使用默认 life_consumer")
        track = TrackRegistry.get("life_consumer", {})
    
    # 构建 EpisodeContext
    ctx = EpisodeContext(
        episode_id=episode_id,
        episode_date=episode_date,
        run_id=run_id,
        config=config,
        track=track,
        output_dir=output_dir,
        run_dir=run_dir,
    )
    
    # 运行 Pipeline
    pipeline = EpisodePipeline()
    ctx = pipeline.run(ctx)
    
    return ctx
