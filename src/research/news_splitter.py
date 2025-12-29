"""
News Splitter Module

使用LLM将包含多个主题的新闻内容拆分成独立的研究主题。

功能概述：
- 分析新闻内容，识别不同的主题
- 将复杂新闻拆分为独立的研究条目
- 保持原始信息的完整性
- 支持多种LLM提供商

主要类：
- NewsSplitter: 新闻拆分器
- NewsTopic: 拆分后的主题模型

使用示例：
    splitter = NewsSplitter()
    topics = splitter.split_news_items(items)
    for topic in topics:
        research_result = research_client.research_items([topic])

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-29
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from src.llm.api_client import DeepSeekClient, create_client as create_llm_client


class NewsTopic(BaseModel):
    """拆分后的新闻主题"""
    id: str = Field(description="主题唯一标识")
    title: str = Field(description="主题标题")
    content: str = Field(description="主题内容")
    original_index: int = Field(description="在原始新闻中的索引")
    topic_type: str = Field(description="主题类型：main, sub, event, policy, etc.")
    keywords: List[str] = Field(default_factory=list, description="关键词列表")
    source: str = Field(description="新闻来源")
    url: Optional[str] = Field(default=None, description="原始链接")


class NewsSplitter:
    """新闻拆分器"""
    
    def __init__(self, llm_provider: str = "deepseek", timeout_seconds: int = 60):
        """
        初始化新闻拆分器
        
        Args:
            llm_provider: LLM提供商
            timeout_seconds: 请求超时时间
        """
        self.llm_provider = llm_provider
        self.timeout_seconds = timeout_seconds
        self.logger = logging.getLogger("research.news_splitter")
        
        # 初始化LLM客户端
        self.llm_client = self._create_llm_client()
    
    def _create_llm_client(self):
        """创建LLM客户端"""
        if self.llm_provider == "deepseek":
            import os
            base_url = os.environ.get("DEEPSEEK_BASE_URL", "").strip()
            api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
            model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip()
            
            if not base_url or not api_key:
                raise RuntimeError("DeepSeek not configured: set DEEPSEEK_BASE_URL and DEEPSEEK_API_KEY")
            
            return DeepSeekClient(base_url=base_url, api_key=api_key, model=model, 
                                timeout_seconds=self.timeout_seconds)
        else:
            raise ValueError(f"Unsupported LLM provider: {self.llm_provider}")
    
    def _build_split_prompt(self, items: List[Dict[str, Any]]) -> str:
        """
        构建新闻拆分提示词
        
        Args:
            items: 新闻条目列表
            
        Returns:
            str: 构建好的提示词
        """
        prompt = """请分析以下新闻内容，将其拆分成独立的研究主题。

拆分规则：
1. 识别新闻中的不同主题（如：政策发布、事件报道、经济数据、社会现象等）
2. 每个主题应该是一个独立的研究单元
3. 保持关键信息的完整性
4. 为每个主题生成简洁但信息完整的标题和内容
5. 识别主题类型（main/sub/event/policy/social/economic/international等）
6. 提取3-5个关键词

输出格式（JSON）：
```json
{
  "topics": [
    {
      "title": "主题标题",
      "content": "主题详细内容",
      "topic_type": "主题类型",
      "keywords": ["关键词1", "关键词2", "关键词3"],
      "original_index": 0
    }
  ]
}
```

