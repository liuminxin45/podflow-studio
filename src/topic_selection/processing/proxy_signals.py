"""
Proxy Signals Computer

计算听众兴趣代理信号：trend/time/persona/history_echo
"""

from __future__ import annotations

import datetime as dt
import logging
from collections import Counter
from typing import Dict, List, Optional

from src.topic_selection.core.models import TopicCandidate, ProxySignals
from src.research.retrieval.history_search import HistoryPodcastSearcher


class ProxySignalComputer:
    """代理信号计算器"""
    
    def __init__(
        self,
        history_searcher: Optional[HistoryPodcastSearcher] = None,
        history_dir: str = "out/history_podcasts",
        persona_whitelist: Optional[List[str]] = None,
        persona_penalty_keywords: Optional[List[str]] = None
    ):
        self.history_searcher = history_searcher or HistoryPodcastSearcher(history_dir=history_dir)
        self.persona_whitelist = persona_whitelist  # 策略提供的人群白名单
        self.persona_penalty_keywords = persona_penalty_keywords or []  # 策略提供的惩罚关键词
        self.logger = logging.getLogger("topic_selection.proxy_signals")
    
    def compute_signals(
        self,
        candidates: List[TopicCandidate],
        item_lookup: Dict[str, dict],
        recent_items: Optional[List[dict]] = None
    ) -> List[TopicCandidate]:
        """为所有候选主题计算代理信号"""
        
        for candidate in candidates:
            try:
                proxy_signals = self._compute_single(candidate, item_lookup, recent_items)
                candidate.proxy_signals = proxy_signals
            except Exception as e:
                import traceback
                self.logger.error(f"计算代理信号失败: {candidate.topic_id} - {e}")
                self.logger.error(f"完整堆栈:\n{traceback.format_exc()}")
                candidate.proxy_signals = ProxySignals()
        
        return candidates
    
    def _compute_single(
        self,
        candidate: TopicCandidate,
        item_lookup: Dict[str, dict],
        recent_items: Optional[List[dict]]
    ) -> ProxySignals:
        """计算单个主题的代理信号"""
        
        # 1. trend_signal: 多源重复 + 关键词频率
        trend_signal, trend_details = self._compute_trend_signal(
            candidate, item_lookup, recent_items
        )
        
        # 2. time_signal: 时间窗口匹配
        time_signal = self._compute_time_signal(candidate)
        
        # 3. persona_relevance: 人群相关性（启发式）
        persona_relevance = self._compute_persona_relevance(candidate)
        
        # 4. history_echo: 历史播客检索
        history_echo, history_hits = self._compute_history_echo(candidate)
        
        return ProxySignals(
            trend_signal=trend_signal,
            time_signal=time_signal,
            persona_relevance=persona_relevance,
            history_echo=history_echo,
            trend_details=trend_details,
            history_hits=history_hits
        )
    
    def _compute_trend_signal(
        self,
        candidate: TopicCandidate,
        item_lookup: Dict[str, dict],
        recent_items: Optional[List[dict]]
    ) -> tuple[float, Dict]:
        """计算趋势信号：多源重复 + 关键词频率"""
        
        # 多源重复度
        sources = set()
        for item_id in candidate.items:
            item = item_lookup.get(item_id)
            if not item or not isinstance(item, dict):
                if item:  # 如果item存在但不是字典，记录警告
                    self.logger.warning(f"item_lookup[{item_id}]不是字典，类型: {type(item)}, 值: {str(item)[:100]}")
                continue
            
            # source可能是字符串或字典
            source = item.get("source", "")
            if isinstance(source, dict):
                source_name = source.get("name", "")
            elif isinstance(source, str):
                source_name = source
            else:
                source_name = ""
            
            if source_name:
                sources.add(source_name)
        
        source_diversity = len(sources)
        
        # 关键词频率（在recent_items中）
        keyword_frequency = 0.0
        if recent_items and candidate.entities:
            entity_counter = Counter()
            for item in recent_items:
                if not isinstance(item, dict):
                    continue
                title = (item.get("title") or "").lower()
                content = (item.get("content") or "").lower()
                text = title + " " + content
                
                for entity in candidate.entities:
                    if entity.lower() in text:
                        entity_counter[entity] += 1
            
            if entity_counter:
                max_freq = max(entity_counter.values())
                keyword_frequency = min(1.0, max_freq / 5.0)  # 归一化到0-1
        
        # 综合趋势信号
        trend_signal = min(1.0, (source_diversity / 3.0) * 0.6 + keyword_frequency * 0.4)
        
        details = {
            "source_diversity": source_diversity,
            "keyword_frequency": keyword_frequency,
            "top_entities": [e for e, c in Counter(candidate.entities).most_common(3)]
        }
        
        return trend_signal, details
    
    def _compute_time_signal(self, candidate: TopicCandidate) -> float:
        """计算时间信号：是否在合适的时间窗口
        
        降级策略：无时间信息时返回0.5（中性，不拉胯）
        """
        
        now = dt.datetime.now(dt.timezone.utc)
        
        # 解析last_seen_at
        try:
            if candidate.last_seen_at:
                last_seen = dt.datetime.fromisoformat(candidate.last_seen_at)
                hours_ago = (now - last_seen).total_seconds() / 3600
                
                # 0-24小时：1.0
                # 24-48小时：0.7
                # >48小时：0.3
                if hours_ago <= 24:
                    return 1.0
                elif hours_ago <= 48:
                    return 0.7
                else:
                    return 0.3
        except Exception as e:
            self.logger.debug(f"时间解析失败: {e}")
        
        return 0.5  # 降级：无时间信息时返回中性值
    
    def _compute_persona_relevance(self, candidate: TopicCandidate) -> float:
        """计算人群相关性（启发式）
        
        降级策略：默认0.3基础分，不会全0
        策略增强：支持白名单和惩罚关键词
        """
        
        # 基于signal_profile判断
        signals = candidate.signal_profile
        
        # personal_impact高 → 普通人相关
        from src.topic_selection.core.models import TopicArchetype
        personal_impact = signals.archetypes.get(TopicArchetype.PERSONAL_IMPACT, 0.0)
        
        # 基础评分：0.3 + personal_impact加成
        base_relevance = min(1.0, personal_impact / 3.0 + 0.3)
        
        # 策略调整：检查标题和实体
        title_lower = candidate.title.lower()
        entities_lower = " ".join(candidate.entities).lower()
        text = f"{title_lower} {entities_lower}"
        
        # 惩罚关键词：出现则降低分数
        penalty = 0.0
        for keyword in self.persona_penalty_keywords:
            if keyword.lower() in text:
                penalty += 0.15  # 每个惩罚词-0.15
        
        # 白名单：如果设置了白名单，检查是否匹配
        whitelist_bonus = 0.0
        if self.persona_whitelist:
            # 如果标题/实体中包含白名单人群，给予加成
            for persona in self.persona_whitelist:
                if persona.lower() in text:
                    whitelist_bonus = 0.2  # 匹配白名单+0.2
                    break
        
        # 最终分数
        relevance = base_relevance + whitelist_bonus - penalty
        relevance = max(0.0, min(1.0, relevance))  # clamp到0-1
        
        return relevance
    
    def _compute_history_echo(self, candidate: TopicCandidate) -> tuple[float, List[str]]:
        """计算历史播客呼应
        
        降级策略：无历史库/无命中时返回0.0，但不影响整体打分（权重可调）
        """
        
        try:
            # 使用主题标题和实体检索历史播客
            hits = self.history_searcher.search(
                query=candidate.title,
                entities=candidate.entities[:5],
                topics=None,
                top_k=3
            )
            
            if not hits:
                self.logger.debug(f"无历史呼应: {candidate.topic_id}")
                return 0.0, []
            
            # 计算呼应强度
            echo_strength = min(1.0, len(hits) / 3.0)
            
            # 提取命中的episode_id
            hit_ids = [hit.episode_id for hit in hits]
            
            self.logger.info(f"历史呼应: {candidate.topic_id} → {len(hits)}条历史播客")
            
            return echo_strength, hit_ids
            
        except Exception as e:
            self.logger.warning(f"历史检索失败（降级到0）: {candidate.topic_id} - {e}")
            return 0.0, []


__all__ = ["ProxySignalComputer"]
