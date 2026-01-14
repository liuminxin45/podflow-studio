"""
Stage Schemas

规范化的输入输出 Schema 定义
"""

from src.stages.schemas.common import (
    ItemSchema,
    ClusterSchema,
    EvidencePackSchema,
    AudioPathsSchema,
    BaseStageInput,
    BaseStageOutput,
)
from src.stages.schemas.fetch import FetchInput, FetchOutput
from src.stages.schemas.cluster import ClusterInput, ClusterOutput
from src.stages.schemas.selection import SelectionInput, SelectionOutput
from src.stages.schemas.research import ResearchInput, ResearchOutput
from src.stages.schemas.script import ScriptInput, ScriptOutput
from src.stages.schemas.audio import AudioInput, AudioOutput
from src.stages.schemas.publish import PublishInput, PublishOutput

__all__ = [
    # Common
    "ItemSchema",
    "ClusterSchema", 
    "EvidencePackSchema",
    "AudioPathsSchema",
    "BaseStageInput",
    "BaseStageOutput",
    # Stages
    "FetchInput", "FetchOutput",
    "ClusterInput", "ClusterOutput",
    "SelectionInput", "SelectionOutput",
    "ResearchInput", "ResearchOutput",
    "ScriptInput", "ScriptOutput",
    "AudioInput", "AudioOutput",
    "PublishInput", "PublishOutput",
]
