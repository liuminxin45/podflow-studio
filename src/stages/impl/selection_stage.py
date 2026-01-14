"""
Selection Stage Implementation

选题阶段：从 clusters 中选择要制作的内容
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

from src.stages.base import BaseStage
from src.stages.registry import StageRegistry
from src.stages.schemas.selection import (
    SelectionInput,
    SelectionOutput,
    SelectionStats,
    TopicCandidate,
)
from src.stages.schemas.common import ClusterSchema, ItemSchema


@StageRegistry.register
class SelectionStage(BaseStage[SelectionInput, SelectionOutput]):
    """选题 Stage"""
    
    @property
    def name(self) -> str:
        return "selection"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    @property
    def input_schema(self) -> type[SelectionInput]:
        return SelectionInput
    
    @property
    def output_schema(self) -> type[SelectionOutput]:
        return SelectionOutput
    
    def execute(self, input_data: SelectionInput) -> SelectionOutput:
        """执行选题"""
        from src.store.selection.selector import select_clusters, SelectionConfig
        from src.store.selection.scoring import ScoringConfig, ScoreWeights
        from src.store.selection.constraints import ConstraintConfig
        
        run_dir = Path(input_data.run_dir)
        artifacts_dir = run_dir / "2_selection"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        
        # 转换数据
        items_dict = {k: v.model_dump() for k, v in input_data.items.items()}
        
        # 构建 SelectionConfig
        cfg = input_data.selection_config
        weights = cfg.weights
        
        score_weights = ScoreWeights(
            freshness=weights.freshness,
            impact=weights.impact,
            source_trust=weights.source_trust,
            quality=weights.quality,
        )
        
        scoring_config = ScoringConfig(weights=score_weights)
        constraint_config = ConstraintConfig()
        
        selection_cfg = SelectionConfig(
            max_clusters=cfg.max_clusters,
            scoring=scoring_config,
            constraints=constraint_config,
        )
        
        # 转换 clusters 为原始格式（需要适配）
        # 这里需要将 ClusterSchema 转换为原始 StoryCluster 格式
        from src.utils.models import StoryCluster
        
        clusters_raw = []
        for cluster in input_data.clusters:
            # 获取代表性 item
            rep_item = items_dict.get(cluster.representative_item_id, {})
            cluster_items = [items_dict.get(item_id, {}) for item_id in cluster.item_ids]
            
            story_cluster = StoryCluster(
                representative=rep_item,
                items=cluster_items,
            )
            clusters_raw.append(story_cluster)
        
        self.logger.info(f"开始选题: {len(clusters_raw)} clusters")
        
        # 执行选题
        if cfg.auto_topic_enabled:
            # 使用 auto topic pipeline
            result = self._run_auto_topic(
                input_data, clusters_raw, items_dict, run_dir
            )
        else:
            # 传统选题
            result = select_clusters(
                clusters_raw,
                item_lookup=items_dict,
                config=selection_cfg,
            )
        
        # 提取选中的 items
        selected_items = []
        seen_ids = set()
        topic_candidates = []
        
        if cfg.auto_topic_enabled and "passed" in result:
            # Auto topic 结果
            for candidate in result.get("passed", []):
                topic_candidates.append(TopicCandidate(
                    run_id=input_data.run_id,
                    episode_date=input_data.episode_date,
                    run_dir=input_data.run_dir,
                    topic_id=candidate.topic_id,
                    title=candidate.title,
                    score=candidate.score,
                    decision="pass",
                    items=candidate.items,
                ))
                for item_id in candidate.items:
                    if item_id in items_dict and item_id not in seen_ids:
                        selected_items.append(ItemSchema.model_validate(items_dict[item_id]))
                        seen_ids.add(item_id)
        else:
            # 传统选题结果
            for entry in result.get("selected", []):
                for snapshot in entry.get("items", []):
                    item_id = snapshot.get("id")
                    if item_id and item_id in items_dict and item_id not in seen_ids:
                        selected_items.append(ItemSchema.model_validate(items_dict[item_id]))
                        seen_ids.add(item_id)
        
        # 如果没有选中任何 items，回退到全部
        if not selected_items and input_data.items:
            self.logger.warning("selection 未选中任何 items，回退到全部")
            selected_items = list(input_data.items.values())
        
        stats = SelectionStats(
            run_id=input_data.run_id,
            episode_date=input_data.episode_date,
            run_dir=input_data.run_dir,
            total_clusters=len(input_data.clusters),
            passed_topics=len([c for c in topic_candidates if c.decision == "pass"]),
            discarded_topics=len([c for c in topic_candidates if c.decision == "discard"]),
            total_items_selected=len(selected_items),
        )
        
        self.logger.info(f"选题完成: {stats.total_items_selected} items selected")
        
        return SelectionOutput(
            run_id=input_data.run_id,
            episode_date=input_data.episode_date,
            artifacts_dir=str(artifacts_dir),
            items_selected=selected_items,
            topic_candidates=topic_candidates,
            stats=stats,
            all_items=input_data.items,
        )
    
    def _run_auto_topic(
        self, input_data: SelectionInput, clusters_raw, items_dict, run_dir
    ) -> dict:
        """运行 auto topic pipeline"""
        from src.topic_selection.core.pipeline import AutoTopicPipeline, AutoTopicPipelineConfig
        from src.topic_selection.strategies import get_strategy
        
        cfg = input_data.selection_config
        strategy = get_strategy(cfg.strategy)
        
        pipeline_cfg = AutoTopicPipelineConfig(
            enabled=True,
            run_dir=run_dir,
            strategy=strategy,
        )
        
        pipeline = AutoTopicPipeline(config=pipeline_cfg)
        return pipeline.run(
            items=list(items_dict.values()),
            clusters=clusters_raw,
            item_lookup=items_dict,
        )
