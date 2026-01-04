"""
LLM 新闻合并器 - 使用 LLM 智能判断同主题新闻并合并

相比规则合并器的优势：
1. 理解语义相似性（不仅仅是实体/关键词匹配）
2. 识别逻辑关联（因果、对比、补充等）
3. 判断是否适合合并（避免过度合并）
4. 生成更准确的叙述提示
"""

import json
import logging
from typing import List, Dict, Optional
from collections import defaultdict


logger = logging.getLogger(__name__)


class LLMNewsMerger:
    """基于 LLM 的新闻合并器"""
    
    def __init__(
        self,
        llm_client,
        merge_threshold: float = 0.7,
        max_merge_count: int = 5,
    ):
        """
        Args:
            llm_client: LLM 客户端（DeepSeek/Moonshot）
            merge_threshold: 合并置信度阈值（0-1）
            max_merge_count: 单组最多合并新闻数
        """
        self.llm_client = llm_client
        self.merge_threshold = merge_threshold
        self.max_merge_count = max_merge_count
    
    def merge_news_items(self, items: List[dict]) -> List[dict]:
        """
        使用 LLM 智能合并同主题新闻
        
        Args:
            items: 原始新闻列表
        
        Returns:
            合并后的新闻列表
        """
        if len(items) <= 1:
            return items
        
        logger.info(f"开始 LLM 新闻合并分析: {len(items)} 条新闻")
        
        # 1. 使用 LLM 分析新闻关联
        merge_plan = self._analyze_news_relations(items)
        
        if not merge_plan or not merge_plan.get("clusters"):
            logger.info("LLM 判断无需合并")
            return items
        
        # 2. 执行合并
        merged_items = self._execute_merge_plan(items, merge_plan)
        
        logger.info(
            f"LLM 新闻合并完成: {len(items)} 条 → {len(merged_items)} 条 "
            f"(合并了 {len(merge_plan['clusters'])} 组)"
        )
        
        return merged_items
    
    def _analyze_news_relations(self, items: List[dict]) -> Optional[Dict]:
        """
        使用 LLM 分析新闻之间的关联关系
        
        Returns:
            {
                "clusters": [
                    {
                        "indices": [0, 1, 2],
                        "theme": "主题描述",
                        "relation_type": "series|contrast|causal|complementary",
                        "confidence": 0.9,
                        "narrative_strategy": "叙述策略"
                    }
                ]
            }
        """
        system_prompt = """你是新闻编辑助手，负责识别相关新闻并判断是否适合合并叙述。

任务：分析一组新闻，识别可以合并为一条递进叙述的相关新闻。

判断标准：
1. **主题关联**：新闻讨论同一实体、事件或话题
2. **逻辑关系**：
   - 系列动态（同一主体的多个动作）
   - 因果关系（A 导致 B）
   - 对比关系（A vs B）
   - 补充关系（不同角度看同一事件）
3. **适合合并**：合并后能形成连贯、递进的叙述

不应合并的情况：
- 虽然相关但缺乏逻辑连接
- 主题重叠但角度完全不同（更适合对比而非合并）
- 合并后会显得冗长或重复

输出 JSON 格式（不要 Markdown 代码块）：
{
  "clusters": [
    {
      "indices": [0, 1, 2],
      "theme": "主题描述（如：小米汽车系列动态）",
      "relation_type": "series|contrast|causal|complementary",
      "confidence": 0.9,
      "narrative_strategy": "叙述策略（如：按时间线递进、从现象到原因、对比两个角度）"
    }
  ],
  "reasoning": "判断理由"
}

如果没有需要合并的新闻，返回：{"clusters": [], "reasoning": "..."}
"""
        
        # 构造用户 prompt
        news_list = []
        for i, item in enumerate(items):
            news_list.append({
                "index": i,
                "title": item.get("title", ""),
                "text": (item.get("text", "") or item.get("title", ""))[:300],  # 限制长度
                "entities": item.get("entities", [])[:5],  # 限制实体数
            })
        
        user_prompt = f"""请分析以下 {len(items)} 条新闻，识别可以合并叙述的相关新闻组：

{json.dumps(news_list, ensure_ascii=False, indent=2)}

要求：
1. 只合并确实有逻辑关联的新闻（置信度 >= 0.7）
2. 每组最多 {self.max_merge_count} 条新闻
3. 合并后应能形成流畅的递进叙述
4. 输出 JSON，不要 Markdown 代码块"""
        
        try:
            # 调用 LLM
            from src.utils.logging_config import log_api_call
            
            char_count = len(system_prompt) + len(user_prompt)
            log_api_call(
                logger,
                api_type="LLM",
                operation="news_merge_analysis",
                char_count=char_count
            )
            
            payload = {
                "model": getattr(self.llm_client, 'model', 'deepseek-chat'),
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 1000
            }
            
            response_data = self.llm_client._post_json(payload)
            if not response_data:
                logger.error("LLM 返回空响应")
                return None
            
            content = response_data["choices"][0]["message"]["content"]
            
            # 解析 JSON
            merge_plan = self._parse_llm_response(content)
            
            if merge_plan:
                logger.info(
                    f"LLM 识别出 {len(merge_plan.get('clusters', []))} 个合并组: "
                    f"{merge_plan.get('reasoning', '')}"
                )
            
            return merge_plan
            
        except Exception as e:
            logger.error(f"LLM 新闻合并分析失败: {e}")
            return None
    
    def _parse_llm_response(self, text: str) -> Optional[Dict]:
        """解析 LLM 响应"""
        import re
        
        # 去除 Markdown 代码块
        text = re.sub(r'```json\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'```\s*', '', text)
        text = text.strip()
        
        # 提取 JSON 对象
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            text = text[start:end+1]
        
        try:
            result = json.loads(text)
            
            # 过滤低置信度的聚类
            if "clusters" in result:
                result["clusters"] = [
                    c for c in result["clusters"]
                    if c.get("confidence", 0) >= self.merge_threshold
                ]
            
            return result
        except json.JSONDecodeError as e:
            logger.error(f"解析 LLM 响应失败: {e}\n原始文本: {text[:200]}")
            return None
    
    def _execute_merge_plan(
        self,
        items: List[dict],
        merge_plan: Dict
    ) -> List[dict]:
        """执行合并计划"""
        merged_items = []
        merged_indices = set()
        
        # 执行每个聚类的合并
        for cluster in merge_plan.get("clusters", []):
            indices = cluster.get("indices", [])
            
            # 验证索引有效性
            if not indices or any(i >= len(items) for i in indices):
                logger.warning(f"无效的索引: {indices}")
                continue
            
            # 限制合并数量
            if len(indices) > self.max_merge_count:
                logger.warning(f"合并数量超限，截断到 {self.max_merge_count}")
                indices = indices[:self.max_merge_count]
            
            # 合并这组新闻
            cluster_items = [items[i] for i in indices]
            merged_item = self._merge_cluster_with_llm_meta(cluster_items, cluster)
            merged_items.append(merged_item)
            
            merged_indices.update(indices)
            
            logger.info(
                f"合并 {len(indices)} 条新闻: {cluster.get('theme', '')} "
                f"(置信度: {cluster.get('confidence', 0):.0%})"
            )
        
        # 添加未合并的独立新闻
        for i, item in enumerate(items):
            if i not in merged_indices:
                merged_items.append(item)
        
        return merged_items
    
    def _merge_cluster_with_llm_meta(
        self,
        items: List[dict],
        cluster_meta: Dict
    ) -> dict:
        """
        使用 LLM 提供的元信息合并新闻
        
        Args:
            items: 要合并的新闻列表
            cluster_meta: LLM 提供的聚类元信息
        """
        # 按时间排序（如果有）
        sorted_items = sorted(
            items,
            key=lambda x: x.get("published_at") or x.get("created_at") or "",
        )
        
        # 构造复合新闻
        theme = cluster_meta.get("theme", "相关动态")
        relation_type = cluster_meta.get("relation_type", "series")
        narrative_strategy = cluster_meta.get("narrative_strategy", "")
        
        merged_item = {
            "id": f"merged_llm_{sorted_items[0].get('id', '')}",
            "title": f"{theme}（{len(sorted_items)}条）",
            "text": self._generate_merged_text(sorted_items),
            "source_name": self._merge_sources(sorted_items),
            "entities": self._merge_entities(sorted_items),
            
            # 元数据
            "is_merged": True,
            "merged_count": len(sorted_items),
            "merge_method": "llm",
            "relation_type": relation_type,
            "confidence": cluster_meta.get("confidence", 0.8),
            "sub_items": sorted_items,
            "narrative_hint": self._generate_narrative_hint(
                len(sorted_items),
                relation_type,
                narrative_strategy
            ),
        }
        
        return merged_item
    
    def _generate_merged_text(self, items: List[dict]) -> str:
        """生成合并后的文本"""
        texts = []
        for i, item in enumerate(items, 1):
            text = item.get("text", "") or item.get("title", "")
            texts.append(f"【动态{i}】{text}")
        
        return "\n\n".join(texts)
    
    def _merge_sources(self, items: List[dict]) -> str:
        """合并来源"""
        sources = [item.get("source_name", "") for item in items if item.get("source_name")]
        unique_sources = list(dict.fromkeys(sources))
        
        if len(unique_sources) <= 2:
            return "、".join(unique_sources)
        else:
            return f"{unique_sources[0]} 等{len(unique_sources)}家媒体"
    
    def _merge_entities(self, items: List[dict]) -> List[str]:
        """合并实体"""
        all_entities = []
        for item in items:
            all_entities.extend(item.get("entities", []))
        
        unique_entities = list(dict.fromkeys(all_entities))
        return unique_entities
    
    def _generate_narrative_hint(
        self,
        count: int,
        relation_type: str,
        custom_strategy: str
    ) -> str:
        """生成叙述提示"""
        if custom_strategy:
            return custom_strategy
        
        # 根据关系类型生成默认提示
        strategies = {
            "series": f"系列动态叙述：按时间线或逻辑顺序依次展开 {count} 条新闻，形成完整发展脉络",
            "causal": f"因果关系叙述：先讲原因/背景，再讲结果/影响，形成逻辑闭环",
            "contrast": f"对比关系叙述：并列展示两个角度或立场，突出差异或矛盾",
            "complementary": f"补充关系叙述：从不同维度展开同一事件，形成全景视角",
        }
        
        return strategies.get(relation_type, f"递进式叙述：将 {count} 条新闻串联成连贯故事")


__all__ = ["LLMNewsMerger"]
