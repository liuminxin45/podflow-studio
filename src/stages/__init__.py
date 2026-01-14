"""
Modular Stages

每个 Stage 都是独立可运行的模块，具有规范化的输入输出接口。
支持单独运行，也可通过编排层组合运行。

Pipeline: Fetch → Cluster → Selection → Research → Script → Audio → Publish
"""

from src.stages.base import BaseStage, StageResult, StageStatus
from src.stages.registry import StageRegistry

__all__ = [
    "BaseStage",
    "StageResult", 
    "StageStatus",
    "StageRegistry",
]
