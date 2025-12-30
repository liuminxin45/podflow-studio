"""
Podcast Content Enhancer Module

⚠️ DEPRECATED: 此模块已废弃，请使用 Pipeline V2 的 LLM Stages
- 新模块: src/research/llm_stages.py (LLMStage1, LLMStage2)
- 新数据模型: src/research/models.py (LLM1Output, LLM2Output)

将研究结果转化为高质量的播客内容。

功能概述：
- 使用LLM将新闻研究结果增强为播客内容
- 提供事件级理解、影响分析、反直觉观点等
- 生成适合朗读的播客文本

主要类：
- PodcastEnhancer: 播客内容增强器（已废弃）
- EnhancedContent: 增强后的内容模型（已废弃）

使用示例：
    # 旧方式（已废弃）
    enhancer = PodcastEnhancer()
    enhanced = enhancer.enhance_research_result(research_result, topic)
    
    # 新方式（推荐）
    from src.research.llm_stages import LLMStage1, LLMStage2
    llm_stage1 = LLMStage1()
    llm1_output = llm_stage1.process(topic_title, research_summary)

作者：Auto-Podcast Team
版本：1.0.0 (DEPRECATED)
更新：2025-12-29
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from src.llm.client.api_client import DeepSeekClient


class EnhancedContent(BaseModel):
    """增强后的播客内容"""
    event_summary: str = Field(description="事件级理解（是什么事）")
    data_enrichment: str = Field(description="有趣数据/结构化补充")
    why_now: str = Field(description="Why Now（为什么是现在）")
    actual_impact: str = Field(description="实际影响（量化但不夸张）")
    counter_intuitive: str = Field(description="反直觉点/被忽略的角度")
    podcast_script: str = Field(description="播客朗读文本")
    
    # 元数据
    topic_title: str = Field(description="主题标题")
    processing_time_ms: int = Field(default=0, description="处理时间")


class PodcastEnhancer:
    """播客内容增强器"""
    
    def __init__(self, llm_provider: str = "deepseek", timeout_seconds: int = 60):
        """
        初始化播客内容增强器
        
        Args:
            llm_provider: LLM提供商
            timeout_seconds: 请求超时时间
        """
        self.llm_provider = llm_provider
        self.timeout_seconds = timeout_seconds
        self.logger = logging.getLogger("research.podcast_enhancer")
        
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
    
    def _build_enhancement_prompt(self, 
                                 topic: str,
                                 verified_facts: str,
                                 background: str = "",
                                 related_events: str = "") -> str:
        """
        构建内容增强提示词
        
        Args:
            topic: 新闻主题
            verified_facts: 已校验的核心事实
            background: 补充背景
            related_events: 近期相关事件
            
        Returns:
            str: 构建好的提示词
        """
        prompt = f"""你是一名专业新闻播客的"内容增强编辑 + 数据解释者"。

你的职责不是复述新闻，而是：
- 在不歪曲事实的前提下，补充"有趣、有量化感、有对比"的信息
- 帮听众建立直觉：规模、频率、变化幅度、历史位置
- 让新闻听起来"更具体"，而不是"更抽象"

你可以：
- 使用历史统计、公开常识级数据、行业平均值
- 使用"约数""通常范围""历史上常见情况"等模糊但真实的表达
- 做合理推断，但必须明确为"通常""一般认为""历史经验显示"

你必须：
- 明确区分【已知事实】与【基于历史/经验的补充信息】
- 禁止编造精确数字、虚假排名、虚构来源
- 宁可给区间和趋势，也不要给不确定的精确数值

输出内容必须适合播客朗读：口语化、具体、有画面感。

---

以下是一条已经过初步筛选和事实校验的新闻，请将其增强为「高留存 + 高信息增益」的新闻播客内容。

【新闻主题】
{topic}

【新闻核心事实（已校验）】
{verified_facts}
"""
        
        if background:
            prompt += f"\n【补充背景】\n{background}\n"
        
        if related_events:
            prompt += f"\n【近期相关事件】\n{related_events}\n"
        
        prompt += """
【允许使用的数据类型】
- 历史频率 / 次数 / 排名（如：过去常出现的城市、公司、地区）
- 经济或行业影响的"通常量级"（区间或比例）
- 对比数据（之前 vs 现在 / A 城市 vs B 城市）
- 常识级统计（不需要精确到个位）

【目标听众画像】
- 普通用户
- 从业者 / 行业观察者
- 城市 / 商业 / 政策关注者

---

请严格按以下结构完成内容增强，输出JSON格式：

