"""
LLM Stages: LLM#1 (Enhancement) and LLM#2 (Finalization)
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Dict, Optional

from src.llm.client.api_client import DeepSeekClient
from src.research.core.models import (
    LLM1Output,
    LLM2Output,
    EnhancementFields,
    RetrievalPlan,
    RetrievalBundle,
)


class LLMStage1:
    """LLM#1: 增强阶段，生成draft+retrieval_plan"""
    
    def __init__(self, llm_client: Optional[DeepSeekClient] = None):
        self.llm_client = llm_client or self._create_default_client()
        self.logger = logging.getLogger("research.llm_stage1")
    
    def _create_default_client(self) -> DeepSeekClient:
        import os
        return DeepSeekClient(
            base_url=os.environ.get("DEEPSEEK_BASE_URL", ""),
            api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
            model=os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
            timeout_seconds=60
        )
    
    def process(self, topic_title: str, research_summary: str) -> Optional[LLM1Output]:
        """执行LLM#1处理"""
        start_time = time.time()
        
        try:
            prompt = self._build_prompt(topic_title, research_summary)
            
            payload = {
                "model": self.llm_client.model,
                "messages": [
                    {"role": "system", "content": "你是专业的播客内容编辑和数据分析师。"},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "max_tokens": 3000
            }
            
            response_data = self.llm_client._post_json(payload)
            if not response_data:
                return None
            
            content = response_data["choices"][0]["message"]["content"]
            parsed = self._parse_response(content)
            
            if not parsed:
                return None
            
            processing_time = int((time.time() - start_time) * 1000)
            
            return LLM1Output(
                draft_script=parsed["draft_script"],
                enhancement=EnhancementFields(**parsed["enhancement"]),
                retrieval_plan=RetrievalPlan(**parsed["retrieval_plan"]),
                topic_title=topic_title,
                processing_time_ms=processing_time,
                model_used=self.llm_client.model
            )
            
        except Exception as e:
            self.logger.error(f"LLM#1处理失败: {e}")
            return None
    
    def _build_prompt(self, topic: str, summary: str) -> str:
        return f"""基于以下新闻生成播客内容增强结果。

【主题】{topic}
【研究摘要】{summary}

输出JSON格式：
```json
{{
  "draft_script": "播客草稿（1-2分钟，口语化）",
  "enhancement": {{
    "event_summary": "事件理解",
    "data_enrichment": "数据补充",
    "why_now": "时机分析",
    "actual_impact": "实际影响",
    "counter_intuitive": "反直觉点"
  }},
  "retrieval_plan": {{
    "queries": [
      {{
        "intent": "history_frequency",
        "query": "具体查询文本",
        "entities": ["实体1", "实体2"],
        "priority": 4,
        "expected_output": "numbers",
        "must_have": false
      }}
    ],
    "constraints": {{
      "no_fabrication": true,
      "if_missing_use_range_words": true
    }}
  }}
}}
```

retrieval_plan要求：
- 明确列出需要查询的历史数据/对比/排名
- intent必须是: history_frequency|ranking|economic_impact|context_recall|timeline|entity_background
- 不要编造数据，只列出需要查询的内容"""
    
    def _parse_response(self, text: str) -> Optional[Dict[str, Any]]:
        try:
            json_text = self._extract_json_block(text)
            json_text = self._clean_json_text(json_text)
            return json.loads(json_text, strict=False)
        except Exception as e:
            self.logger.error(f"解析LLM#1响应失败: {e}")
            return None

    def _extract_json_block(self, text: str) -> str:
        m = re.search(r"```json\s*(.*?)\s*```", text, flags=re.DOTALL | re.IGNORECASE)
        if m:
            return m.group(1).strip()

        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return text[start : end + 1]
        return text.strip()

    def _clean_json_text(self, text: str) -> str:
        cleaned = []
        for ch in text:
            o = ord(ch)
            if o < 32 and ch not in ("\t", "\n", "\r"):
                continue
            cleaned.append(ch)
        return "".join(cleaned).strip()


class LLMStage2:
    """LLM#2: 终稿阶段，基于retrieval_bundle生成final_script"""
    
    def __init__(self, llm_client: Optional[DeepSeekClient] = None):
        self.llm_client = llm_client or self._create_default_client()
        self.logger = logging.getLogger("research.llm_stage2")
    
    def _create_default_client(self) -> DeepSeekClient:
        import os
        return DeepSeekClient(
            base_url=os.environ.get("DEEPSEEK_BASE_URL", ""),
            api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
            model=os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
            timeout_seconds=60
        )
    
    def process(self,
                llm1_output: LLM1Output,
                retrieval_bundle: RetrievalBundle) -> Optional[LLM2Output]:
        """执行LLM#2处理"""
        start_time = time.time()
        
        try:
            has_hard_data = self._check_hard_data(retrieval_bundle)
            
            prompt = self._build_prompt(llm1_output, retrieval_bundle, has_hard_data)
            
            payload = {
                "model": self.llm_client.model,
                "messages": [
                    {"role": "system", "content": self._get_system_prompt(has_hard_data)},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "max_tokens": 2500
            }
            
            response_data = self.llm_client._post_json(payload)
            if not response_data:
                return None
            
            content = response_data["choices"][0]["message"]["content"]
            parsed = self._parse_response(content)
            
            if not parsed:
                return None
            
            processing_time = int((time.time() - start_time) * 1000)
            
            return LLM2Output(
                final_podcast_script=parsed["final_podcast_script"],
                shownotes=parsed.get("shownotes"),
                citations_used=parsed.get("citations_used", []),
                has_hard_data=has_hard_data,
                degraded=False,
                data_quality_score=self._calculate_quality_score(retrieval_bundle),
                topic_title=llm1_output.topic_title,
                processing_time_ms=processing_time,
                model_used=self.llm_client.model
            )
            
        except Exception as e:
            self.logger.error(f"LLM#2处理失败: {e}")
            return None
    
    def _get_system_prompt(self, has_hard_data: bool) -> str:
        base = "你是专业的播客终稿编辑。"
        
        if not has_hard_data:
            base += """
【硬约束】检索到的硬数据不足，你必须：
1. 禁止输出精确数字（如"增长23.5%"）
2. 禁止输出具体排名（如"排名第3"）
3. 只能使用模糊表达：通常、大约、往往在...区间、历史上常见
4. 如果无法确定，直接说"数据暂不明确"
违反以上规则将导致内容不可用。"""
        
        return base
    
    def _build_prompt(self,
                     llm1: LLM1Output,
                     bundle: RetrievalBundle,
                     has_hard_data: bool) -> str:
        
        bundle_summary = f"""
【检索结果】
- 硬事实: {len(bundle.hard_facts)}条
- 统计数据: {len(bundle.stats_and_rankings)}条
- 对比数据: {len(bundle.comparisons)}条
- 历史播客: {len(bundle.history_podcast_hits)}条
- 引用来源: {len(bundle.citations)}条
- 缺失项: {len(bundle.gaps)}条

硬事实摘要:
{chr(10).join(bundle.hard_facts[:3])}

引用来源:
{chr(10).join([f"- {c.title} ({c.source})" for c in bundle.citations[:3]])}
"""
        
        if not has_hard_data:
            bundle_summary += "\n⚠️ 警告：硬数据不足，禁止使用精确数字和排名！"
        
        return f"""基于以下内容生成最终播客脚本。

【草稿】
{llm1.draft_script}

【增强字段】
{llm1.enhancement.model_dump_json(indent=2)}

{bundle_summary}

输出JSON:
```json
{{
  "final_podcast_script": "最终播客脚本（整合检索结果，1-2分钟）",
  "shownotes": "节目笔记（可选）",
  "citations_used": ["使用的引用"]
}}
```

要求：
1. 整合检索到的数据，使内容更具体
2. 保持口语化和画面感
3. {'禁止精确数字/排名' if not has_hard_data else '可以使用检索到的数据'}"""
    
    def _parse_response(self, text: str) -> Optional[Dict[str, Any]]:
        try:
            json_text = self._extract_json_block(text)
            json_text = self._clean_json_text(json_text)
            return json.loads(json_text, strict=False)
        except Exception as e:
            self.logger.error(f"解析LLM#2响应失败: {e}")
            return None

    def _extract_json_block(self, text: str) -> str:
        m = re.search(r"```json\s*(.*?)\s*```", text, flags=re.DOTALL | re.IGNORECASE)
        if m:
            return m.group(1).strip()

        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return text[start : end + 1]
        return text.strip()

    def _clean_json_text(self, text: str) -> str:
        cleaned = []
        for ch in text:
            o = ord(ch)
            if o < 32 and ch not in ("\t", "\n", "\r"):
                continue
            cleaned.append(ch)
        return "".join(cleaned).strip()
    
    def _check_hard_data(self, bundle: RetrievalBundle) -> bool:
        """检查是否有足够的硬数据"""
        return (
            len(bundle.hard_facts) > 0 or
            len(bundle.stats_and_rankings) > 0 or
            len(bundle.citations) >= 2
        )
    
    def _calculate_quality_score(self, bundle: RetrievalBundle) -> float:
        """计算数据质量分数"""
        score = 0.0
        score += min(len(bundle.hard_facts) * 0.2, 0.4)
        score += min(len(bundle.stats_and_rankings) * 0.15, 0.3)
        score += min(len(bundle.citations) * 0.1, 0.3)
        return min(score, 1.0)


__all__ = ["LLMStage1", "LLMStage2"]