新闻内容：
"""
        
        for idx, item in enumerate(items):
            title = item.get("title", "").strip()
            content = item.get("content", "").strip()
            source = item.get("source", "").strip()
            
            prompt += f"\n--- 新闻 {idx+1} ---\n"
            prompt += f"来源：{source}\n"
            prompt += f"标题：{title}\n"
            if content and content != title:
                prompt += f"内容：{content}\n"
        
        prompt += "\n请分析并拆分上述新闻："
        
        return prompt
    
    def _parse_split_response(self, response_text: str) -> List[Dict[str, Any]]:
        """
        解析LLM拆分响应
        
        Args:
            response_text: LLM响应文本
            
        Returns:
            List[Dict]: 拆分后的主题列表
        """
        try:
            # 尝试提取JSON部分
            if "```json" in response_text:
                start = response_text.find("```json") + 7
                end = response_text.find("```", start)
                json_text = response_text[start:end].strip()
            elif "{" in response_text and "}" in response_text:
                # 尝试找到第一个完整的JSON对象
                start = response_text.find("{")
                brace_count = 0
                end = start
                for i, char in enumerate(response_text[start:], start=start):
                    if char == "{":
                        brace_count += 1
                    elif char == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            end = i + 1
                            break
                json_text = response_text[start:end]
            else:
                json_text = response_text.strip()
            
            # 解析JSON
            data = json.loads(json_text)
            
            if isinstance(data, dict) and "topics" in data:
                return data["topics"]
            elif isinstance(data, list):
                return data
            else:
                self.logger.warning("Unexpected response format: %s", type(data))
                return []
                
        except Exception as e:
            self.logger.error("Failed to parse split response: %s", e)
            self.logger.debug("Response text: %s", response_text)
            return []
    
    def split_news_items(self, items: List[Dict[str, Any]]) -> List[NewsTopic]:
        """
        拆分新闻条目
        
        Args:
            items: 原始新闻条目列表
            
        Returns:
            List[NewsTopic]: 拆分后的主题列表
        """
        if not items:
            return []
        
        self.logger.info(f"开始拆分 {len(items)} 条新闻")
        
        try:
            # 构建提示词
            prompt = self._build_split_prompt(items)
            
            # 调用LLM
            self.logger.info("调用LLM进行新闻拆分...")
            payload = {
                "model": self.llm_client.model,
                "messages": [
                    {"role": "system", "content": "你是一个专业的新闻分析助手，擅长将复杂新闻拆分成独立的研究主题。"},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 4000
            }
            
            response_data = self.llm_client._post_json(payload)
            
            if not response_data:
                self.logger.error("LLM拆分请求失败")
                return self._fallback_split(items)
            
            # 提取响应内容
            choices = response_data.get("choices", [])
            if not choices:
                self.logger.error("LLM响应为空")
                return self._fallback_split(items)
            
            response = choices[0].get("message", {}).get("content", "")
            
            if not response:
                self.logger.error("LLM响应内容为空")
                return self._fallback_split(items)
            
            # 解析响应
            split_data = self._parse_split_response(response)
            
            if not split_data:
                self.logger.warning("LLM拆分结果为空，使用回退方案")
                return self._fallback_split(items)
            
            # 构建主题对象
            topics = []
            for idx, topic_data in enumerate(split_data):
                try:
                    # 找到原始新闻条目
                    original_index = topic_data.get("original_index", 0)
                    if 0 <= original_index < len(items):
                        original_item = items[original_index]
                        source = original_item.get("source", "")
                        url = original_item.get("url")
                    else:
                        source = ""
                        url = None
                    
                    topic = NewsTopic(
                        id=f"topic_{idx+1}",
                        title=topic_data.get("title", "").strip(),
                        content=topic_data.get("content", "").strip(),
                        original_index=original_index,
                        topic_type=topic_data.get("topic_type", "main"),
                        keywords=topic_data.get("keywords", []),
                        source=source,
                        url=url
                    )
                    
                    if topic.title and topic.content:
                        topics.append(topic)
                        
                except Exception as e:
                    self.logger.warning(f"Failed to create topic {idx}: {e}")
                    continue
            
            self.logger.info(f"成功拆分出 {len(topics)} 个主题")
            return topics
            
        except Exception as e:
            self.logger.error(f"新闻拆分失败: {e}，使用回退方案")
            return self._fallback_split(items)
    
    def _fallback_split(self, items: List[Dict[str, Any]]) -> List[NewsTopic]:
        """
        回退拆分方案：直接使用原始新闻条目
        
        Args:
            items: 原始新闻条目列表
            
        Returns:
            List[NewsTopic]: 基础主题列表
        """
        topics = []
        for idx, item in enumerate(items):
            title = item.get("title", "").strip()
            content = item.get("content", "").strip()
            
            if not title:
                continue
            
            # 使用标题作为主题，内容作为描述
            topic = NewsTopic(
                id=f"topic_{idx+1}",
                title=title,
                content=content if content and content != title else f"新闻主题：{title}",
                original_index=idx,
                topic_type="main",
                keywords=[],
                source=item.get("source", ""),
                url=item.get("url")
            )
            topics.append(topic)
        
        self.logger.info(f"使用回退方案，创建了 {len(topics)} 个基础主题")
        return topics


def split_news_for_research(items: List[Dict[str, Any]], 
                          llm_provider: str = "deepseek") -> List[NewsTopic]:
    """
    便捷函数：拆分新闻用于研究
    
    Args:
        items: 新闻条目列表
        llm_provider: LLM提供商
        
    Returns:
        List[NewsTopic]: 拆分后的主题列表
    """
    splitter = NewsSplitter(llm_provider=llm_provider)
    return splitter.split_news_items(items)


__all__ = [
    "NewsTopic",
    "NewsSplitter", 
    "split_news_for_research",
]
