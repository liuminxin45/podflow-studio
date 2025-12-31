"""
反馈数据模型定义
"""

from pydantic import BaseModel, Field
from typing import Literal, Optional, List
from datetime import datetime


class TopicFeedback(BaseModel):
    """单个主题的人工反馈"""
    
    # 基础信息
    feedback_id: str = Field(..., description="反馈ID")
    topic_id: str = Field(..., description="主题ID")
    timestamp: datetime = Field(..., description="反馈时间")
    episode_date: str = Field(..., description="期数日期")
    
    # 主题信息快照
    topic_snapshot: dict = Field(..., description="主题完整信息")
    
    # 系统决策
    system_decision: Literal["must", "maybe", "discard"] = Field(
        ..., description="系统原始决策"
    )
    system_score: float = Field(..., description="系统打分")
    score_breakdown: dict = Field(..., description="打分明细")
    
    # 人工反馈
    human_decision: Literal["accept", "reject", "uncertain"] = Field(
        ..., description="人工决策"
    )
    human_priority: Optional[int] = Field(
        None, ge=1, le=5, description="人工优先级评分"
    )
    
    # 反馈详情
    feedback_reason: str = Field(
        default="", description="反馈原因（为什么不同意系统决策）"
    )
    tags: List[str] = Field(
        default_factory=list, 
        description="标签（如：消费者关心、话题性强、数据过时等）"
    )
    
    # 改进建议
    suggested_archetype: Optional[str] = Field(
        None, description="建议的内容原型（如果系统判断错误）"
    )
    suggested_score_adjustment: Optional[dict] = Field(
        None, description="建议的打分调整"
    )


class FeedbackSession(BaseModel):
    """一次反馈会话"""
    
    session_id: str = Field(..., description="会话ID")
    timestamp: datetime = Field(..., description="会话时间")
    episode_date: str = Field(..., description="期数日期")
    report_path: str = Field(..., description="对应的 report 文件路径")
    
    # 会话统计
    total_reviewed: int = Field(default=0, description="审核总数")
    agree_count: int = Field(default=0, description="同意系统决策")
    disagree_count: int = Field(default=0, description="不同意系统决策")
    
    # 反馈列表
    feedbacks: List[TopicFeedback] = Field(
        default_factory=list, description="反馈列表"
    )
    
    # 元数据
    reviewer: str = Field(default="default", description="审核人")
    notes: str = Field(default="", description="总体备注")
