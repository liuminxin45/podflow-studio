"""
Unified LLM API Client

这个文件提供了统一的LLM客户端接口，支持多种大语言模型服务提供商。

功能概述：
- 统一DeepSeek和Moonshot API调用接口
- 提供向后兼容的客户端类
- 支持脚本生成、研究分析等多种应用场景
- 完整的错误处理和重试机制


作者：Auto-Podcast Team
版本：3.0.0
更新：2025-12-25
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
from pydantic import BaseModel, Field

# 旧版本的 prompt 函数已被移除，使用新版本的 SegmentScriptGenerator 替代
# from src.llm.templates.prompts import (
#     build_research_script_prompt,
#     build_news_script_prompt,
#     build_detailed_news_script_prompt,
# )


class ScriptInputItem(BaseModel):
    id: str
    title: str
    summary: str = ""
    content: str = ""
    url: str
    published_at: Optional[str] = None
    source: str = ""  # Source name for attribution
    source_name: str = ""  # Alias for source


class ScriptOutput(BaseModel):
    title: str
    ssml: str
    shownotes: str
    tags: List[str] = Field(default_factory=list)


class UnifiedLLMClient:
    """
    统一的LLM API客户端，支持DeepSeek和Moonshot等兼容OpenAI格式的API
    """
    
    def __init__(self, base_url: str, api_key: str, model: str, timeout_seconds: int, provider: str = "unknown"):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.provider = provider.lower()
        self.log = logging.getLogger(f"llm.client.{self.provider}")

    def _load_json_from_content(self, content: str) -> Any:
        """
        从LLM返回的内容中提取JSON，支持多种格式
        """
        s = (content or "").strip()
        if not s:
            raise json.JSONDecodeError("empty content", s, 0)

        try:
            return json.loads(s)
        except json.JSONDecodeError:
            pass

        # 尝试提取```json```代码块
        if s.startswith("```"):
            i = s.find("\n")
            if i != -1:
                s2 = s[i + 1 :]
            else:
                s2 = ""
            j = s2.rfind("```")
            if j != -1:
                s2 = s2[:j]
            s2 = s2.strip()
            if s2:
                try:
                    return json.loads(s2)
                except json.JSONDecodeError:
                    pass

        # 尝试提取第一个完整的JSON对象
        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            s3 = s[start : end + 1]
            return json.loads(s3)

        return json.loads(s)

    def _endpoint(self) -> str:
        return f"{self.base_url}/chat/completions"

    def _timeout(self) -> Tuple[float, float]:
        connect_timeout = float(min(10, max(1, int(self.timeout_seconds // 3) or 1)))
        read_timeout = float(max(5, int(self.timeout_seconds)))
        return connect_timeout, read_timeout

    def _post_json(self, payload: Dict) -> Dict[str, Any]:
        """
        发送HTTP请求到LLM API，支持重试机制
        """
        last_err: Optional[Exception] = None
        for i in range(3):
            try:
                resp = requests.post(
                    self._endpoint(),
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                    timeout=self._timeout(),
                )
                
                try:
                    resp.raise_for_status()
                except requests.HTTPError as e:
                    body = (getattr(resp, "text", "") or "")
                    self.log.error(
                        "%s http error: status=%s url=%s body=%s",
                        self.provider,
                        getattr(resp, "status_code", None),
                        getattr(resp, "url", None),
                        body[:500],
                    )
                    raise
                    
                data: dict[str, Any] = resp.json()
                return data
                
            except (requests.Timeout, requests.ConnectionError) as e:
                last_err = e
                sleep_s = 1.5 * (2**i)
                self.log.warning("request failed (attempt=%s/3): %s; retry in %.1fs", i + 1, e, sleep_s)
                time.sleep(sleep_s)
                
        assert last_err is not None
        raise last_err


# 为了向后兼容，保留原有的类名
class DeepSeekClient(UnifiedLLMClient):
    """
    DeepSeek API客户端（向后兼容）
    """
    def __init__(self, base_url: str, api_key: str, model: str, timeout_seconds: int):
        super().__init__(base_url, api_key, model, timeout_seconds, "deepseek")


class MoonshotClient(UnifiedLLMClient):
    """
    Moonshot API客户端（向后兼容）
    """
    def __init__(self, base_url: str, api_key: str, model: str, timeout_seconds: int):
        super().__init__(base_url, api_key, model, timeout_seconds, "moonshot")


def create_client(provider: str, base_url: str, api_key: str, model: str, timeout_seconds: int = 60) -> UnifiedLLMClient:
    """
    工厂函数：根据提供商创建对应的客户端
    
    Args:
        provider: 提供商名称 ("deepseek", "moonshot", 或其他兼容OpenAI格式的提供商)
        base_url: API基础URL
        api_key: API密钥
        model: 模型名称
        timeout_seconds: 超时时间（秒）
    
    Returns:
        对应的客户端实例
    """
    return UnifiedLLMClient(base_url, api_key, model, timeout_seconds, provider)