```json
{
  "event_summary": "用1-2句话说明：这条新闻描述的是一个什么'长期反复发生的事件'或'趋势节点'？它不是孤立事件，而是某种模式的一部分。",
  "data_enrichment": "补充有趣数据或结构化信息（至少1-2种）：历史高频出现对象、非正式排名、量级描述、对比等。用'通常''大约''往往在……区间'表达。不追求绝对精确，追求建立直觉。",
  "why_now": "解释：为什么这类新闻通常在这个时间点出现？是否与周期、政策、惯例、商业节奏有关？",
  "actual_impact": "从城市/地区、行业、普通人感知层面任选2-3个说明实际影响。可以使用区间、百分比变化、经验性描述。量化但不夸张。",
  "counter_intuitive": "指出一个大多数人不会第一时间想到、但对理解这条新闻非常关键的点。",
  "podcast_script": "整合以上内容，生成1-2分钟的播客朗读文本。要求：口语化、有画面感、有数字感但不'报表化'、听完能留下1-2个清晰记忆点。禁止罗列数据、像研报、像百科。"
}
```

请直接输出JSON，不要有其他内容。
"""
        
        return prompt
    
    def _parse_enhancement_response(self, response_text: str) -> Optional[Dict[str, Any]]:
        """
        解析LLM增强响应
        
        Args:
            response_text: LLM响应文本
            
        Returns:
            Dict: 解析后的增强内容
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
            return data
                
        except Exception as e:
            self.logger.error("Failed to parse enhancement response: %s", e)
            self.logger.debug("Response text: %s", response_text)
            return None
    
    def enhance_research_result(self,
                               topic_title: str,
                               research_summary: str,
                               background: str = "",
                               related_events: str = "") -> Optional[EnhancedContent]:
        """
        增强研究结果为播客内容
        
        Args:
            topic_title: 主题标题
            research_summary: 研究摘要（来自Anspire等）
            background: 补充背景信息
            related_events: 相关事件
            
        Returns:
            EnhancedContent: 增强后的内容，如果失败则返回None
        """
        import time
        start_time = time.time()
        
        try:
            self.logger.info(f"开始增强播客内容: {topic_title}")
            
            # 构建提示词
            prompt = self._build_enhancement_prompt(
                topic=topic_title,
                verified_facts=research_summary,
                background=background,
                related_events=related_events
            )
            
            # 调用LLM
            payload = {
                "model": self.llm_client.model,
                "messages": [
                    {"role": "system", "content": "你是一个专业的新闻播客内容编辑，擅长将新闻转化为有深度、有洞察的播客内容。"},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "max_tokens": 2000
            }
            
            response_data = self.llm_client._post_json(payload)
            
            if not response_data:
                self.logger.error("LLM增强请求失败")
                return None
            
            # 提取响应内容
            choices = response_data.get("choices", [])
            if not choices:
                self.logger.error("LLM响应为空")
                return None
            
            response_text = choices[0].get("message", {}).get("content", "")
            
            if not response_text:
                self.logger.error("LLM响应内容为空")
                return None
            
            # 解析响应
            enhanced_data = self._parse_enhancement_response(response_text)
            
            if not enhanced_data:
                self.logger.error("解析增强内容失败")
                return None
            
            # 构建增强内容对象
            processing_time = int((time.time() - start_time) * 1000)
            
            enhanced_content = EnhancedContent(
                event_summary=enhanced_data.get("event_summary", ""),
                data_enrichment=enhanced_data.get("data_enrichment", ""),
                why_now=enhanced_data.get("why_now", ""),
                actual_impact=enhanced_data.get("actual_impact", ""),
                counter_intuitive=enhanced_data.get("counter_intuitive", ""),
                podcast_script=enhanced_data.get("podcast_script", ""),
                topic_title=topic_title,
                processing_time_ms=processing_time
            )
            
            self.logger.info(f"播客内容增强成功，耗时 {processing_time}ms")
            return enhanced_content
            
        except Exception as e:
            processing_time = int((time.time() - start_time) * 1000)
            self.logger.error(f"播客内容增强失败: {e}，耗时 {processing_time}ms")
            return None


def enhance_topic_for_podcast(topic_title: str,
                              research_summary: str,
                              background: str = "",
                              related_events: str = "") -> Optional[EnhancedContent]:
    """
    便捷函数：增强主题为播客内容
    
    Args:
        topic_title: 主题标题
        research_summary: 研究摘要
        background: 补充背景
        related_events: 相关事件
        
    Returns:
        EnhancedContent: 增强后的内容
    """
    enhancer = PodcastEnhancer()
    return enhancer.enhance_research_result(
        topic_title=topic_title,
        research_summary=research_summary,
        background=background,
        related_events=related_events
    )


__all__ = [
    "EnhancedContent",
    "PodcastEnhancer",
    "enhance_topic_for_podcast",
]
