"""
RSS Fetcher Base Classes and Interfaces
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Optional


class FetchStatus(Enum):
    """拉取状态"""
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    TIMEOUT = "timeout"


@dataclass
class FetchResult:
    """拉取结果"""
    items: list[dict]
    status: FetchStatus
    error_message: Optional[str] = None
    metadata: Optional[dict] = None


class BaseFetcher(ABC):
    """RSS Fetcher基类"""
    
    @property
    @abstractmethod
    def fetcher_type(self) -> str:
        """Fetcher类型标识"""
        pass
    
    @abstractmethod
    def fetch_items(
        self,
        config: dict,
        episode_date: date,
        timeout_seconds: int = 30
    ) -> FetchResult:
        """
        拉取RSS数据
        
        Args:
            config: RSS源配置
            episode_date: 目标日期
            timeout_seconds: 超时时间
        
        Returns:
            FetchResult: 拉取结果
        """
        pass
    
    def validate_config(self, config: dict) -> bool:
        """验证配置是否有效"""
        return True


class StandardizedItem:
    """标准化Item的字段定义"""
    
    REQUIRED_FIELDS = ["id", "title", "url", "source"]
    
    @staticmethod
    def validate(item: dict) -> tuple[bool, Optional[str]]:
        """验证item是否符合标准格式"""
        for field in StandardizedItem.REQUIRED_FIELDS:
            if field not in item or not item[field]:
                return False, f"Missing required field: {field}"
        return True, None
