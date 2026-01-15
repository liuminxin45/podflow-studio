"""
Research Stage Implementation

研究阶段：对选中的内容进行深度研究
"""

from __future__ import annotations

from pathlib import Path
from typing import List

from src.stages.base import BaseStage
from src.stages.registry import StageRegistry
from src.stages.schemas.research import ResearchInput, ResearchOutput, ResearchStats
from src.stages.schemas.common import EvidencePackSchema, EvidenceSchema, ItemSchema


@StageRegistry.register
class ResearchStage(BaseStage[ResearchInput, ResearchOutput]):
    """研究 Stage"""
    
    @property
    def name(self) -> str:
        return "research"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    @property
    def input_schema(self) -> type[ResearchInput]:
        return ResearchInput
    
    @property
    def output_schema(self) -> type[ResearchOutput]:
        return ResearchOutput
    
    def execute(self, input_data: ResearchInput) -> ResearchOutput:
        """执行研究"""
        run_dir = Path(input_data.run_dir)
        artifacts_dir = run_dir / "3_research"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        
        cfg = input_data.research_config
        
        # 检查是否启用
        if not cfg.enabled:
            self.logger.info("Research 功能未启用，跳过")
            self.logger.info(f"Research config: enabled={cfg.enabled}, provider={cfg.provider}")
            return ResearchOutput(
                run_id=input_data.run_id,
                episode_date=input_data.episode_date,
                artifacts_dir=str(artifacts_dir),
                items_enhanced=[item for item in input_data.items],
                evidence_packs=[],
                stats=ResearchStats(
                    run_id=input_data.run_id,
                    episode_date=input_data.episode_date,
                    run_dir=input_data.run_dir,
                ),
            )
        
        if not input_data.items:
            self.logger.warning("没有 items，跳过 research")
            return ResearchOutput(
                run_id=input_data.run_id,
                episode_date=input_data.episode_date,
                artifacts_dir=str(artifacts_dir),
                items_enhanced=[],
                evidence_packs=[],
                stats=ResearchStats(
                    run_id=input_data.run_id,
                    episode_date=input_data.episode_date,
                    run_dir=input_data.run_dir,
                ),
            )
        
        from src.research.core.pipeline import ResearchPipeline
        from src.research.sources.research_client import create_client_from_env
        from src.research.utils.budget import BudgetConfig
        
        self.logger.info(f"开始 Research: {len(input_data.items)} items")
        self.logger.info(f"Research config: enabled={cfg.enabled}, provider={cfg.provider}, max_total_claims={cfg.max_total_claims}, max_claims_per_item={cfg.max_claims_per_item}")
        
        # 准备 research items
        research_items = []
        for item in input_data.items:
            summary = item.summary or item.content or ""
            if len(summary) > 500:
                summary = summary[:500]
            
            research_items.append({
                "id": item.id,
                "title": item.title,
                "summary": summary,
                "source_name": item.source_name or "",
            })
        
        # 创建 research 客户端
        research_client = create_client_from_env(provider=cfg.provider)
        research_client.config.save_dir = str(artifacts_dir)
        
        # 配置预算
        budget_cfg = BudgetConfig(
            max_total_claims=cfg.max_total_claims,
            max_claims_per_item=cfg.max_claims_per_item,
        )
        
        # 创建 pipeline
        pipeline = ResearchPipeline(
            research_client=research_client,
            budget_config=budget_cfg,
            scenario="realtime",
        )
        
        # 运行 research
        result = pipeline.run(
            research_items,
            max_claims_per_item=cfg.max_claims_per_item,
            min_claim_confidence=cfg.min_claim_confidence,
            include_opinions=cfg.include_opinions,
            include_contrast_queries=cfg.include_contrast_queries,
        )
        
        # 转换证据包
        evidence_packs_raw = result.get("evidence_packs", [])
        evidence_packs = []
        for pack in evidence_packs_raw:
            evidences = []
            for e in pack.get("main_evidence", []):
                evidences.append(EvidenceSchema(
                    source=e.get("source_title", ""),
                    content=e.get("content", ""),
                    url=e.get("source_url"),
                ))
            
            # Extract claim text - handle both dict and string formats
            claim_data = pack.get("claim", "")
            if isinstance(claim_data, dict):
                claim_text = claim_data.get("text", "")
            else:
                claim_text = str(claim_data)
            
            evidence_packs.append(EvidencePackSchema(
                claim=claim_text,
                query=pack.get("query"),
                evidences=evidences,
                confidence=pack.get("confidence"),
            ))
        
        # 增强 items
        items_enhanced = []
        item_evidence_map = {}
        
        for pack in evidence_packs_raw:
            item_id = pack.get("item_id")
            if item_id:
                if item_id not in item_evidence_map:
                    item_evidence_map[item_id] = []
                item_evidence_map[item_id].append(pack)
        
        for item in input_data.items:
            item_dict = item.model_dump()
            item_packs = item_evidence_map.get(item.id, [])
            
            # 添加证据包到 item
            item_dict["evidence_packs"] = [
                EvidencePackSchema(
                    claim=p.get("claim", {}).get("text", "") if isinstance(p.get("claim"), dict) else str(p.get("claim", "")),
                    query=p.get("query"),
                    evidences=[
                        EvidenceSchema(
                            source=e.get("source", ""),
                            content=e.get("content", ""),
                            url=e.get("url"),
                        )
                        for e in p.get("evidences", [])
                    ],
                )
                for p in item_packs
            ]
            
            items_enhanced.append(ItemSchema.model_validate(item_dict))
        
        stats = result.get("stats", {})
        
        return ResearchOutput(
            run_id=input_data.run_id,
            episode_date=input_data.episode_date,
            artifacts_dir=str(artifacts_dir),
            items_enhanced=items_enhanced,
            evidence_packs=evidence_packs,
            stats=ResearchStats(
                run_id=input_data.run_id,
                episode_date=input_data.episode_date,
                run_dir=input_data.run_dir,
                total_items=len(input_data.items),
                total_claims=stats.get("total_claims", 0),
                total_queries=stats.get("total_queries", 0),
                total_evidence_packs=stats.get("total_evidence_packs", 0),
            ),
        )
