"""
Base Stage

所有 Stage 的基类，定义规范化的输入输出接口
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Generic, Optional, TypeVar

from pydantic import BaseModel, Field


class StageStatus(str, Enum):
    """Stage 执行状态"""
    SUCCESS = "success"
    PARTIAL = "partial"  # 部分成功
    SKIPPED = "skipped"  # 跳过（条件不满足）
    FAILED = "failed"


class StageMetadata(BaseModel):
    """Stage 元数据"""
    stage_name: str
    stage_version: str = "1.0.0"
    started_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    
    def mark_completed(self):
        self.completed_at = datetime.now()
        self.duration_seconds = (self.completed_at - self.started_at).total_seconds()


# 泛型类型变量
InputT = TypeVar("InputT", bound=BaseModel)
OutputT = TypeVar("OutputT", bound=BaseModel)


class StageResult(BaseModel, Generic[OutputT]):
    """Stage 执行结果"""
    status: StageStatus
    output: Optional[OutputT] = None
    error: Optional[str] = None
    metadata: StageMetadata
    
    class Config:
        arbitrary_types_allowed = True


class BaseStage(ABC, Generic[InputT, OutputT]):
    """Stage 基类
    
    每个 Stage 必须实现:
    - name: Stage 名称
    - version: Stage 版本
    - input_schema: 输入 Schema 类
    - output_schema: 输出 Schema 类
    - execute(): 核心执行逻辑
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.logger = logging.getLogger(f"stages.{self.name}")
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Stage 名称"""
        pass
    
    @property
    def version(self) -> str:
        """Stage 版本"""
        return "1.0.0"
    
    @property
    @abstractmethod
    def input_schema(self) -> type[InputT]:
        """输入 Schema 类"""
        pass
    
    @property
    @abstractmethod
    def output_schema(self) -> type[OutputT]:
        """输出 Schema 类"""
        pass
    
    @abstractmethod
    def execute(self, input_data: InputT) -> OutputT:
        """执行 Stage 核心逻辑
        
        Args:
            input_data: 规范化的输入数据
            
        Returns:
            规范化的输出数据
            
        Raises:
            Exception: 执行失败
        """
        pass
    
    def run(self, input_data: InputT) -> StageResult[OutputT]:
        """运行 Stage（带状态管理和错误处理）
        
        Args:
            input_data: 规范化的输入数据
            
        Returns:
            StageResult 包含状态、输出和元数据
        """
        metadata = StageMetadata(
            stage_name=self.name,
            stage_version=self.version,
        )
        
        self.logger.info(f">>> Stage 开始: {self.name} v{self.version}")
        
        try:
            output = self.execute(input_data)
            metadata.mark_completed()
            
            self.logger.info(
                f"<<< Stage 完成: {self.name} "
                f"(耗时 {metadata.duration_seconds:.2f}s)"
            )
            
            return StageResult(
                status=StageStatus.SUCCESS,
                output=output,
                metadata=metadata,
            )
            
        except Exception as e:
            metadata.mark_completed()
            self.logger.error(f"<<< Stage 失败: {self.name} - {e}")
            
            return StageResult(
                status=StageStatus.FAILED,
                error=str(e),
                metadata=metadata,
            )
    
    def run_from_json(self, input_json: str | dict) -> StageResult[OutputT]:
        """从 JSON 运行 Stage
        
        Args:
            input_json: JSON 字符串或字典
            
        Returns:
            StageResult
        """
        if isinstance(input_json, str):
            input_dict = json.loads(input_json)
        else:
            input_dict = input_json
        
        input_data = self.input_schema.model_validate(input_dict)
        return self.run(input_data)
    
    def run_from_file(self, input_path: Path | str) -> StageResult[OutputT]:
        """从文件运行 Stage
        
        Args:
            input_path: 输入 JSON 文件路径
            
        Returns:
            StageResult
        """
        input_path = Path(input_path)
        input_json = input_path.read_text(encoding="utf-8")
        return self.run_from_json(input_json)
    
    def save_result(self, result: StageResult[OutputT], output_path: Path | str):
        """保存结果到文件
        
        Args:
            result: Stage 执行结果
            output_path: 输出 JSON 文件路径
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 序列化结果
        result_dict = {
            "status": result.status.value,
            "output": result.output.model_dump() if result.output else None,
            "error": result.error,
            "metadata": {
                "stage_name": result.metadata.stage_name,
                "stage_version": result.metadata.stage_version,
                "started_at": result.metadata.started_at.isoformat(),
                "completed_at": result.metadata.completed_at.isoformat() if result.metadata.completed_at else None,
                "duration_seconds": result.metadata.duration_seconds,
            }
        }
        
        output_path.write_text(
            json.dumps(result_dict, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        self.logger.info(f"结果已保存: {output_path}")
