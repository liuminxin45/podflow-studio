"""
Unified Research Client

这个文件提供了统一的研究客户端接口，支持多种研究服务提供商。

功能概述：
- 统一MetaSo和其他研究API调用接口
- 提供向后兼容的客户端类
- 支持深度研究、背景分析等多种应用场景
- 完整的错误处理和重试机制

主要类：
- UnifiedResearchClient: 统一研究客户端
- MetaSoClient: MetaSo API客户端（向后兼容）
- ResearchConfig: 研究配置模型
- ResearchOutput: 研究输出模型

工厂方法：
- create_client(): 根据配置创建对应客户端
- 支持环境变量和配置文件

使用示例：
    client = create_client("metaso", api_key, base_url, model, timeout)
    result = client.research_items(items, max_items=10)

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional, Union

import requests
from pydantic import BaseModel, Field

from src.research.metaso import metaso_research_items


class ResearchConfig(BaseModel):
    """研究配置模型"""
    provider: str = Field(default="metaso", description="研究服务提供商")
    api_key: Optional[str] = Field(default=None, description="API密钥")
    base_url: Optional[str] = Field(default=None, description="API基础URL")
    model: Optional[str] = Field(default=None, description="模型名称")
    timeout_seconds: int = Field(default=60, description="请求超时时间（秒）")
    max_items: Optional[int] = Field(default=None, description="最大研究条目数")
    max_retries: int = Field(default=3, description="最大重试次数")
    retry_delay: float = Field(default=1.0, description="重试延迟时间（秒）")


class ResearchOutput(BaseModel):
    """研究输出模型"""
    success: bool = Field(description="研究是否成功")
    content: Optional[str] = Field(default=None, description="研究内容")
    model: Optional[str] = Field(default=None, description="使用的模型")
    provider: str = Field(description="服务提供商")
    input_items_count: int = Field(description="输入条目数量")
    processing_time_ms: int = Field(description="处理时间（毫秒）")
    error: Optional[str] = Field(default=None, description="错误信息")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="额外元数据")


class UnifiedResearchClient:
    """统一研究客户端"""
    
    def __init__(self, config: ResearchConfig):
        self.config = config
        self.logger = logging.getLogger(f"research.{config.provider}")
        
    def research_items(self, items: List[Dict[str, Any]], **kwargs) -> ResearchOutput:
        """
        研究给定的条目列表
        
        Args:
            items: 要研究的条目列表
            **kwargs: 额外参数（如max_items等）
            
        Returns:
            ResearchOutput: 研究结果
        """
        start_time = time.perf_counter()
        
        try:
            # 合并配置和参数
            max_items = kwargs.get('max_items') or self.config.max_items
            model = kwargs.get('model') or self.config.model
            
            self.logger.info(f"开始研究 {len(items)} 个条目，提供商: {self.config.provider}")
            
            # 根据提供商调用对应的研究方法
            if self.config.provider == "metaso":
                result = self._research_with_metaso(items, max_items, model)
            else:
                raise ValueError(f"不支持的研究提供商: {self.config.provider}")
            
            # 计算处理时间
            processing_time_ms = int((time.perf_counter() - start_time) * 1000)
            
            # 构建输出
            output = ResearchOutput(
                success=result is not None and result.get("ok", False),
                content=result.get("response_json", {}).get("choices", [{}])[0].get("message", {}).get("content") if result and result.get("response_json") else result.get("response_text") if result else None,
                model=result.get("model") if result else model,
                provider=self.config.provider,
                input_items_count=len(items),
                processing_time_ms=processing_time_ms,
                metadata=result or {}
            )
            
            if output.success:
                self.logger.info(f"研究完成，耗时 {processing_time_ms}ms")
            else:
                self.logger.warning("研究失败")
                
            return output
            
        except Exception as e:
            processing_time_ms = int((time.perf_counter() - start_time) * 1000)
            error_msg = str(e)
            self.logger.error(f"研究过程中发生错误: {error_msg}")
            
            return ResearchOutput(
                success=False,
                provider=self.config.provider,
                input_items_count=len(items),
                processing_time_ms=processing_time_ms,
                error=error_msg
            )
    
    def _research_with_metaso(self, items: List[Dict[str, Any]], max_items: Optional[int], model: Optional[str]) -> Optional[Dict[str, Any]]:
        """使用MetaSo进行研究"""
        try:
            result = metaso_research_items(
                items=items,
                timeout_seconds=self.config.timeout_seconds,
                model=model,
                max_items=max_items
            )
            return result
        except Exception as e:
            self.logger.error(f"MetaSo研究失败: {e}")
            raise
    
    def research_with_retry(self, items: List[Dict[str, Any]], **kwargs) -> ResearchOutput:
        """
        带重试机制的研究方法
        
        Args:
            items: 要研究的条目列表
            **kwargs: 额外参数
            
        Returns:
            ResearchOutput: 研究结果
        """
        last_error = None
        
        for attempt in range(self.config.max_retries + 1):
            try:
                result = self.research_items(items, **kwargs)
                if result.success:
                    return result
                    
                # 如果是客户端错误（4xx），不重试
                if hasattr(result, 'error') and result.error and '400' in result.error:
                    self.logger.warning(f"客户端错误，不重试: {result.error}")
                    return result
                    
                last_error = result.error
                
                if attempt < self.config.max_retries:
                    self.logger.warning(f"研究失败，{self.config.retry_delay}秒后重试 (尝试 {attempt + 1}/{self.config.max_retries + 1}): {last_error}")
                    time.sleep(self.config.retry_delay)
                    
            except Exception as e:
                last_error = str(e)
                if attempt < self.config.max_retries:
                    self.logger.warning(f"研究异常，{self.config.retry_delay}秒后重试 (尝试 {attempt + 1}/{self.config.max_retries + 1}): {last_error}")
                    time.sleep(self.config.retry_delay)
        
        # 所有重试都失败了
        self.logger.error(f"研究失败，已达到最大重试次数: {last_error}")
        return ResearchOutput(
            success=False,
            provider=self.config.provider,
            input_items_count=len(items),
            processing_time_ms=0,
            error=last_error or "重试次数已用尽"
        )


class MetaSoClient(UnifiedResearchClient):
    """MetaSo研究客户端（向后兼容）"""
    
    def __init__(self, api_key: str, model: Optional[str] = None, timeout_seconds: int = 60):
        config = ResearchConfig(
            provider="metaso",
            api_key=api_key,
            model=model,
            timeout_seconds=timeout_seconds
        )
        super().__init__(config)


def create_client(
    provider: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
    timeout_seconds: int = 60,
    max_items: Optional[int] = None,
    max_retries: int = 3,
    retry_delay: float = 1.0,
    **kwargs
) -> UnifiedResearchClient:
    """
    创建研究客户端的工厂方法
    
    Args:
        provider: 研究服务提供商 ("metaso")
        api_key: API密钥
        base_url: API基础URL
        model: 模型名称
        timeout_seconds: 超时时间
        max_items: 最大条目数
        max_retries: 最大重试次数
        retry_delay: 重试延迟
        **kwargs: 其他配置参数
        
    Returns:
        UnifiedResearchClient: 配置好的研究客户端
    """
    config = ResearchConfig(
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        model=model,
        timeout_seconds=timeout_seconds,
        max_items=max_items,
        max_retries=max_retries,
        retry_delay=retry_delay,
        **kwargs
    )
    
    if provider == "metaso":
        return UnifiedResearchClient(config)
    else:
        raise ValueError(f"不支持的研究提供商: {provider}")


def create_client_from_env(provider: str = "metaso") -> UnifiedResearchClient:
    """
    从环境变量创建研究客户端
    
    Args:
        provider: 研究服务提供商
        
    Returns:
        UnifiedResearchClient: 配置好的研究客户端
    """
    import os
    
    if provider == "metaso":
        api_key = os.environ.get("METASO_API_KEY")
        base_url = os.environ.get("METASO_BASE_URL")
        model = os.environ.get("METASO_MODEL", "fast")
        timeout_seconds = int(os.environ.get("METASO_TIMEOUT_SECONDS", "60"))
        max_items = int(os.environ.get("METASO_MAX_ITEMS", "0")) or None
        max_retries = int(os.environ.get("METASO_MAX_RETRIES", "3"))
        retry_delay = float(os.environ.get("METASO_RETRY_DELAY", "1.0"))
        
        return create_client(
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            model=model,
            timeout_seconds=timeout_seconds,
            max_items=max_items,
            max_retries=max_retries,
            retry_delay=retry_delay
        )
    else:
        raise ValueError(f"不支持的研究提供商: {provider}")


# 向后兼容的函数
def research_items_with_client(
    client: UnifiedResearchClient,
    items: List[Dict[str, Any]],
    max_items: Optional[int] = None,
    use_retry: bool = True,
    **kwargs
) -> ResearchOutput:
    """
    使用客户端研究条目
    
    Args:
        client: 研究客户端
        items: 要研究的条目列表
        max_items: 最大条目数
        use_retry: 是否使用重试机制
        **kwargs: 其他参数
        
    Returns:
        ResearchOutput: 研究结果
    """
    if max_items is not None:
        kwargs['max_items'] = max_items
    
    if use_retry:
        return client.research_with_retry(items, **kwargs)
    else:
        return client.research_items(items, **kwargs)
