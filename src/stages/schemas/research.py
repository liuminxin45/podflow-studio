"""
Research Stage Schema

研究阶段的输入输出定义
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from src.stages.schemas.common import (
    BaseStageInput,
    BaseStageOutput,
    EvidencePackSchema,
    ItemSchema,
)


class ResearchConfig(BaseModel):
    """研究配置"""
    enabled: bool = True
    provider: str = "anspire"
    max_total_claims: int = 20
    max_claims_per_item: int = 5
    min_claim_confidence: float = 0.6
    include_opinions: bool = False
    include_contrast_queries: bool = True


class ResearchInput(BaseStageInput):
    """Research Stage 输入
    
    接收 Selection 输出的选中 items
    """
    items: List[ItemSchema]
    research_config: ResearchConfig = Field(default_factory=ResearchConfig)


class ResearchStats(BaseModel):
    """研究统计"""
    total_items: int = 0
    total_claims: int = 0
    total_queries: int = 0
    total_evidence_packs: int = 0


class ResearchOutput(BaseStageOutput):
    """Research Stage 输出
    
    返回增强后的 items（带证据包）
    """
    items_enhanced: List[ItemSchema] = Field(default_factory=list)
    evidence_packs: List[EvidencePackSchema] = Field(default_factory=list)
    stats: ResearchStats = Field(default_factory=ResearchStats)
