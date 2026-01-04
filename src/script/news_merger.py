"""
新闻合并器 - 识别并合并同主题新闻

功能：
1. 检测同主题新闻（基于实体、关键词、标题相似度）
2. 将同主题新闻合并为递进式叙述
3. 保留独立新闻的完整性
"""

import logging
from typing import List, Dict, Set
from collections import defaultdict
from difflib import SequenceMatcher


logger = logging.getLogger(__name__)


class NewsMerger:
    """新闻合并器"""
    
    def __init__(
        self,
        entity_similarity_threshold: float = 0.5,
        title_similarity_threshold: float = 0.3,
        min_shared_keywords: int = 2,
    ):
        """
        Args:
            entity_similarity_threshold: 实体重叠度阈值（0-1）
            title_similarity_threshold: 标题相似度阈值（0-1）
            min_shared_keywords: 最少共享关键词数
        """
        self.entity_similarity_threshold = entity_similarity_threshold
        self.title_similarity_threshold = title_similarity_threshold
        self.min_shared_keywords = min_shared_keywords
    
    def merge_news_items(self, items: List[dict]) -> List[dict]:
        """
        合并同主题新闻
        
        Args:
            items: 原始新闻列表
        
        Returns:
            合并后的新闻列表（包含独立新闻和复合新闻）
        """
        if len(items) <= 1:
            return items
        
        # 1. 构建相似度图
        similarity_graph = self._build_similarity_graph(items)
        
        # 2. 聚类同主题新闻
        clusters = self._cluster_by_similarity(items, similarity_graph)
        
        # 3. 合并每个聚类
        merged_items = []
        for cluster_indices in clusters:
            if len(cluster_indices) == 1:
                # 独立新闻，直接保留
                merged_items.append(items[cluster_indices[0]])
            else:
                # 同主题新闻，合并
                cluster_items = [items[i] for i in cluster_indices]
                merged_item = self._merge_cluster(cluster_items)
                merged_items.append(merged_item)
                
                logger.info(
                    f"合并 {len(cluster_items)} 条同主题新闻: "
                    f"{', '.join([item.get('title', '')[:30] for item in cluster_items])}"
                )
        
        logger.info(f"新闻合并完成: {len(items)} 条 → {len(merged_items)} 条")
        return merged_items
    
    def _build_similarity_graph(self, items: List[dict]) -> Dict[int, Set[int]]:
        """构建新闻相似度图"""
        graph = defaultdict(set)
        
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                if self._is_similar(items[i], items[j]):
                    graph[i].add(j)
                    graph[j].add(i)
        
        return graph
    
    def _is_similar(self, item1: dict, item2: dict) -> bool:
        """判断两条新闻是否相似"""
        # 策略 1: 实体重叠度
        entities1 = set(item1.get("entities", []))
        entities2 = set(item2.get("entities", []))
        
        if entities1 and entities2:
            intersection = entities1 & entities2
            union = entities1 | entities2
            entity_similarity = len(intersection) / len(union) if union else 0
            
            if entity_similarity >= self.entity_similarity_threshold:
                logger.debug(
                    f"实体相似度匹配: {entity_similarity:.2f} "
                    f"({intersection})"
                )
                return True
        
        # 策略 2: 标题相似度
        title1 = item1.get("title", "")
        title2 = item2.get("title", "")
        
        if title1 and title2:
            title_similarity = SequenceMatcher(None, title1, title2).ratio()
            
            if title_similarity >= self.title_similarity_threshold:
                logger.debug(
                    f"标题相似度匹配: {title_similarity:.2f}"
                )
                return True
        
        # 策略 3: 共享关键词（简单提取）
        keywords1 = self._extract_keywords(item1)
        keywords2 = self._extract_keywords(item2)
        
        shared_keywords = keywords1 & keywords2
        if len(shared_keywords) >= self.min_shared_keywords:
            logger.debug(
                f"关键词相似度匹配: {len(shared_keywords)} 个共享关键词 "
                f"({shared_keywords})"
            )
            return True
        
        return False
    
    def _extract_keywords(self, item: dict) -> Set[str]:
        """简单提取关键词（基于实体和标题）"""
        keywords = set()
        
        # 实体作为关键词
        keywords.update(item.get("entities", []))
        
        # 标题中的特殊词汇（品牌、数字等）
        title = item.get("title", "")
        
        # 简单规则：提取包含特定字符的词
        import re
        # 提取品牌名（中文+英文）
        brands = re.findall(r'[A-Z][a-zA-Z]+|[\u4e00-\u9fa5]{2,}(?:汽车|科技|电动|新能源)', title)
        keywords.update(brands)
        
        return keywords
    
    def _cluster_by_similarity(
        self,
        items: List[dict],
        graph: Dict[int, Set[int]]
    ) -> List[List[int]]:
        """基于相似度图聚类新闻"""
        visited = set()
        clusters = []
        
        def dfs(node: int, cluster: List[int]):
            """深度优先搜索聚类"""
            if node in visited:
                return
            visited.add(node)
            cluster.append(node)
            
            for neighbor in graph.get(node, []):
                dfs(neighbor, cluster)
        
        for i in range(len(items)):
            if i not in visited:
                cluster = []
                dfs(i, cluster)
                clusters.append(sorted(cluster))
        
        return clusters
    
    def _merge_cluster(self, items: List[dict]) -> dict:
        """
        合并一组同主题新闻为复合新闻
        
        策略：
        1. 保留所有原始信息
        2. 标记为复合新闻
        3. 提供合并提示
        """
        # 按时间排序（如果有）
        sorted_items = sorted(
            items,
            key=lambda x: x.get("published_at") or x.get("created_at") or "",
        )
        
        # 构造复合新闻
        merged_item = {
            "id": f"merged_{sorted_items[0].get('id', '')}",
            "title": self._generate_merged_title(sorted_items),
            "text": self._generate_merged_text(sorted_items),
            "source_name": self._merge_sources(sorted_items),
            "entities": self._merge_entities(sorted_items),
            
            # 元数据
            "is_merged": True,
            "merged_count": len(sorted_items),
            "sub_items": sorted_items,  # 保留原始新闻
            "narrative_hint": self._generate_narrative_hint(sorted_items),
        }
        
        return merged_item
    
    def _generate_merged_title(self, items: List[dict]) -> str:
        """生成合并后的标题"""
        # 提取主题实体（取第一条的主要实体）
        main_entities = items[0].get("entities", [])
        main_entity = main_entities[0] if main_entities else "相关"
        
        return f"{main_entity}系列动态（{len(items)}条）"
    
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
        unique_sources = list(dict.fromkeys(sources))  # 去重保序
        
        if len(unique_sources) <= 2:
            return "、".join(unique_sources)
        else:
            return f"{unique_sources[0]} 等{len(unique_sources)}家媒体"
    
    def _merge_entities(self, items: List[dict]) -> List[str]:
        """合并实体"""
        all_entities = []
        for item in items:
            all_entities.extend(item.get("entities", []))
        
        # 去重保序
        unique_entities = list(dict.fromkeys(all_entities))
        return unique_entities
    
    def _generate_narrative_hint(self, items: List[dict]) -> str:
        """
        生成叙述提示（供脚本生成器使用）
        
        提示如何组织这些新闻的叙述顺序
        """
        if len(items) == 2:
            return "递进式叙述：先讲第一条，然后自然过渡到第二条，形成递进关系"
        elif len(items) == 3:
            return "三段式叙述：按时间线或逻辑顺序依次展开，形成完整的发展脉络"
        else:
            return f"系列叙述：将{len(items)}条新闻串联成一个完整的故事，突出发展趋势"


__all__ = ["NewsMerger"]
