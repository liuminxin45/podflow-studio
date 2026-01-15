"""
Cluster Stage Implementation

聚类阶段：将相似的新闻聚合成 StoryCluster
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

from src.stages.base import BaseStage
from src.stages.registry import StageRegistry
from src.stages.schemas.cluster import ClusterInput, ClusterOutput, ClusterStats
from src.stages.schemas.common import ClusterSchema, ItemSchema


@StageRegistry.register
class ClusterStage(BaseStage[ClusterInput, ClusterOutput]):
    """聚类 Stage"""
    
    @property
    def name(self) -> str:
        return "cluster"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    @property
    def input_schema(self) -> type[ClusterInput]:
        return ClusterInput
    
    @property
    def output_schema(self) -> type[ClusterOutput]:
        return ClusterOutput
    
    def execute(self, input_data: ClusterInput) -> ClusterOutput:
        """执行聚类"""
        from src.store.operations.clusters import cluster_items, ClusterConfig
        
        run_dir = Path(input_data.run_dir)
        artifacts_dir = run_dir / "1_cluster"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        
        # 转换为原始格式
        items_dict = {}
        for k, v in input_data.items.items():
            if isinstance(v, dict):
                # Already a dict (from API serialization)
                items_dict[k] = v
            else:
                # ItemSchema object
                items_dict[k] = v.model_dump()
        items_list = list(items_dict.values())
        
        if not items_list:
            self.logger.warning("没有 items 可聚类")
            return ClusterOutput(
                run_id=input_data.run_id,
                episode_date=input_data.episode_date,
                artifacts_dir=str(artifacts_dir),
                clusters=[],
                items=input_data.items,
                stats=ClusterStats(
                    run_id=input_data.run_id,
                    episode_date=input_data.episode_date,
                    run_dir=input_data.run_dir,
                ),
            )
        
        # 创建聚类配置
        cfg = input_data.cluster_config
        cluster_cfg = ClusterConfig(
            simhash_max_distance=cfg.simhash_max_distance,
            title_min_jaccard=cfg.title_min_jaccard,
            time_window_days=cfg.time_window_days,
            cooldown_days=cfg.cooldown_days,
        )
        
        self.logger.info(f"开始聚类: {len(items_list)} items")
        
        # 执行聚类
        clusters_raw = cluster_items(items_list, config=cluster_cfg)
        
        # 转换为 Schema
        clusters_schema = []
        for i, cluster in enumerate(clusters_raw):
            cluster_id = f"cluster_{i:03d}"
            
            # Handle cluster.items
            if hasattr(cluster, "items"):
                item_ids = []
                for item in cluster.items:
                    if isinstance(item, dict):
                        item_ids.append(item.get("id", ""))
                    elif isinstance(item, str):
                        item_ids.append(item)
                    else:
                        item_ids.append(getattr(item, "id", ""))
            else:
                item_ids = []
            
            # Handle cluster.representative
            if hasattr(cluster, "representative"):
                rep = cluster.representative
                if isinstance(rep, dict):
                    rep_id = rep.get("id", "")
                    rep_title = rep.get("title", "")
                elif isinstance(rep, str):
                    rep_id = rep
                    rep_title = ""
                else:
                    rep_id = getattr(rep, "id", "")
                    rep_title = getattr(rep, "title", "")
            else:
                rep_id = ""
                rep_title = ""
            
            clusters_schema.append(ClusterSchema(
                cluster_id=cluster_id,
                representative_item_id=rep_id,
                item_ids=item_ids,
                title=rep_title,
                size=len(item_ids),
                score=getattr(cluster, "score", None),
            ))
        
        # 统计
        stats = ClusterStats(
            run_id=input_data.run_id,
            episode_date=input_data.episode_date,
            run_dir=input_data.run_dir,
            total_items=len(items_list),
            total_clusters=len(clusters_schema),
            avg_cluster_size=len(items_list) / max(len(clusters_schema), 1),
            max_cluster_size=max((c.size for c in clusters_schema), default=0),
        )
        
        self.logger.info(f"聚类完成: {stats.total_clusters} clusters from {stats.total_items} items")
        
        return ClusterOutput(
            run_id=input_data.run_id,
            episode_date=input_data.episode_date,
            artifacts_dir=str(artifacts_dir),
            clusters=clusters_schema,
            items=input_data.items,
            stats=stats,
        )
