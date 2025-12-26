"""
Research Pipeline Orchestrator

整合断言提取、去重、预算控制、查询构建、证据收集的完整流程。

Pipeline流程：
1. 从新闻条目提取断言
2. 规范化和去重断言
3. 预算控制：选择Top-N断言
4. 构建调查查询
5. 执行调查（调用MetaSo等）
6. 组装证据包

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from src.research.claims import extract_claims_batch
from src.research.claim_dedup import deduplicate_claims, select_top_claims
from src.research.budget import BudgetConfig, allocate_budget_from_clusters
from src.research.query_builder import build_queries_batch
from src.research.evidence import create_evidence_packs_batch, EvidencePack
from src.research.research_client import UnifiedResearchClient


class ResearchPipeline:
    """研究流程编排器"""
    
    def __init__(
        self,
        research_client: UnifiedResearchClient,
        budget_config: Optional[BudgetConfig] = None,
        scenario: str = "realtime",
    ):
        self.client = research_client
        self.budget_config = budget_config or BudgetConfig()
        self.scenario = scenario
        self.logger = logging.getLogger("research.pipeline")
    
    def run(
        self,
        items: List[Dict[str, Any]],
        *,
        max_claims_per_item: int = 10,
        min_claim_confidence: float = 0.6,
        include_opinions: bool = False,
        include_contrast_queries: bool = True,
    ) -> Dict[str, Any]:
        """
        运行完整的研究流程
        
        Args:
            items: 新闻条目列表
            max_claims_per_item: 每条新闻最多提取的断言数
            min_claim_confidence: 最低断言置信度
            include_opinions: 是否包含观点性断言
            include_contrast_queries: 是否包含对照查询
            
        Returns:
            包含所有中间结果和最终证据包的字典
        """
        self.logger.info(f"开始研究流程，输入 {len(items)} 条新闻")
        
        # 1. 提取断言
        self.logger.info("步骤1: 提取断言")
        claims = extract_claims_batch(
            items,
            max_claims_per_item=max_claims_per_item,
            min_confidence=min_claim_confidence,
            include_opinions=include_opinions,
        )
        self.logger.info(f"提取到 {len(claims)} 个断言")
        
        if not claims:
            self.logger.warning("未提取到任何断言，流程终止")
            return {
                "claims": [],
                "clusters": [],
                "budget_allocation": None,
                "queries": [],
                "evidence_packs": [],
                "stats": {"total_claims": 0, "total_queries": 0, "total_evidence_packs": 0},
            }
        
        # 2. 去重断言
        self.logger.info("步骤2: 去重断言")
        clusters = deduplicate_claims(claims)
        self.logger.info(f"去重后得到 {len(clusters)} 个断言簇")
        
        # 3. 选择Top断言
        self.logger.info("步骤3: 选择Top断言")
        top_clusters = select_top_claims(
            clusters,
            max_claims=self.budget_config.max_total_claims,
            min_confidence=self.budget_config.min_claim_confidence,
        )
        self.logger.info(f"选择 {len(top_clusters)} 个高优先级断言簇")
        
        # 4. 预算分配
        self.logger.info("步骤4: 预算分配")
        allocation = allocate_budget_from_clusters(
            items,
            top_clusters,
            self.budget_config,
        )
        self.logger.info(
            f"预算分配完成: {len(allocation.selected_items)} 条新闻, "
            f"{len(allocation.selected_claims)} 个断言"
        )
        
        # 5. 构建查询
        self.logger.info("步骤5: 构建调查查询")
        queries = build_queries_batch(
            allocation.selected_claims,
            scenario=self.scenario,
            include_contrast=include_contrast_queries,
        )
        self.logger.info(f"构建 {len(queries)} 个查询")
        
        # 6. 执行调查（暂时跳过实际调用，返回模拟结果）
        self.logger.info("步骤6: 执行调查")
        # TODO: 实际调用MetaSo等服务
        # 这里返回空结果，实际集成时需要调用research_client
        results: Dict[str, Dict[str, Any]] = {}
        
        # 7. 组装证据包
        self.logger.info("步骤7: 组装证据包")
        evidence_packs = create_evidence_packs_batch(
            allocation.selected_claims,
            queries,
            results,
        )
        self.logger.info(f"创建 {len(evidence_packs)} 个证据包")
        
        # 8. 统计信息
        stats = {
            "total_items": len(items),
            "total_claims": len(claims),
            "total_clusters": len(clusters),
            "top_clusters": len(top_clusters),
            "selected_items": len(allocation.selected_items),
            "selected_claims": len(allocation.selected_claims),
            "total_queries": len(queries),
            "main_queries": sum(1 for q in queries if q.query_type == "main"),
            "contrast_queries": sum(1 for q in queries if q.query_type == "contrast"),
            "total_evidence_packs": len(evidence_packs),
            "claim_types": {},
        }
        
        # 统计断言类型
        for claim in claims:
            claim_type = claim.claim_type
            stats["claim_types"][claim_type] = stats["claim_types"].get(claim_type, 0) + 1
        
        self.logger.info("研究流程完成")
        
        return {
            "claims": [c.to_dict() for c in claims],
            "clusters": [c.to_dict() for c in top_clusters],
            "budget_allocation": allocation.to_dict(),
            "queries": [q.to_dict() for q in queries],
            "evidence_packs": [p.to_dict() for p in evidence_packs],
            "stats": stats,
        }


def run_research_pipeline(
    items: List[Dict[str, Any]],
    research_client: UnifiedResearchClient,
    *,
    budget_config: Optional[BudgetConfig] = None,
    scenario: str = "realtime",
    max_claims_per_item: int = 10,
    min_claim_confidence: float = 0.6,
) -> Dict[str, Any]:
    """
    便捷函数：运行研究流程
    
    Args:
        items: 新闻条目列表
        research_client: 研究客户端
        budget_config: 预算配置
        scenario: 场景类型 (realtime / research)
        max_claims_per_item: 每条新闻最多提取的断言数
        min_claim_confidence: 最低断言置信度
        
    Returns:
        研究结果字典
    """
    pipeline = ResearchPipeline(
        research_client=research_client,
        budget_config=budget_config,
        scenario=scenario,
    )
    
    return pipeline.run(
        items,
        max_claims_per_item=max_claims_per_item,
        min_claim_confidence=min_claim_confidence,
    )


__all__ = [
    "ResearchPipeline",
    "run_research_pipeline",
]
