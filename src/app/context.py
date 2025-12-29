"""
Episode Context

贯穿整个 Episode 生命周期的状态容器
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from src.utils.models import StoryCluster

if TYPE_CHECKING:
    from src.tracks.base import Track


@dataclass
class EpisodeContext:
    """Episode 执行上下文
    
    贯穿 Fetch → Cluster → Selection → Research → Script → Audio → Publish 全流程
    """
    
    # ========== 基础信息 ==========
    episode_id: str
    episode_date: str
    run_id: str
    config: Dict[str, Any]
    
    # ========== 路径 ==========
    output_dir: Path
    run_dir: Path
    
    # ========== Track ==========
    track: Optional["Track"] = None  # 当前使用的 Track
    
    # ========== Fetch 阶段 ==========
    items_raw: List[dict] = field(default_factory=list)
    items_dedup: Dict[str, dict] = field(default_factory=dict)  # {item_id: item}
    
    # ========== Cluster 阶段 ==========
    clusters: List[StoryCluster] = field(default_factory=list)
    
    # ========== Selection 阶段 ==========
    auto_topic_result: Optional[Dict[str, Any]] = None
    selection_result: Optional[Dict[str, Any]] = None
    items_selected: List[dict] = field(default_factory=list)
    
    # ========== Research 阶段 ==========
    research_results: List[Dict[str, Any]] = field(default_factory=list)
    
    # ========== Script 阶段 ==========
    script_plan: Optional[Dict[str, Any]] = None
    script_text: Optional[str] = None
    
    # ========== Audio 阶段 ==========
    audio_paths: List[Path] = field(default_factory=list)
    
    # ========== Publish 阶段 ==========
    publish_result: Optional[Dict[str, Any]] = None
    
    # ========== 指标与事件 ==========
    metrics: Dict[str, Any] = field(default_factory=dict)
    events: List[Dict[str, Any]] = field(default_factory=list)
    
    # ========== 执行状态 ==========
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    status: str = "running"  # running | completed | failed
    error: Optional[str] = None
    
    def add_event(self, event_type: str, **data):
        """添加事件"""
        self.events.append({
            "type": event_type,
            "timestamp": datetime.now().isoformat(),
            **data
        })
    
    def set_metric(self, key: str, value: Any):
        """设置指标"""
        self.metrics[key] = value
    
    def mark_completed(self):
        """标记完成"""
        self.status = "completed"
        self.completed_at = datetime.now()
    
    def mark_failed(self, error: str):
        """标记失败"""
        self.status = "failed"
        self.error = error
        self.completed_at = datetime.now()
