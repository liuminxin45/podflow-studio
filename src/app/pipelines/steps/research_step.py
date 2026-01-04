"""
Research Step

研究步骤：对选中的内容进行深度研究
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING

from src.app.pipelines.base_step import BaseStep
from src.research.core.pipeline import ResearchPipeline
from src.research.sources.research_client import create_client_from_env
from src.research.utils.budget import BudgetConfig

if TYPE_CHECKING:
    from src.app.core.context import EpisodeContext


class ResearchStep(BaseStep):
    """研究步骤"""
    
    def execute(self, ctx: EpisodeContext) -> None:
        """执行 Research 步骤"""
        cfg = ctx.config
        research_cfg = cfg.get("research", {})
        
        # 检查是否启用
        if not research_cfg.get("enabled", False):
            self.logger.info("Research 功能未启用，跳过")
            ctx.research_results = []
            ctx.add_event("research_disabled")
            return
        
        # 检查是否有选中的 items
        if not ctx.items_selected:
            self.logger.warning("没有选中的 items，跳过 research")
            ctx.research_results = []
            ctx.add_event("research_skipped_no_items")
            return
        
        from src.utils.logging_config import log_operation, log_api_call
        
        self.logger.info(f"开始 Research：{len(ctx.items_selected)} items")
        
        try:
            # 1. 提取 title 和 summary 字段用于 research
            research_items = []
            total_chars = 0
            for item in ctx.items_selected:
                title = item.get("title", "")
                summary = item.get("summary", "") or item.get("content", "")
                # 限制 summary 长度（前 500 字符）
                if summary and len(summary) > 500:
                    summary = summary[:500]
                
                research_items.append({
                    "id": item.get("id"),
                    "title": title,
                    "summary": summary,
                    "source_name": item.get("source_name", ""),
                })
                total_chars += len(title) + len(summary)
            
            log_operation(
                self.logger,
                step="Research",
                operation="prepare_items",
                result=f"{len(research_items)} items, {total_chars} chars total"
            )
            
            # 2. 创建 research 客户端
            provider = research_cfg.get("provider", "anspire")
            research_client = create_client_from_env(provider=provider)
            
            # 配置预算
            budget_cfg = BudgetConfig(
                max_total_claims=research_cfg.get("max_total_claims", 20),
                max_claims_per_item=research_cfg.get("max_claims_per_item", 5),
            )
            
            # 创建 pipeline
            pipeline = ResearchPipeline(
                research_client=research_client,
                budget_config=budget_cfg,
                scenario="realtime",
            )
            
            # 3. 运行 research（只用 title）
            result = pipeline.run(
                research_items,
                max_claims_per_item=research_cfg.get("max_claims_per_item", 10),
                min_claim_confidence=research_cfg.get("min_claim_confidence", 0.6),
                include_opinions=research_cfg.get("include_opinions", False),
                include_contrast_queries=research_cfg.get("include_contrast_queries", True),
            )
            
            # 检查 research 结果是否为空
            stats = result.get("stats", {})
            total_claims = stats.get("total_claims", 0)
            total_evidence_packs = stats.get("total_evidence_packs", 0)
            
            if total_claims == 0 and total_evidence_packs == 0:
                error_msg = (
                    "Research 失败: 没有生成任何 claims 或 evidence packs。"
                    "可能原因：API 调用失败、解析错误或配置问题。"
                    f"\n结果详情: {result}"
                )
                self.logger.error(error_msg)
                ctx.add_event("research_empty_result", error=error_msg)
                raise RuntimeError(error_msg)
            
            # 4. 将 research 结果组装回原始 items
            evidence_packs = result.get("evidence_packs", [])
            self._merge_research_results(ctx, evidence_packs)
            
            # 保存原始结果
            ctx.research_results = evidence_packs
            
            # 保存到文件
            self._save_research_results(ctx, result)
            
            # 统计
            stats = result.get("stats", {})
            self.logger.info(
                f"Research 完成: {stats.get('total_claims', 0)} claims, "
                f"{stats.get('total_queries', 0)} queries, "
                f"{stats.get('total_evidence_packs', 0)} evidence packs"
            )
            
            ctx.add_event(
                "research_completed",
                claims_count=stats.get("total_claims", 0),
                evidence_packs_count=stats.get("total_evidence_packs", 0),
            )
            
        except Exception as e:
            self.logger.error(f"Research 失败: {e}", exc_info=True)
            ctx.research_results = []
            ctx.add_event("research_failed", error=str(e))
    
    def _merge_research_results(self, ctx: "EpisodeContext", evidence_packs: list) -> None:
        """将 research 结果合并回原始 items"""
        if not evidence_packs:
            self.logger.info("没有 evidence packs，跳过合并")
            return
        
        # 构建 item_id -> evidence_pack 的映射
        evidence_by_item = {}
        for pack in evidence_packs:
            # evidence_pack 可能是 EvidencePack 对象或字典
            if hasattr(pack, "item_id"):
                item_id = pack.item_id
                evidence_by_item[item_id] = pack
            elif isinstance(pack, dict):
                item_id = pack.get("item_id")
                if item_id:
                    evidence_by_item[item_id] = pack
        
        # 将 evidence 合并到 items_selected
        merged_count = 0
        for item in ctx.items_selected:
            item_id = item.get("id")
            if item_id in evidence_by_item:
                evidence = evidence_by_item[item_id]
                
                # 提取 evidence 内容
                if hasattr(evidence, "evidence_summary"):
                    item["research_evidence"] = evidence.evidence_summary
                elif isinstance(evidence, dict):
                    item["research_evidence"] = evidence.get("evidence_summary", "")
                
                # 提取 claims
                if hasattr(evidence, "claims"):
                    item["research_claims"] = [
                        c.claim_text if hasattr(c, "claim_text") else str(c)
                        for c in evidence.claims
                    ]
                elif isinstance(evidence, dict) and "claims" in evidence:
                    item["research_claims"] = evidence.get("claims", [])
                
                merged_count += 1
        
        self.logger.info(f"已将 {merged_count}/{len(ctx.items_selected)} 个 items 的 research 结果合并")
        
        # 保存增强后的 items
        self._save_enhanced_items(ctx)
    
    def _save_enhanced_items(self, ctx: "EpisodeContext") -> None:
        """保存增强后的 items（包含 research 结果）"""
        import json
        
        research_dir = ctx.run_dir / "2_research"
        research_dir.mkdir(parents=True, exist_ok=True)
        
        enhanced_items_path = research_dir / "enhanced_items.json"
        with open(enhanced_items_path, "w", encoding="utf-8") as f:
            json.dump(ctx.items_selected, f, ensure_ascii=False, indent=2)
        
        self.logger.info(f"增强后的 items 已保存: {enhanced_items_path}")
    
    def _save_research_results(self, ctx: "EpisodeContext", result: dict) -> None:
        """保存 research 结果到文件"""
        import json
        
        research_dir = ctx.run_dir / "2_research"
        research_dir.mkdir(parents=True, exist_ok=True)
        
        # 保存完整结果
        result_path = research_dir / "research_result.json"
        with open(result_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "claims": [c.__dict__ if hasattr(c, "__dict__") else c for c in result.get("claims", [])],
                    "clusters": result.get("clusters", []),
                    "queries": [q.__dict__ if hasattr(q, "__dict__") else q for q in result.get("queries", [])],
                    "evidence_packs": [
                        ep.model_dump() if hasattr(ep, "model_dump") else ep
                        for ep in result.get("evidence_packs", [])
                    ],
                    "stats": result.get("stats", {}),
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
        
        self.logger.info(f"Research 结果已保存: {result_path}")
