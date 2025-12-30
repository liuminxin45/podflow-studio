"""
Item Signal Tagging (LLM#0)

为每条新闻item打标签：产出signals + archetypes + continuity
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import List, Optional

from src.llm.client.api_client import DeepSeekClient
from src.topic_selection.core.models import (
    ItemSignalTagging,
    SignalScores,
    TopicArchetype,
)


class ItemSignalTagger:
    """LLM#0: 为每条item打信号标签"""
    
    def __init__(self, llm_client: Optional[DeepSeekClient] = None, prompt_template: Optional[str] = None):
        self.llm_client = llm_client or self._create_default_client()
        self.prompt_template = prompt_template  # 策略提供的 prompt 模板
        self.logger = logging.getLogger("topic_selection.signal_tagging")
    
    def _create_default_client(self) -> DeepSeekClient:
        import os
        return DeepSeekClient(
            base_url=os.environ.get("DEEPSEEK_BASE_URL", ""),
            api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
            model=os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
            timeout_seconds=30
        )
    
    def tag_items(self, items: List[dict]) -> List[ItemSignalTagging]:
        """批量打标签"""
        results = []
        for item in items:
            try:
                result = self.tag_single_item(item)
                if result:
                    results.append(result)
            except Exception as e:
                self.logger.error(f"打标签失败: {item.get('id', 'unknown')} - {e}")
        return results
    
    def tag_single_item(self, item: dict) -> Optional[ItemSignalTagging]:
        """为单条item打标签"""
        start_time = time.time()
        
        item_id = item.get("id") or item.get("url") or "unknown"
        title = item.get("title", "")
        content = item.get("content") or item.get("summary", "")
        
        if not title and not content:
            return None
        
        try:
            prompt = self._build_prompt(title, content)
            
            payload = {
                "model": self.llm_client.model,
                "messages": [
                    {"role": "system", "content": "你是专业的新闻分析师，擅长判断新闻的听众价值。"},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 800
            }
            
            response_data = self.llm_client._post_json(payload)
            if not response_data:
                return None
            
            content_text = response_data["choices"][0]["message"]["content"]
            data = self._parse_response(content_text)
            
            if not data:
                self.logger.warning(f"LLM#0响应解析失败: {item_id}, response={content_text[:200]}")
                return None
            
            processing_time = int((time.time() - start_time) * 1000)
            
            # 构建SignalScores
            archetypes_dict = {}
            archetypes_raw = data.get("archetypes", {})
            for key, value in archetypes_raw.items():
                try:
                    archetype = TopicArchetype(key)
                    archetypes_dict[archetype] = float(value)
                except (ValueError, TypeError):
                    self.logger.warning(f"无效的archetype: {key}={value}")
            
            # 解析domains（新增）
            domains = data.get("domains", [])
            if not isinstance(domains, list):
                domains = []
            
            signals = SignalScores(
                archetypes=archetypes_dict,
                continuity=float(data.get("continuity", 0.0)),
                why_now=float(data.get("why_now", 0.0)),
                data_enrichable=float(data.get("data_enrichable", 0.0)),
                follow_up_potential=float(data.get("follow_up_potential", 0.0)),
                domains=domains,
            )
            
            return ItemSignalTagging(
                item_id=item_id,
                signals=signals,
                entities=data.get("entities", []),
                why_now_reason=data.get("why_now_reason", ""),
                model_used=self.llm_client.model,
                processing_time_ms=processing_time
            )
            
        except Exception as e:
            self.logger.error(f"LLM#0处理失败: {item_id} - {e}", exc_info=True)
            self.logger.warning(f"Item详情: title={title[:100]}, content_len={len(content)}")
            return None
    
    def _build_prompt(self, title: str, content: str) -> str:
        content_snippet = content[:500] if len(content) > 500 else content
        
        # 如果策略提供了 prompt 模板，使用策略模板
        if self.prompt_template:
            return self.prompt_template.format(title=title, content=content_snippet)
        
        # 否则使用默认模板
        return f"""分析这条新闻的听众价值信号。

【标题】{title}
【内容】{content_snippet}

输出JSON格式：
```json
{{
  "archetypes": {{
    "change_happening": 0-3,
    "personal_impact": 0-3,
    "competition_conflict": 0-3,
    "risk_opportunity": 0-3,
    "counter_intuitive": 0-3,
    "inflection_trend": 0-3
  }},
  "continuity": 0-1,
  "why_now": 0-1,
  "data_enrichable": 0-1,
  "follow_up_potential": 0-1,
  "entities": ["实体1", "实体2"],
  "why_now_reason": "为什么现在值得关注",
  "domains": ["domain1", "domain2"]
}}
```

可选的语义域标签（domains）：
- national_culture: 国民文化节点（春晚/央视晚会/全国性仪式）
- real_estate: 房地产/房贷/LPR/公积金/交易税费
- macro_consume_policy: 扩内需/促消费/国补/以旧换新/消费券
- precious_metals: 黄金/白银/首饰/避险
- a_share_market: A股/大盘/印花税/降息降准/监管
- ev_auto: 电车/新能源/智驾/L3/充电/换电/电池安全
- popular_brand_price: 茅台/潮玩/手机炒价/断货/召回/跳水暴涨
- retail_chain: 胖东来/商超/连锁/麦当劳/万店咖啡
- consumer_frontier_tech: AI眼镜/AI手机/人形机器人/消费级AI终端
- consumer_ai_app: 国民级AI应用/效率工具（腾讯元宝/豆包/夸克/百度AI助手/微信AI/支付宝AI等的功能上线/任务/提醒/日程/代办/搜索/购物助手等普通人可直接使用的能力）
- ecommerce_promo: 双11/大促/赛道爆发
- other: 其他

评分标准：
- archetypes: 每个母型0-3分，0=不相关，3=强相关
  - change_happening: 变化正在发生（政策/技术/市场变化）
  - personal_impact: 影响到听众（工作/钱/习惯/生活）
  - competition_conflict: 输赢/冲突/竞争格局
  - risk_opportunity: 风险或机会
  - counter_intuitive: 反直觉/争议/颠覆认知
  - inflection_trend: 趋势拐点
- continuity: 非一次性（0=一次性事件，1=持续事件/系列）
- why_now: 时机性（0=随时可说，1=现在必须说）
- data_enrichable: 可补充历史/对比/数据（0=无法补充，1=易补充）
- follow_up_potential: 可跟进性（0=无后续，1=有明确后续）
- entities: 提取关键实体（人名/公司/产品/地点）
- why_now_reason: 一句话说明时机"""
    
    def _parse_response(self, text: str) -> Optional[dict]:
        try:
            json_text = self._extract_json_block(text)
            json_text = self._clean_json_text(json_text)
            return json.loads(json_text, strict=False)
        except Exception as e:
            self.logger.error(f"解析LLM#0响应失败: {e}")
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


__all__ = ["ItemSignalTagger"]
