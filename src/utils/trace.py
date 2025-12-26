"""
Tracing Utility Module

追踪系统调用和操作，用于调试、审计和性能分析。

功能：
- 操作追踪（开始/结束时间、时长）
- 嵌套追踪（支持子操作）
- 上下文管理器
- 追踪数据导出

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class TraceSpan:
    """追踪片段"""
    span_id: str
    operation: str
    start_time: float
    end_time: Optional[float] = None
    duration_ms: Optional[float] = None
    parent_span_id: Optional[str] = None
    status: str = "running"  # running / success / error
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: Dict[str, str] = field(default_factory=dict)
    
    def finish(self, status: str = "success", error: Optional[str] = None) -> None:
        """结束追踪"""
        self.end_time = time.time()
        self.duration_ms = (self.end_time - self.start_time) * 1000
        self.status = status
        self.error = error
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "span_id": self.span_id,
            "operation": self.operation,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_ms": self.duration_ms,
            "parent_span_id": self.parent_span_id,
            "status": self.status,
            "error": self.error,
            "metadata": self.metadata,
            "tags": self.tags,
        }


class Tracer:
    """追踪器"""
    
    def __init__(self):
        self.spans: List[TraceSpan] = []
        self.current_span: Optional[TraceSpan] = None
    
    def start_span(
        self,
        operation: str,
        *,
        parent_span_id: Optional[str] = None,
        tags: Optional[Dict[str, str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> TraceSpan:
        """开始一个追踪片段"""
        span = TraceSpan(
            span_id=str(uuid.uuid4()),
            operation=operation,
            start_time=time.time(),
            parent_span_id=parent_span_id or (self.current_span.span_id if self.current_span else None),
            tags=tags or {},
            metadata=metadata or {},
        )
        
        self.spans.append(span)
        return span
    
    def finish_span(
        self,
        span: TraceSpan,
        *,
        status: str = "success",
        error: Optional[str] = None,
    ) -> None:
        """结束追踪片段"""
        span.finish(status=status, error=error)
    
    @contextmanager
    def trace(
        self,
        operation: str,
        *,
        tags: Optional[Dict[str, str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """追踪上下文管理器"""
        span = self.start_span(operation, tags=tags, metadata=metadata)
        previous_span = self.current_span
        self.current_span = span
        
        try:
            yield span
            self.finish_span(span, status="success")
        except Exception as e:
            self.finish_span(span, status="error", error=str(e))
            raise
        finally:
            self.current_span = previous_span
    
    def get_spans(self) -> List[TraceSpan]:
        """获取所有追踪片段"""
        return self.spans
    
    def get_root_spans(self) -> List[TraceSpan]:
        """获取根追踪片段"""
        return [s for s in self.spans if s.parent_span_id is None]
    
    def get_children(self, span_id: str) -> List[TraceSpan]:
        """获取子追踪片段"""
        return [s for s in self.spans if s.parent_span_id == span_id]
    
    def export_trace_tree(self) -> Dict[str, Any]:
        """导出追踪树"""
        def build_tree(span: TraceSpan) -> Dict[str, Any]:
            children = self.get_children(span.span_id)
            return {
                **span.to_dict(),
                "children": [build_tree(child) for child in children],
            }
        
        root_spans = self.get_root_spans()
        return {
            "traces": [build_tree(span) for span in root_spans],
            "total_spans": len(self.spans),
        }
    
    def clear(self) -> None:
        """清空追踪数据"""
        self.spans.clear()
        self.current_span = None


# 全局追踪器实例
_global_tracer = Tracer()


def get_tracer() -> Tracer:
    """获取全局追踪器"""
    return _global_tracer


def trace_operation(operation: str, **kwargs):
    """装饰器：追踪函数执行"""
    def decorator(func):
        def wrapper(*args, **func_kwargs):
            tracer = get_tracer()
            with tracer.trace(operation, metadata=kwargs):
                return func(*args, **func_kwargs)
        return wrapper
    return decorator


__all__ = [
    "TraceSpan",
    "Tracer",
    "get_tracer",
    "trace_operation",
]
