"""
Base Topic Selection Strategy

定义策略接口和基类
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Tuple
import re

from src.topic_selection.processing.topic_scoring import TopicScorerConfig


class BaseTopicStrategy(ABC):
    """选题策略基类
    
    每个策略定义：
    1. Signal tagging prompt 模板
    2. TopicScorer 配置（权重、阈值）
    3. Persona 人群过滤规则
    4. Keyword 关键词调整规则
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """策略名称"""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """策略描述"""
        pass
    
    @abstractmethod
    def get_signal_prompt_template(self) -> str:
        """获取 signal tagging 的 prompt 模板
        
        模板中可使用占位符：
        - {title}: 新闻标题
        - {content}: 新闻内容
        
        Returns:
            完整的 prompt 模板字符串
        """
        pass
    
    @abstractmethod
    def get_scorer_config(self) -> TopicScorerConfig:
        """获取打分器配置
        
        Returns:
            TopicScorerConfig 实例
        """
        pass
    
    def get_persona_whitelist(self) -> Optional[List[str]]:
        """获取人群白名单（用于 persona_score 加权）
        
        Returns:
            人群标签列表，None 表示不限制
        """
        return None
    
    def get_persona_penalty_keywords(self) -> List[str]:
        """获取人群惩罚关键词（出现这些词降低 persona_score）
        
        Returns:
            关键词列表
        """
        return []
    
    def get_keyword_adjustments(self) -> Dict[str, float]:
        """获取关键词分数调整规则（简单字符串匹配）
        
        Returns:
            {keyword: score_delta} 映射
            正数表示加分，负数表示减分
        """
        return {}
    
    def get_pattern_adjustments(self) -> List[Tuple[str, float, str]]:
        """获取正则模式分数调整规则
        
        Returns:
            List of (pattern, score_delta, description)
            pattern: 正则表达式字符串
            score_delta: 分数调整值
            description: 规则描述（用于日志）
        """
        return []
    
    def get_compound_adjustments(self) -> List[Dict]:
        """获取联合命中规则（AND规则）
        
        Returns:
            List of compound rules, each rule is a dict:
            {
                "anchor_patterns": ["pattern1", "pattern2"],  # 锚点模式（必须命中其一）
                "trigger_patterns": ["pattern3", "pattern4"], # 触发模式（必须命中其一）
                "bonus": 10.0,                                 # 加分值
                "description": "规则描述"                      # 用于日志
            }
        """
        return []
    
    def get_domain_bonus_map(self) -> Dict[str, float]:
        """获取语义域加分映射
        
        Returns:
            {domain: bonus} 映射
            domain: 语义域标签（如 national_culture, real_estate）
            bonus: 加分值
        """
        return {}
    
    def apply_keyword_adjustment(self, candidate_title: str, base_score: float) -> float:
        """应用关键词调整到候选主题分数（已废弃，使用 compute_strategy_adjustment）
        
        Args:
            candidate_title: 候选主题标题
            base_score: 基础分数
        
        Returns:
            调整后的分数
        """
        adjustments = self.get_keyword_adjustments()
        if not adjustments:
            return base_score
        
        title_lower = candidate_title.lower()
        total_adjustment = 0.0
        
        for keyword, delta in adjustments.items():
            if keyword.lower() in title_lower:
                total_adjustment += delta
        
        # Clamp 到 0-100
        adjusted = base_score + total_adjustment
        return max(0.0, min(100.0, adjusted))
    
    def compute_strategy_adjustment(
        self,
        candidate_title: str,
        candidate_entities: List[str],
        candidate_domains: List[str],
        enable_keywords: bool = True,
        enable_patterns: bool = True,
        enable_compounds: bool = True,
        enable_domains: bool = True,
    ) -> Dict:
        """计算策略调整（keywords + patterns + compounds + domains）
        
        Args:
            candidate_title: 候选主题标题
            candidate_entities: 候选主题实体列表
            candidate_domains: 候选主题语义域列表
            enable_keywords: 是否启用关键词匹配
            enable_patterns: 是否启用正则模式匹配
            enable_compounds: 是否启用联合规则
            enable_domains: 是否启用语义域加分
        
        Returns:
            {
                "total_adjustment": float,
                "matched_keywords": List[str],
                "matched_patterns": List[str],
                "matched_compounds": List[str],
                "matched_domains": List[str],
                "domain_bonus": float,
            }
        """
        result = {
            "total_adjustment": 0.0,
            "matched_keywords": [],
            "matched_patterns": [],
            "matched_compounds": [],
            "matched_domains": [],
            "domain_bonus": 0.0,
        }
        
        # 准备文本（标题 + 实体）
        text = f"{candidate_title} {' '.join(candidate_entities)}"
        text_lower = text.lower()
        
        # 定义消费域（用于技术惩罚豁免）
        consumer_domains = {
            "consumer_ai_app", "real_estate", "macro_consume_policy",
            "precious_metals", "a_share_market", "ev_auto",
            "popular_brand_price", "retail_chain", "consumer_frontier_tech",
            "ecommerce_promo", "national_culture"
        }
        has_consumer_domain = bool(set(candidate_domains) & consumer_domains)
        
        # 技术惩罚词列表（需要豁免的）
        tech_penalty_keywords = {
            "开源", "模型", "框架", "API", "训练", "推理", "SOTA", "benchmark",
            "SDK", "架构", "论文", "基准"
        }
        
        # 1. 关键词匹配（带域内惩罚豁免）
        if enable_keywords:
            keyword_adj = self.get_keyword_adjustments()
            for keyword, delta in keyword_adj.items():
                if keyword.lower() in text_lower:
                    # 如果是技术惩罚词且命中消费域，则豁免或打折
                    if keyword in tech_penalty_keywords and delta < 0 and has_consumer_domain:
                        # 豁免：将负分折扣到20%（-8 -> -1.6）
                        adjusted_delta = delta * 0.2
                        result["total_adjustment"] += adjusted_delta
                        result["matched_keywords"].append(f"{keyword}(豁免{int((1-0.2)*100)}%)")
                    else:
                        result["total_adjustment"] += delta
                        result["matched_keywords"].append(keyword)
        
        # 2. 正则模式匹配
        if enable_patterns:
            pattern_adj = self.get_pattern_adjustments()
            for pattern_str, delta, desc in pattern_adj:
                try:
                    if re.search(pattern_str, text, re.IGNORECASE):
                        result["total_adjustment"] += delta
                        result["matched_patterns"].append(desc or pattern_str)
                except re.error:
                    pass  # 忽略无效正则
        
        # 3. 联合规则（AND）
        if enable_compounds:
            compound_rules = self.get_compound_adjustments()
            for rule in compound_rules:
                anchor_patterns = rule.get("anchor_patterns", [])
                trigger_patterns = rule.get("trigger_patterns", [])
                bonus = rule.get("bonus", 0.0)
                desc = rule.get("description", "compound_rule")
                
                # 检查是否命中锚点
                anchor_hit = False
                for anchor_pat in anchor_patterns:
                    try:
                        if re.search(anchor_pat, text, re.IGNORECASE):
                            anchor_hit = True
                            break
                    except re.error:
                        pass
                
                if not anchor_hit:
                    continue
                
                # 检查是否命中触发器
                trigger_hit = False
                for trigger_pat in trigger_patterns:
                    try:
                        if re.search(trigger_pat, text, re.IGNORECASE):
                            trigger_hit = True
                            break
                    except re.error:
                        pass
                
                if trigger_hit:
                    result["total_adjustment"] += bonus
                    result["matched_compounds"].append(desc)
        
        # 4. 语义域加分
        if enable_domains:
            domain_bonus_map = self.get_domain_bonus_map()
            for domain in candidate_domains:
                if domain in domain_bonus_map:
                    bonus = domain_bonus_map[domain]
                    result["domain_bonus"] += bonus
                    result["total_adjustment"] += bonus
                    result["matched_domains"].append(domain)
        
        return result
    
    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}: {self.name}>"


__all__ = ["BaseTopicStrategy"]
