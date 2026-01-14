"""
Common Schemas

通用的数据模型定义，被多个 Stage 共享
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ItemSchema(BaseModel):
    """新闻条目 Schema"""
    id: str
    title: str
    summary: Optional[str] = None
    content: Optional[str] = None
    url: Optional[str] = None
    published_at: Optional[str] = None
    source_name: Optional[str] = None
    source_domain: Optional[str] = None
    
    # 可选的增强字段
    tags: List[str] = Field(default_factory=list)
    entities: List[str] = Field(default_factory=list)
    simhash: Optional[str] = None
    compliance_status: Optional[str] = None
    
    # Research 增强字段
    evidence_packs: List["EvidencePackSchema"] = Field(default_factory=list)
    
    # 额外字段（灵活扩展）
    extra: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        extra = "allow"


class ClusterSchema(BaseModel):
    """聚类 Schema"""
    cluster_id: str
    representative_item_id: str
    item_ids: List[str]
    title: Optional[str] = None
    size: int = 1
    score: Optional[float] = None
    
    # 聚类元数据
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EvidenceSchema(BaseModel):
    """证据 Schema"""
    source: str
    content: str
    url: Optional[str] = None
    relevance_score: Optional[float] = None


class EvidencePackSchema(BaseModel):
    """证据包 Schema"""
    claim: str
    query: Optional[str] = None
    evidences: List[EvidenceSchema] = Field(default_factory=list)
    confidence: Optional[float] = None


class AudioPathsSchema(BaseModel):
    """音频路径 Schema"""
    tts: Optional[str] = None
    rendered: Optional[str] = None
    segments: List[str] = Field(default_factory=list)


class BaseStageInput(BaseModel):
    """Stage 输入基类"""
    run_id: str
    episode_date: str
    run_dir: str
    config: Dict[str, Any] = Field(default_factory=dict)


class BaseStageOutput(BaseModel):
    """Stage 输出基类"""
    run_id: str
    episode_date: str
    artifacts_dir: Optional[str] = None
