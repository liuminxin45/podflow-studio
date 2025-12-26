"""
Manifest Generator Module

生成播客制作清单，记录版本、成本、缓存命中率、选择理由等关键信息。

Manifest 必含：
- 版本号
- 成本
- cache hit/miss
- selection reasons

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.utils.metrics import get_metrics
from src.utils.trace import get_tracer
from src.utils.serialization import stable_json_dumps


@dataclass
class ManifestEntry:
    """清单条目"""
    stage: str  # fetch / research / editorial / script / tts / audio
    status: str  # success / error / skipped
    duration_ms: float
    cache_hit: bool = False
    cost: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "stage": self.stage,
            "status": self.status,
            "duration_ms": self.duration_ms,
            "cache_hit": self.cache_hit,
            "cost": self.cost,
            "metadata": self.metadata,
        }


@dataclass
class PipelineManifest:
    """流水线清单"""
    version: str = "1.0.0"
    episode_id: str = ""
    created_at: float = field(default_factory=time.time)
    entries: List[ManifestEntry] = field(default_factory=list)
    total_cost: float = 0.0
    total_duration_ms: float = 0.0
    cache_stats: Dict[str, int] = field(default_factory=dict)
    selection_reasons: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def add_entry(self, entry: ManifestEntry) -> None:
        """添加条目"""
        self.entries.append(entry)
        self.total_cost += entry.cost
        self.total_duration_ms += entry.duration_ms
        
        # 更新缓存统计
        cache_key = "cache_hit" if entry.cache_hit else "cache_miss"
        self.cache_stats[cache_key] = self.cache_stats.get(cache_key, 0) + 1
    
    def add_selection_reason(self, item_id: str, reason: str, score: float, metadata: Optional[Dict[str, Any]] = None) -> None:
        """添加选择理由"""
        self.selection_reasons.append({
            "item_id": item_id,
            "reason": reason,
            "score": score,
            "metadata": metadata or {},
        })
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": self.version,
            "episode_id": self.episode_id,
            "created_at": self.created_at,
            "entries": [e.to_dict() for e in self.entries],
            "total_cost": self.total_cost,
            "total_duration_ms": self.total_duration_ms,
            "cache_stats": self.cache_stats,
            "cache_hit_rate": self._calculate_cache_hit_rate(),
            "selection_reasons": self.selection_reasons,
            "metadata": self.metadata,
        }
    
    def _calculate_cache_hit_rate(self) -> float:
        """计算缓存命中率"""
        total = sum(self.cache_stats.values())
        if total == 0:
            return 0.0
        hits = self.cache_stats.get("cache_hit", 0)
        return hits / total
    
    def export_json(self, output_path: Path) -> Path:
        """导出为JSON文件"""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        content = stable_json_dumps(self.to_dict())
        output_path.write_text(content, encoding='utf-8')
        return output_path
    
    def get_summary(self) -> str:
        """获取摘要"""
        lines = [
            f"Episode: {self.episode_id}",
            f"Version: {self.version}",
            f"Total Cost: ${self.total_cost:.4f}",
            f"Total Duration: {self.total_duration_ms / 1000:.2f}s",
            f"Cache Hit Rate: {self._calculate_cache_hit_rate():.1%}",
            f"Stages: {len(self.entries)}",
            f"Selection Reasons: {len(self.selection_reasons)}",
        ]
        return "\n".join(lines)


def create_manifest_from_metrics_and_traces(
    episode_id: str,
    version: str = "1.0.0",
) -> PipelineManifest:
    """
    从指标和追踪数据创建清单
    
    Args:
        episode_id: 节目ID
        version: 版本号
        
    Returns:
        流水线清单
    """
    manifest = PipelineManifest(
        version=version,
        episode_id=episode_id,
    )
    
    # 从追踪数据提取条目
    tracer = get_tracer()
    for span in tracer.get_root_spans():
        entry = ManifestEntry(
            stage=span.operation,
            status=span.status,
            duration_ms=span.duration_ms or 0.0,
            cache_hit=span.metadata.get("cache_hit", False),
            cost=span.metadata.get("cost", 0.0),
            metadata=span.metadata,
        )
        manifest.add_entry(entry)
    
    # 从指标数据提取成本和缓存统计
    metrics = get_metrics()
    manifest.total_cost = metrics.get_total_cost()
    
    # 提取缓存统计
    cache_hits = metrics.get_counter("cache.hit")
    cache_misses = metrics.get_counter("cache.miss")
    manifest.cache_stats = {
        "cache_hit": int(cache_hits),
        "cache_miss": int(cache_misses),
    }
    
    # 添加指标元数据
    manifest.metadata["metrics"] = metrics.export_metrics()
    
    return manifest


def create_stage_entry(
    stage: str,
    duration_ms: float,
    *,
    cache_hit: bool = False,
    cost: float = 0.0,
    status: str = "success",
    **metadata
) -> ManifestEntry:
    """
    便捷函数：创建阶段条目
    
    Args:
        stage: 阶段名称
        duration_ms: 时长（毫秒）
        cache_hit: 是否缓存命中
        cost: 成本
        status: 状态
        **metadata: 额外元数据
        
    Returns:
        清单条目
    """
    return ManifestEntry(
        stage=stage,
        status=status,
        duration_ms=duration_ms,
        cache_hit=cache_hit,
        cost=cost,
        metadata=metadata,
    )


def calculate_api_cost(
    api_name: str,
    *,
    tokens: int = 0,
    requests: int = 1,
    duration_seconds: float = 0.0,
) -> float:
    """
    计算API成本（简化版）
    
    Args:
        api_name: API名称 (metaso / llm / tts)
        tokens: token数量
        requests: 请求次数
        duration_seconds: 时长（秒）
        
    Returns:
        成本（美元）
    """
    # 简化的成本模型
    cost_models = {
        "metaso": {
            "per_request": 0.01,  # $0.01/请求
        },
        "llm": {
            "per_1k_tokens": 0.002,  # $0.002/1K tokens
        },
        "tts": {
            "per_second": 0.0001,  # $0.0001/秒
        },
    }
    
    model = cost_models.get(api_name, {})
    cost = 0.0
    
    if "per_request" in model:
        cost += model["per_request"] * requests
    
    if "per_1k_tokens" in model and tokens > 0:
        cost += model["per_1k_tokens"] * (tokens / 1000)
    
    if "per_second" in model and duration_seconds > 0:
        cost += model["per_second"] * duration_seconds
    
    return cost


__all__ = [
    "ManifestEntry",
    "PipelineManifest",
    "create_manifest_from_metrics_and_traces",
    "create_stage_entry",
    "calculate_api_cost",
]
