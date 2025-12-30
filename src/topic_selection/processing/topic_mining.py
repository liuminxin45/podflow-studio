"""
Topic Candidate Mining

从items+signals聚合生成TopicCandidate（稳定topic_id）
"""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
from typing import Dict, List, Optional

from src.topic_selection.core.models import (
    TopicCandidate,
    SignalScores,
    ItemSignalTagging,
)
from src.utils.models import StoryCluster


class TopicMiner:
    """主题候选挖掘器"""
    
    def __init__(self, time_window_days: int = 7):
        self.time_window_days = time_window_days
        self.logger = logging.getLogger("topic_selection.topic_mining")
    
    def mine_topics(
        self,
        clusters: List[StoryCluster],
        item_lookup: Dict[str, dict],
        signal_taggings: List[ItemSignalTagging]
    ) -> List[TopicCandidate]:
        """从clusters和signals生成TopicCandidate"""
        
        # 构建signal查找表
        signal_map = {tag.item_id: tag for tag in signal_taggings}
        
        candidates = []
        now = dt.datetime.now(dt.timezone.utc)
        
        for cluster in clusters:
            try:
                candidate = self._cluster_to_candidate(
                    cluster, item_lookup, signal_map, now
                )
                if candidate:
                    candidates.append(candidate)
            except Exception as e:
                self.logger.error(f"转换cluster失败: {cluster.cluster_id} - {e}")
        
        self.logger.info(f"生成 {len(candidates)} 个主题候选")
        return candidates
    
    def _cluster_to_candidate(
        self,
        cluster: StoryCluster,
        item_lookup: Dict[str, dict],
        signal_map: Dict[str, ItemSignalTagging],
        now: dt.datetime
    ) -> Optional[TopicCandidate]:
        """将StoryCluster转为TopicCandidate"""
        
        # 获取cluster的items
        items = []
        for item_id in cluster.items:
            item = item_lookup.get(item_id)
            if item:
                items.append(item)
        
        if not items:
            return None
        
        # 收集entities和signals
        all_entities = []
        item_signals = []
        
        for item in items:
            item_id = item.get("id") or item.get("url")
            if not item_id:
                continue
            
            tagging = signal_map.get(item_id)
            if tagging:
                all_entities.extend(tagging.entities)
                item_signals.append(tagging.signals)
        
        # 去重entities
        unique_entities = list(set(all_entities))
        
        # 聚合signals
        aggregated_signals = self._aggregate_signals(item_signals)
        
        # 生成稳定的topic_id
        topic_id = self._generate_topic_id(cluster, unique_entities)
        
        # 获取时间范围（确保是ISO字符串）
        first_seen = cluster.first_seen_at
        if isinstance(first_seen, dt.datetime):
            first_seen = first_seen.isoformat()
        
        last_seen = cluster.last_seen_at
        if isinstance(last_seen, dt.datetime):
            last_seen = last_seen.isoformat()
        
        return TopicCandidate(
            topic_id=topic_id,
            title=cluster.headline or "未命名主题",
            items=[item.get("id") or item.get("url", "") for item in items],
            entities=unique_entities[:10],  # 限制数量
            signal_profile=aggregated_signals,
            domains=aggregated_signals.domains,  # 传递聚合后的domains
            created_at=now.isoformat(),
            first_seen_at=first_seen,
            last_seen_at=last_seen,
            source_cluster_id=cluster.cluster_id
        )
    
    def _aggregate_signals(self, signals_list: List[SignalScores]) -> SignalScores:
        """聚合多个item的signals"""
        if not signals_list:
            return SignalScores()
        
        # 聚合archetypes（取平均）
        all_archetypes = {}
        for signals in signals_list:
            for arch, score in signals.archetypes.items():
                if arch not in all_archetypes:
                    all_archetypes[arch] = []
                all_archetypes[arch].append(score)
        
        avg_archetypes = {
            arch: sum(scores) / len(scores)
            for arch, scores in all_archetypes.items()
        }
        
        # 聚合其他字段（取平均）
        avg_continuity = sum(s.continuity for s in signals_list) / len(signals_list)
        avg_why_now = sum(s.why_now for s in signals_list) / len(signals_list)
        avg_data_enrichable = sum(s.data_enrichable for s in signals_list) / len(signals_list)
        avg_follow_up = sum(s.follow_up_potential for s in signals_list) / len(signals_list)
        
        # 聚合domains（取并集）
        all_domains = set()
        for signals in signals_list:
            all_domains.update(signals.domains)
        
        return SignalScores(
            archetypes=avg_archetypes,
            continuity=avg_continuity,
            why_now=avg_why_now,
            data_enrichable=avg_data_enrichable,
            follow_up_potential=avg_follow_up,
            domains=list(all_domains)
        )
    
    def _generate_topic_id(self, cluster: StoryCluster, entities: List[str]) -> str:
        """生成稳定的topic_id（同一事件跨天能复用）
        
        使用canonical key策略：实体 + 动作词 + 领域，避免标题变化导致hash变化
        """
        
        # 1. 提取主实体（Top3）
        entities_sorted = sorted(set(e.lower().strip() for e in entities[:3] if e.strip()))
        
        # 2. 从标题提取动作词（简单启发式）
        headline_lower = (cluster.headline or "").lower()
        action_words = []
        common_actions = [
            "发布", "宣布", "推出", "上线", "启动", "开启",
            "降价", "涨价", "裁员", "融资", "收购", "合并",
            "监管", "禁止", "审查", "调查", "处罚",
            "破产", "倒闭", "关闭", "退市",
            "release", "launch", "announce", "cut", "raise", "ban"
        ]
        for action in common_actions:
            if action in headline_lower:
                action_words.append(action)
                break  # 只取第一个匹配的动作
        
        # 3. 提取领域（简单启发式）
        domain_words = []
        common_domains = [
            "ai", "人工智能", "模型",
            "汽车", "电动车", "新能源",
            "芯片", "半导体",
            "政策", "监管", "法规",
            "金融", "股市", "货币"
        ]
        for domain in common_domains:
            if domain in headline_lower:
                domain_words.append(domain)
                break
        
        # 4. 构建canonical key
        parts = entities_sorted + action_words + domain_words
        if not parts:
            # 降级：使用规范化后的标题（去年份、去标点、去营销词）
            headline_normalized = headline_lower
            for noise in ["2024", "2025", "2026", "！", "？", "!", "?", "重磅", "震惊", "爆炸"]:
                headline_normalized = headline_normalized.replace(noise, "")
            headline_normalized = headline_normalized.strip()[:50]  # 限制长度
            parts = [headline_normalized]
        
        canonical_key = "|".join(parts)
        hash_hex = hashlib.sha256(canonical_key.encode("utf-8")).hexdigest()[:12]
        
        return f"topic:{hash_hex}"


__all__ = ["TopicMiner"]
