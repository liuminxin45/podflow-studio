"""
Stage Orchestrator

编排层：将各个独立 Stage 组织成完整的 Pipeline
支持:
- 完整流程运行
- 从指定 Stage 开始
- 运行到指定 Stage
- 跳过某些 Stage
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from src.stages.base import BaseStage, StageResult, StageStatus
from src.stages.registry import StageRegistry
from src.stages.schemas.common import ItemSchema


class PipelineConfig(BaseModel):
    """Pipeline 配置"""
    episode_id: str
    episode_date: str
    output_dir: str
    config: Dict[str, Any] = Field(default_factory=dict)
    
    # 执行控制
    start_stage: Optional[str] = None  # 从哪个 Stage 开始
    end_stage: Optional[str] = None    # 到哪个 Stage 结束
    skip_stages: List[str] = Field(default_factory=list)  # 跳过哪些 Stage
    
    # 输入覆盖（用于从中间 Stage 开始时提供输入）
    input_override: Optional[Dict[str, Any]] = None
    input_file: Optional[str] = None  # 从文件读取输入


class PipelineResult(BaseModel):
    """Pipeline 执行结果"""
    episode_id: str
    episode_date: str
    run_id: str
    run_dir: str
    status: str  # success / partial / failed
    stages_executed: List[str]
    stages_skipped: List[str]
    stage_results: Dict[str, Dict[str, Any]]  # stage_name -> result summary
    error: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None


class StageOrchestrator:
    """Stage 编排器
    
    管理 Stage 的执行顺序和数据流转
    """
    
    # 默认 Stage 顺序
    DEFAULT_PIPELINE = [
        "fetch",
        "cluster", 
        "selection",
        "research",
        "script",
        "audio",
        "publish",
    ]
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.logger = logging.getLogger("stages.orchestrator")
        
        # 确保所有 Stage 已注册
        self._ensure_stages_registered()
    
    def _ensure_stages_registered(self):
        """确保所有 Stage 已注册"""
        # 导入 impl 模块会触发 @StageRegistry.register 装饰器
        from src.stages.impl import (
            FetchStage,
            ClusterStage,
            SelectionStage,
            ResearchStage,
            ScriptStage,
            AudioStage,
            PublishStage,
        )
    
    def run(self, pipeline_config: PipelineConfig) -> PipelineResult:
        """运行 Pipeline
        
        Args:
            pipeline_config: Pipeline 配置
            
        Returns:
            PipelineResult
        """
        started_at = datetime.now()
        run_id = started_at.strftime("%H%M%S_%f")[:13]
        
        # 创建 run 目录
        output_dir = Path(pipeline_config.output_dir)
        run_dir = output_dir / "runs" / pipeline_config.episode_date.replace("-", "") / f"{run_id}"
        run_dir.mkdir(parents=True, exist_ok=True)
        
        self.logger.info(f">>> Pipeline 开始: {pipeline_config.episode_id}")
        self.logger.info(f"    run_dir: {run_dir}")
        
        # 确定要执行的 Stage
        stages_to_run = self._get_stages_to_run(pipeline_config)
        stages_executed = []
        stages_skipped = []
        stage_results = {}
        
        # 初始化数据流
        current_data = self._prepare_initial_data(pipeline_config, run_id, run_dir)
        
        try:
            for stage_name in self.DEFAULT_PIPELINE:
                if stage_name in pipeline_config.skip_stages:
                    stages_skipped.append(stage_name)
                    self.logger.info(f"    跳过: {stage_name}")
                    continue
                
                if stage_name not in stages_to_run:
                    continue
                
                # 获取 Stage 实例
                stage = StageRegistry.get(stage_name, self.config)
                
                # 准备 Stage 输入
                stage_input = self._prepare_stage_input(
                    stage_name, current_data, run_id, 
                    pipeline_config.episode_date, str(run_dir),
                    pipeline_config.config
                )
                
                # 执行 Stage
                self.logger.info(f">>> 执行: {stage_name}")
                result = stage.run(stage_input)
                
                # 保存结果
                result_path = run_dir / f"{stage_name}_result.json"
                stage.save_result(result, result_path)
                
                stage_results[stage_name] = {
                    "status": result.status.value,
                    "duration_seconds": result.metadata.duration_seconds,
                    "error": result.error,
                }
                
                if result.status == StageStatus.FAILED:
                    raise RuntimeError(f"Stage {stage_name} 失败: {result.error}")
                
                stages_executed.append(stage_name)
                
                # 更新数据流
                if result.output:
                    current_data = self._merge_output(current_data, stage_name, result.output)
            
            # 完成
            completed_at = datetime.now()
            duration = (completed_at - started_at).total_seconds()
            
            self.logger.info(f"<<< Pipeline 完成: {len(stages_executed)} stages, {duration:.1f}s")
            
            return PipelineResult(
                episode_id=pipeline_config.episode_id,
                episode_date=pipeline_config.episode_date,
                run_id=run_id,
                run_dir=str(run_dir),
                status="success",
                stages_executed=stages_executed,
                stages_skipped=stages_skipped,
                stage_results=stage_results,
                started_at=started_at,
                completed_at=completed_at,
                duration_seconds=duration,
            )
            
        except Exception as e:
            completed_at = datetime.now()
            duration = (completed_at - started_at).total_seconds()
            
            self.logger.error(f"<<< Pipeline 失败: {e}")
            
            return PipelineResult(
                episode_id=pipeline_config.episode_id,
                episode_date=pipeline_config.episode_date,
                run_id=run_id,
                run_dir=str(run_dir),
                status="failed",
                stages_executed=stages_executed,
                stages_skipped=stages_skipped,
                stage_results=stage_results,
                error=str(e),
                started_at=started_at,
                completed_at=completed_at,
                duration_seconds=duration,
            )
    
    def run_single_stage(
        self,
        stage_name: str,
        input_data: Dict[str, Any],
        run_id: str,
        episode_date: str,
        run_dir: str,
    ) -> StageResult:
        """运行单个 Stage
        
        Args:
            stage_name: Stage 名称
            input_data: 输入数据
            run_id: 运行 ID
            episode_date: Episode 日期
            run_dir: 运行目录
            
        Returns:
            StageResult
        """
        stage = StageRegistry.get(stage_name, self.config)
        
        # 准备输入
        stage_input = self._prepare_stage_input(
            stage_name, input_data, run_id, episode_date, run_dir, self.config
        )
        
        return stage.run(stage_input)
    
    def _get_stages_to_run(self, config: PipelineConfig) -> List[str]:
        """获取要运行的 Stage 列表"""
        stages = self.DEFAULT_PIPELINE.copy()
        
        # 处理 start_stage
        if config.start_stage:
            try:
                start_idx = stages.index(config.start_stage)
                stages = stages[start_idx:]
            except ValueError:
                raise ValueError(f"Unknown start_stage: {config.start_stage}")
        
        # 处理 end_stage
        if config.end_stage:
            try:
                end_idx = stages.index(config.end_stage)
                stages = stages[:end_idx + 1]
            except ValueError:
                raise ValueError(f"Unknown end_stage: {config.end_stage}")
        
        return stages
    
    def _prepare_initial_data(
        self, config: PipelineConfig, run_id: str, run_dir: Path
    ) -> Dict[str, Any]:
        """准备初始数据"""
        data = {
            "run_id": run_id,
            "episode_date": config.episode_date,
            "run_dir": str(run_dir),
            "config": config.config,
        }
        
        # 从文件加载输入
        if config.input_file:
            input_path = Path(config.input_file)
            if input_path.exists():
                with open(input_path, "r", encoding="utf-8") as f:
                    file_data = json.load(f)
                    data.update(file_data)
        
        # 覆盖输入
        if config.input_override:
            data.update(config.input_override)
        
        return data
    
    def _prepare_stage_input(
        self,
        stage_name: str,
        current_data: Dict[str, Any],
        run_id: str,
        episode_date: str,
        run_dir: str,
        config: Dict[str, Any],
    ):
        """准备 Stage 输入"""
        # 获取 Stage 类
        stage_class = StageRegistry.get_class(stage_name)
        input_schema = stage_class({}).input_schema
        
        # 构建输入数据
        input_dict = {
            "run_id": run_id,
            "episode_date": episode_date,
            "run_dir": run_dir,
            "config": config,
        }
        
        # 根据 Stage 类型添加特定字段
        if stage_name == "fetch":
            sources = config.get("sources", {}).get("rss", [])
            input_dict["sources"] = sources
            input_dict["timeout_seconds"] = config.get("fetch", {}).get("timeout_seconds", 30)
            
        elif stage_name == "cluster":
            input_dict["items"] = current_data.get("items_dedup", {})
            input_dict["cluster_config"] = config.get("clustering", {})
            
        elif stage_name == "selection":
            input_dict["clusters"] = current_data.get("clusters", [])
            input_dict["items"] = current_data.get("items", {})
            selection_cfg = config.get("selection", {})
            input_dict["selection_config"] = selection_cfg
            
        elif stage_name == "research":
            input_dict["items"] = current_data.get("items_selected", [])
            input_dict["research_config"] = config.get("research", {})
            
        elif stage_name == "script":
            input_dict["items"] = current_data.get("items_enhanced", []) or current_data.get("items_selected", [])
            input_dict["channel"] = config.get("channel", {})
            input_dict["script_config"] = config.get("script", {})
            
        elif stage_name == "audio":
            input_dict["ssml"] = current_data.get("ssml", "")
            input_dict["segments"] = current_data.get("segments", [])
            input_dict["audio_config"] = config.get("audio", {})
            
        elif stage_name == "publish":
            input_dict["audio_paths"] = current_data.get("audio_paths", {})
            input_dict["title"] = current_data.get("title", "")
            input_dict["shownotes"] = current_data.get("shownotes", "")
            input_dict["tags"] = current_data.get("tags", [])
            input_dict["publish_config"] = config.get("publish", {})
        
        return input_schema.model_validate(input_dict)
    
    def _merge_output(
        self, current_data: Dict[str, Any], stage_name: str, output
    ) -> Dict[str, Any]:
        """合并 Stage 输出到数据流"""
        output_dict = output.model_dump()
        
        # 根据 Stage 类型提取关键字段
        if stage_name == "fetch":
            current_data["items_raw"] = output_dict.get("items_raw", [])
            current_data["items_dedup"] = output_dict.get("items_dedup", {})
            
        elif stage_name == "cluster":
            current_data["clusters"] = output_dict.get("clusters", [])
            current_data["items"] = output_dict.get("items", {})
            
        elif stage_name == "selection":
            items_selected = output_dict.get("items_selected", [])
            # 限制新闻条数 (从 config 获取 max_items, 默认不限制)
            max_items = self.config.get("selection", {}).get("max_items")
            if max_items and len(items_selected) > max_items:
                items_selected = items_selected[:max_items]
                self.logger.info(f"限制新闻条数: {len(output_dict.get('items_selected', []))} -> {max_items}")
            current_data["items_selected"] = items_selected
            current_data["all_items"] = output_dict.get("all_items", {})
            
        elif stage_name == "research":
            current_data["items_enhanced"] = output_dict.get("items_enhanced", [])
            current_data["evidence_packs"] = output_dict.get("evidence_packs", [])
            
        elif stage_name == "script":
            current_data["title"] = output_dict.get("title", "")
            current_data["ssml"] = output_dict.get("ssml", "")
            current_data["shownotes"] = output_dict.get("shownotes", "")
            current_data["tags"] = output_dict.get("tags", [])
            current_data["segments"] = output_dict.get("segments", [])
            
        elif stage_name == "audio":
            current_data["audio_paths"] = output_dict.get("audio_paths", {})
            
        elif stage_name == "publish":
            current_data["published_path"] = output_dict.get("published_path")
        
        return current_data


def run_pipeline(
    episode_id: str,
    episode_date: str,
    config: Dict[str, Any],
    output_dir: Path,
    start_stage: Optional[str] = None,
    end_stage: Optional[str] = None,
    skip_stages: Optional[List[str]] = None,
) -> PipelineResult:
    """运行 Pipeline 的便捷函数
    
    Args:
        episode_id: Episode ID
        episode_date: Episode 日期
        config: 配置字典
        output_dir: 输出目录
        start_stage: 从哪个 Stage 开始
        end_stage: 到哪个 Stage 结束
        skip_stages: 跳过的 Stage 列表
        
    Returns:
        PipelineResult
    """
    pipeline_config = PipelineConfig(
        episode_id=episode_id,
        episode_date=episode_date,
        output_dir=str(output_dir),
        config=config,
        start_stage=start_stage,
        end_stage=end_stage,
        skip_stages=skip_stages or [],
    )
    
    orchestrator = StageOrchestrator(config)
    return orchestrator.run(pipeline_config)
