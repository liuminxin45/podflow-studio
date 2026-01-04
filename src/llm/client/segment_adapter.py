"""
LLM Client Adapter for Segment Generation

适配器：让现有的LLM客户端可以用于段落生成
"""

from __future__ import annotations

import json
import logging
from typing import Dict, List


logger = logging.getLogger("llm.client.segment_adapter")


class LLMClientAdapter:
    """
    LLM客户端适配器
    
    将MoonshotClient/DeepSeekClient适配为SegmentGenerator需要的接口
    """
    
    def __init__(self, llm_client):
        """
        Args:
            llm_client: MoonshotClient或DeepSeekClient实例
        """
        self.client = llm_client
        self.logger = logging.getLogger("llm.client.segment_adapter")
    
    def generate(self, system: str, user: str, temperature: float = 0.7) -> str:
        """
        生成文本接口（用于 SegmentScriptGenerator）
        
        Args:
            system: 系统提示词
            user: 用户提示词
            temperature: 温度参数
            
        Returns:
            生成的文本内容
        """
        try:
            # 构建payload
            payload = {
                "model": self.client.model,
                "temperature": temperature,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            }
            
            # 调用底层客户端的_post_json方法
            response = self.client._post_json(payload)
            
            # 解析OpenAI格式的响应
            if isinstance(response, dict) and "choices" in response:
                content = response["choices"][0]["message"]["content"]
                return content
            else:
                # 兜底处理
                return str(response)
                
        except Exception as e:
            self.logger.error(f"LLM调用失败: {e}")
            raise RuntimeError(f"LLM call failed: {e}")
    
    def chat(self, messages: List[Dict], temperature: float = 0.7) -> Dict:
        """
        统一的chat接口
        
        Args:
            messages: 消息列表 [{"role": "system", "content": "..."}, ...]
            temperature: 温度参数
            
        Returns:
            {"content": "LLM response"}
        """
        try:
            # 构建payload
            payload = {
                "model": self.client.model,
                "temperature": temperature,
                "messages": messages,
            }
            
            # 调用底层客户端的_post_json方法
            response = self.client._post_json(payload)
            
            # 解析OpenAI格式的响应
            if isinstance(response, dict) and "choices" in response:
                content = response["choices"][0]["message"]["content"]
                return {"content": content}
            else:
                # 兜底处理
                return {"content": str(response)}
                
        except Exception as e:
            self.logger.error(f"LLM调用失败: {e}")
            raise RuntimeError(f"LLM call failed: {e}")
