"""
Enhanced Topic Gate (LLM Decision with Few-shot Learning)

支持 Few-shot 学习的 LLM 决策门
"""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from typing import List, Optional

from src.llm.client.api_client import DeepSeekClient
from src.topic_selection.core.models import TopicCandidate, TopicDecision


class TopicGateEnhanced:
    """支持 Few-shot 学习的 LLM 决策门"""
    
    def __init__(
        self,
        llm_client: Optional[DeepSeekClient] = None,
        top_n: int = 10,
        fallback_to_score: bool = True,
        few_shot_path: str = "prompts/topic_gate_few_shot.txt",
    ):
        self.llm_client = llm_client or self._create_default_client()
        self.top_n = top_n
        self.fallback_to_score = fallback_to_score
        self.few_shot_path = Path(few_shot_path)
        self.logger = logging.getLogger("topic_selection.processing.topic_gate")
        
        # 缓存 Few-shot 内容
        self._few_shot_content = self._load_few_shot_content()
    
    def _create_default_client(self) -> DeepSeekClient:
        import os
        return DeepSeekClient(
            base_url=os.environ.get("DEEPSEEK_BASE_URL", ""),
            api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
            model=os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
            timeout_seconds=30
        )
    
    def _load_few_shot_content(self) -> str:
        """加载 Few-shot 示例内容"""
        if not self.few_shot_path.exists():
            self.logger.debug(f"Few-shot 文件不存在: {self.few_shot_path}")
            return ""
        
        try:
            with open(self.few_shot_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            self.logger.info(f"已加载 Few-shot 示例: {len(content)} 字符")
            return content
        except Exception as e:
            self.logger.error(f"加载 Few-shot 失败: {e}")
            return ""
    
    def gate_topics(
        self,
        candidates: List[TopicCandidate],
        item_lookup: dict
    ) -> List[TopicCandidate]:
        """对TopN候选做LLM决策（支持 Few-shot）"""
        
        # 按topic_score排序，取TopN
        sorted_candidates = sorted(
            candidates,
            key=lambda c: c.topic_score,
            reverse=True
        )[:self.top_n]
        
        self.logger.info(f"LLM Gate (Enhanced): 评估 {len(sorted_candidates)} 个候选主题")
        
        if self._few_shot_content:
            self.logger.info(f"✅ 使用 Few-shot 学习 ({len(self._few_shot_content)} 字符)")
        else:
            self.logger.info("⚠️  未使用 Few-shot 学习")
        
        decisions = []
        for candidate in sorted_candidates:
            try:
                decision = self._decide_single(candidate, item_lookup)
                if decision:
                    decisions.append(decision)
                else:
                    # LLM失败，降级到规则
                    if self.fallback_to_score:
                        decision = self._fallback_decision(candidate)
                        decisions.append(decision)
            except Exception as e:
                self.logger.error(f"LLM Gate失败: {candidate.topic_id} - {e}")
                if self.fallback_to_score:
                    decision = self._fallback_decision(candidate)
                    decisions.append(decision)
        
        # 应用决策到candidates
        decision_map = {d.topic_id: d for d in decisions}
        
        passed_candidates = []
        for candidate in sorted_candidates:
            decision = decision_map.get(candidate.topic_id)
            if decision:
                candidate.should_publish = decision.should_publish
                candidate.publish_priority = decision.publish_priority
                
                topic_name = candidate.title or candidate.topic_id
                if decision.should_publish:
                    passed_candidates.append(candidate)
                    self.logger.info(
                        f"✅ 通过: {topic_name} "
                        f"(优先级={decision.publish_priority}/5, hook={decision.core_hook[:50]})"
                    )
                else:
                    self.logger.info(f"❌ 拒绝: {topic_name} (风险={decision.risk})")
        
        self.logger.info(f"LLM Gate完成: {len(passed_candidates)}/{len(sorted_candidates)} 通过")
        return passed_candidates
    
    def _decide_single(
        self,
        candidate: TopicCandidate,
        item_lookup: dict
    ) -> Optional[TopicDecision]:
        """对单个候选做LLM决策（支持 Few-shot）"""
        from src.utils.logging_config import log_api_call
        
        start_time = time.time()
        
        try:
            system_prompt = self._get_system_prompt()
            prompt = self._build_prompt(candidate, item_lookup)
            
            # 计算字符数
            total_chars = len(system_prompt) + len(prompt)
            
            # 记录API调用
            log_api_call(
                self.logger,
                api_type="LLM",
                operation=f"topic_gate_decision_{candidate.topic_id}",
                char_count=total_chars
            )
            
            payload = {
                "model": self.llm_client.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 500
            }
            
            response_data = self.llm_client._post_json(payload)
            if not response_data:
                return None
            
            content = response_data["choices"][0]["message"]["content"]
            parsed = self._parse_response(content)
            
            if not parsed:
                return None
            
            processing_time = int((time.time() - start_time) * 1000)
            
            return TopicDecision(
                topic_id=candidate.topic_id,
                should_publish=bool(parsed.get("should_publish", False)),
                publish_priority=int(parsed.get("publish_priority", 3)),
                target_audience=parsed.get("target_audience", []),
                core_hook=parsed.get("core_hook", ""),
                risk=parsed.get("risk", ""),
                model_used=self.llm_client.model,
                processing_time_ms=processing_time
            )
            
        except Exception as e:
            self.logger.error(f"LLM Gate处理失败: {candidate.topic_id} - {e}")
            return None
    
    def _get_system_prompt(self) -> str:
        """获取系统提示（包含 Few-shot 示例）"""
        base_prompt = """你是播客选题编辑，负责决策哪些主题值得做成播客。

评估标准：
1. 听众价值：是否对听众有用/有趣/有启发
2. 可讲性：是否有足够素材和角度（单条重要新闻也可以深度解读）
3. 时效性：是否现在就该讲
4. 风险：是否明显无聊/极度争议/完全无法展开

注意：
- 单条新闻不等于数据不足，重要事件值得深度解读
- 有争议的话题往往更有讨论价值
- 保持平衡的标准，不要过度严格"""
        
        # 添加 Few-shot 示例
        if self._few_shot_content:
            few_shot_enhanced = self._enhance_with_few_shot(self._few_shot_content)
            return f"{base_prompt}\n\n{few_shot_enhanced}"
        
        return base_prompt
    
    def _enhance_with_few_shot(self, few_shot_content: str) -> str:
        """将 Few-shot 示例转换为系统提示增强"""
        # 解析 Few-shot 内容并转换为系统提示格式
        lines = few_shot_content.split('\n')
        enhanced_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # 转换示例格式
            if line.startswith('## 示例'):
                enhanced_lines.append(f"\n{line}")
            elif line.startswith('**标题**:'):
                enhanced_lines.append(f"示例主题：{line.replace('**标题**:', '').strip()}")
            elif line.startswith('**系统决策**:'):
                enhanced_lines.append(f"系统评估：{line.replace('**系统决策**:', '').strip()}")
            elif line.startswith('**人工决策**:'):
                enhanced_lines.append(f"人工判断：{line.replace('**人工决策**:', '').strip()}")
            elif line.startswith('**原因**:'):
                enhanced_lines.append(f"判断原因：{line.replace('**原因**:', '').strip()}")
            elif line.startswith('**标签**:'):
                enhanced_lines.append(f"关键标签：{line.replace('**标签**:', '').strip()}")
            elif line.startswith('### 应避免的主题类型'):
                enhanced_lines.append(f"\n{line}")
            elif line.startswith('- **'):
                enhanced_lines.append(f"  • {line.replace('- **', '').replace('**', '').strip()}")
        
        return "\n".join(enhanced_lines)
    
    def _build_prompt(self, candidate: TopicCandidate, item_lookup: dict) -> str:
        # 获取代表性item样本（只传关键字段，避免噪音）
        sample_items = []
        for item_id in candidate.items[:3]:  # 取前3条
            item = item_lookup.get(item_id)
            if item:
                # 优先使用简化的text字段，fallback到title
                text_preview = item.get("text", "") or item.get("title", "")
                sample_items.append({
                    "title": item.get("title", ""),
                    "preview": text_preview[:200]  # 最多200字符
                })
        
        return f"""评估这个主题是否值得做成播客。

【主题】{candidate.title}
【实体】{', '.join(candidate.entities[:5])}
【包含新闻数】{len(candidate.items)}（注：单条重要新闻也值得深度解读）
【主题总分】{candidate.topic_score:.1f}/100

【分数构成】
{json.dumps(candidate.score_breakdown, ensure_ascii=False, indent=2) if candidate.score_breakdown else 'N/A'}

【代表性新闻样本】
{json.dumps(sample_items, ensure_ascii=False, indent=2)}

输出JSON格式：
```json
{{
  "should_publish": true|false,
  "publish_priority": 5-1,
  "target_audience": ["普通人", "从业者", "投资者"],
  "core_hook": "一句话为什么值得听",
  "risk": "无聊/争议/数据不足/无"
}}
```

决策要点：
- should_publish: 是否值得播（严格标准）
- publish_priority: 5=最高优先级，1=最低优先级
- target_audience: 谁会感兴趣
- core_hook: 用一句话说明为什么值得听
- risk: 潜在风险或问题"""
    
    def _parse_response(self, text: str) -> Optional[dict]:
        try:
            json_text = self._extract_json_block(text)
            json_text = self._clean_json_text(json_text)
            return json.loads(json_text, strict=False)
        except Exception as e:
            self.logger.error(f"解析LLM Gate响应失败: {e}")
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
    
    def _fallback_decision(self, candidate: TopicCandidate) -> TopicDecision:
        """降级决策：基于规则打分
        
        优先级定义：5最高，1最低
        """
        
        # 基于topic_score决策 (0-100)
        if candidate.topic_score >= 65.0:
            should_publish = True
            priority = 5  # 必播，最高优先级
        elif candidate.topic_score >= 50.0:
            should_publish = True
            priority = 3  # 可播，中等优先级
        else:
            should_publish = False
            priority = 1  # 不播，最低优先级
        
        return TopicDecision(
            topic_id=candidate.topic_id,
            should_publish=should_publish,
            publish_priority=priority,
            target_audience=["普通听众"],
            core_hook=f"基于规则打分通过 (score={candidate.topic_score:.1f})",
            risk="LLM Gate失败，降级到规则决策",
            model_used="fallback_rule"
        )


__all__ = ["TopicGateEnhanced"]
