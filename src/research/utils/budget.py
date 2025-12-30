"""
Research Budget Control Module

控制调查成本：Top-N 新闻 × M 断言/新闻。

预算策略：
- 新闻级预算：选择最重要的N条新闻
- 断言级预算：每条新闻最多M个断言
- 总预算：全局断言数量上限
- 优先级：根据新闻重要性、断言置信度、类型分配预算

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from src.research.processing.claims import Claim
from src.research.processing.claim_dedup import ClaimCluster


@dataclass
class BudgetConfig:
    """预算配置"""
    max_news_items: int = 10  # 最多调查的新闻数
    max_claims_per_item: int = 5  # 每条新闻最多断言数
    max_total_claims: int = 30  # 全局断言数上限
    priority_claim_types: Optional[List[str]] = None  # 优先断言类型
    min_claim_confidence: float = 0.6  # 最低断言置信度
    
    def __post_init__(self):
        if self.priority_claim_types is None:
            self.priority_claim_types = ["factual", "causal", "predictive"]


@dataclass
class BudgetAllocation:
    """预算分配结果"""
    selected_items: List[Dict[str, Any]]  # 选中的新闻条目
    selected_claims: List[Claim]  # 选中的断言
    claims_by_item: Dict[str, List[Claim]]  # 按新闻ID分组的断言
    budget_used: Dict[str, int]  # 预算使用情况
    budget_stats: Dict[str, Any]  # 统计信息
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "selected_items_count": len(self.selected_items),
            "selected_claims_count": len(self.selected_claims),
            "claims_by_item": {k: len(v) for k, v in self.claims_by_item.items()},
            "budget_used": self.budget_used,
            "budget_stats": self.budget_stats,
        }


def score_news_item(item: Dict[str, Any]) -> float:
    """
    为新闻条目评分，用于预算分配
    
    评分因素：
    - 选择分数（如果有）
    - 新鲜度
    - 来源可信度
    - 内容质量
    
    Args:
        item: 新闻条目
        
    Returns:
        评分（0.0-1.0）
    """
    score = 0.5  # 基础分
    
    # 选择分数（来自cluster selection）
    selection_score = item.get("_selection_score")
    if selection_score is not None:
        score = float(selection_score)
    
    # 质量分数
    quality = item.get("quality") or {}
    if isinstance(quality, dict):
        extract_conf = quality.get("extract_confidence")
        if extract_conf is not None:
            score += float(extract_conf) * 0.1
    
    # 内容长度加分（更详细的新闻）
    content_len = len(str(item.get("content", "")))
    if content_len > 1000:
        score += 0.05
    elif content_len > 500:
        score += 0.03
    
    return min(1.0, score)


def allocate_budget(
    items: List[Dict[str, Any]],
    claims_by_item: Dict[str, List[Claim]],
    config: BudgetConfig,
) -> BudgetAllocation:
    """
    分配调查预算
    
    Args:
        items: 新闻条目列表
        claims_by_item: 按新闻ID分组的断言
        config: 预算配置
        
    Returns:
        预算分配结果
    """
    # 1. 为新闻条目评分并排序
    scored_items = [(item, score_news_item(item)) for item in items]
    scored_items.sort(key=lambda x: x[1], reverse=True)
    
    # 2. 选择Top-N新闻
    selected_items = [item for item, _ in scored_items[:config.max_news_items]]
    
    # 3. 为每条新闻分配断言预算
    selected_claims: List[Claim] = []
    final_claims_by_item: Dict[str, List[Claim]] = {}
    
    for item in selected_items:
        item_id = str(item.get("id", ""))
        item_claims = claims_by_item.get(item_id, [])
        
        if not item_claims:
            continue
        
        # 过滤低置信度断言
        filtered_claims = [
            c for c in item_claims
            if c.confidence >= config.min_claim_confidence
        ]
        
        # 按优先级和置信度排序
        def score_claim(claim: Claim) -> float:
            score = claim.confidence
            # 优先类型加分
            if config.priority_claim_types and claim.claim_type in config.priority_claim_types:
                type_idx = config.priority_claim_types.index(claim.claim_type)
                score += (len(config.priority_claim_types) - type_idx) * 0.05
            return score
        
        filtered_claims.sort(key=score_claim, reverse=True)
        
        # 选择Top-M断言
        item_budget = min(config.max_claims_per_item, len(filtered_claims))
        selected_item_claims = filtered_claims[:item_budget]
        
        if selected_item_claims:
            final_claims_by_item[item_id] = selected_item_claims
            selected_claims.extend(selected_item_claims)
    
    # 4. 应用全局预算限制
    if len(selected_claims) > config.max_total_claims:
        # 按置信度重新排序并截断
        selected_claims.sort(key=lambda x: x.confidence, reverse=True)
        selected_claims = selected_claims[:config.max_total_claims]
        
        # 重建claims_by_item
        selected_claim_ids = {id(c) for c in selected_claims}
        final_claims_by_item = {}
        for item_id, claims in final_claims_by_item.items():
            filtered = [c for c in claims if id(c) in selected_claim_ids]
            if filtered:
                final_claims_by_item[item_id] = filtered
    
    # 5. 统计信息
    claim_type_counts: Dict[str, int] = {}
    for claim in selected_claims:
        claim_type_counts[claim.claim_type] = claim_type_counts.get(claim.claim_type, 0) + 1
    
    budget_stats = {
        "total_items": len(items),
        "selected_items": len(selected_items),
        "total_claims": sum(len(claims) for claims in claims_by_item.values()),
        "selected_claims": len(selected_claims),
        "claim_types": claim_type_counts,
        "avg_claims_per_item": len(selected_claims) / len(selected_items) if selected_items else 0,
    }
    
    budget_used = {
        "news_items": len(selected_items),
        "total_claims": len(selected_claims),
        "max_claims_per_item": max(len(claims) for claims in final_claims_by_item.values()) if final_claims_by_item else 0,
    }
    
    return BudgetAllocation(
        selected_items=selected_items,
        selected_claims=selected_claims,
        claims_by_item=final_claims_by_item,
        budget_used=budget_used,
        budget_stats=budget_stats,
    )


def allocate_budget_from_clusters(
    items: List[Dict[str, Any]],
    clusters: List[ClaimCluster],
    config: BudgetConfig,
) -> BudgetAllocation:
    """
    从断言簇分配预算（去重后的断言）
    
    Args:
        items: 新闻条目列表
        clusters: 断言簇列表
        config: 预算配置
        
    Returns:
        预算分配结果
    """
    # 将簇转换为断言列表，并按来源分组
    claims_by_item: Dict[str, List[Claim]] = {}
    
    for cluster in clusters:
        representative = cluster.representative
        for source_id in cluster.source_item_ids:
            if source_id not in claims_by_item:
                claims_by_item[source_id] = []
            claims_by_item[source_id].append(representative)
    
    return allocate_budget(items, claims_by_item, config)


def estimate_research_cost(
    allocation: BudgetAllocation,
    *,
    cost_per_claim: float = 1.0,
    cost_per_item: float = 0.5,
) -> Dict[str, Any]:
    """
    估算调查成本
    
    Args:
        allocation: 预算分配结果
        cost_per_claim: 每个断言的成本
        cost_per_item: 每条新闻的成本
        
    Returns:
        成本估算信息
    """
    claim_cost = len(allocation.selected_claims) * cost_per_claim
    item_cost = len(allocation.selected_items) * cost_per_item
    total_cost = claim_cost + item_cost
    
    return {
        "claim_cost": claim_cost,
        "item_cost": item_cost,
        "total_cost": total_cost,
        "cost_breakdown": {
            "claims": {
                "count": len(allocation.selected_claims),
                "unit_cost": cost_per_claim,
                "total": claim_cost,
            },
            "items": {
                "count": len(allocation.selected_items),
                "unit_cost": cost_per_item,
                "total": item_cost,
            },
        },
    }


__all__ = [
    "BudgetConfig",
    "BudgetAllocation",
    "allocate_budget",
    "allocate_budget_from_clusters",
    "estimate_research_cost",
]
