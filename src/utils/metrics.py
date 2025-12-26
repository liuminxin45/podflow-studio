"""
Metrics Utility Module

收集和记录系统指标，用于成本控制和性能监控。

功能：
- 计数器（Counter）
- 计时器（Timer）
- 成本追踪（Cost）
- 指标聚合和导出

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class MetricEntry:
    """指标条目"""
    name: str
    value: float
    unit: str = ""
    timestamp: float = field(default_factory=time.time)
    tags: Dict[str, str] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "value": self.value,
            "unit": self.unit,
            "timestamp": self.timestamp,
            "tags": self.tags,
        }


class MetricsCollector:
    """指标收集器"""
    
    def __init__(self):
        self.counters: Dict[str, float] = defaultdict(float)
        self.timers: Dict[str, List[float]] = defaultdict(list)
        self.costs: Dict[str, float] = defaultdict(float)
        self.entries: List[MetricEntry] = []
    
    def increment(self, name: str, value: float = 1.0, tags: Optional[Dict[str, str]] = None) -> None:
        """增加计数器"""
        self.counters[name] += value
        self.entries.append(MetricEntry(
            name=name,
            value=value,
            unit="count",
            tags=tags or {},
        ))
    
    def record_time(self, name: str, duration_ms: float, tags: Optional[Dict[str, str]] = None) -> None:
        """记录时间"""
        self.timers[name].append(duration_ms)
        self.entries.append(MetricEntry(
            name=name,
            value=duration_ms,
            unit="ms",
            tags=tags or {},
        ))
    
    def record_cost(self, name: str, cost: float, currency: str = "USD", tags: Optional[Dict[str, str]] = None) -> None:
        """记录成本"""
        self.costs[name] += cost
        self.entries.append(MetricEntry(
            name=name,
            value=cost,
            unit=currency,
            tags=tags or {},
        ))
    
    def get_counter(self, name: str) -> float:
        """获取计数器值"""
        return self.counters.get(name, 0.0)
    
    def get_timer_stats(self, name: str) -> Dict[str, float]:
        """获取计时器统计"""
        values = self.timers.get(name, [])
        if not values:
            return {"count": 0, "total": 0.0, "avg": 0.0, "min": 0.0, "max": 0.0}
        
        return {
            "count": len(values),
            "total": sum(values),
            "avg": sum(values) / len(values),
            "min": min(values),
            "max": max(values),
        }
    
    def get_total_cost(self, name: Optional[str] = None) -> float:
        """获取总成本"""
        if name:
            return self.costs.get(name, 0.0)
        return sum(self.costs.values())
    
    def export_metrics(self) -> Dict[str, Any]:
        """导出所有指标"""
        return {
            "counters": dict(self.counters),
            "timers": {
                name: self.get_timer_stats(name)
                for name in self.timers.keys()
            },
            "costs": dict(self.costs),
            "total_cost": self.get_total_cost(),
            "entries": [e.to_dict() for e in self.entries],
        }
    
    def clear(self) -> None:
        """清空指标"""
        self.counters.clear()
        self.timers.clear()
        self.costs.clear()
        self.entries.clear()


# 全局指标收集器
_global_metrics = MetricsCollector()


def get_metrics() -> MetricsCollector:
    """获取全局指标收集器"""
    return _global_metrics


def increment_counter(name: str, value: float = 1.0, **tags) -> None:
    """便捷函数：增加计数器"""
    get_metrics().increment(name, value, tags)


def record_duration(name: str, duration_ms: float, **tags) -> None:
    """便捷函数：记录时长"""
    get_metrics().record_time(name, duration_ms, tags)


def record_api_cost(api_name: str, cost: float, **tags) -> None:
    """便捷函数：记录API成本"""
    get_metrics().record_cost(f"api.{api_name}.cost", cost, tags=tags)


__all__ = [
    "MetricEntry",
    "MetricsCollector",
    "get_metrics",
    "increment_counter",
    "record_duration",
    "record_api_cost",
]
