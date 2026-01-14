"""
Fetch Stage Implementation

数据获取阶段：从各个源拉取、标准化、去重、合规验证
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any, Dict, List

from src.stages.base import BaseStage
from src.stages.registry import StageRegistry
from src.stages.schemas.fetch import FetchInput, FetchOutput, FetchStats
from src.stages.schemas.common import ItemSchema


@StageRegistry.register
class FetchStage(BaseStage[FetchInput, FetchOutput]):
    """数据获取 Stage"""
    
    @property
    def name(self) -> str:
        return "fetch"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    @property
    def input_schema(self) -> type[FetchInput]:
        return FetchInput
    
    @property
    def output_schema(self) -> type[FetchOutput]:
        return FetchOutput
    
    def execute(self, input_data: FetchInput) -> FetchOutput:
        """执行数据获取"""
        from src.fetch import FetcherRegistry
        from src.fetch.core.base import FetchStatus
        from src.fetch.operations.normalize import normalize_item
        from src.fetch.operations.source_guard import SourceGuard
        from src.store.operations.dedup import dedup_items
        from src.fetch.operations.compliance import filter_compliant_items
        from src.store.core.artifacts import write_jsonl
        
        run_dir = Path(input_data.run_dir)
        artifacts_dir = run_dir / "1_fetch"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        
        stats = FetchStats(
            run_id=input_data.run_id,
            episode_date=input_data.episode_date,
            run_dir=input_data.run_dir,
        )
        
        # 如果提供了 items_override，直接使用
        if input_data.items_override:
            self.logger.info(f"使用 items_override: {len(input_data.items_override)} items")
            items_raw = [item.model_dump() for item in input_data.items_override]
        else:
            # 从源拉取数据
            items_raw = []
            
            for source_cfg in input_data.sources:
                if not source_cfg.enabled:
                    continue
                
                fetcher_type = source_cfg.fetcher
                source_name = source_cfg.name
                
                fetcher = FetcherRegistry.create_instance(fetcher_type)
                if not fetcher:
                    self.logger.error(f"Unknown fetcher: {fetcher_type}")
                    stats.sources_failed += 1
                    continue
                
                try:
                    # 解析日期
                    episode_date_obj = dt.datetime.strptime(
                        input_data.episode_date, "%Y-%m-%d"
                    ).date()
                    
                    result = fetcher.fetch_items(
                        config=source_cfg.model_dump(),
                        episode_date=episode_date_obj,
                        timeout_seconds=input_data.timeout_seconds,
                    )
                    
                    if result.status in (FetchStatus.SUCCESS, FetchStatus.PARTIAL):
                        items_raw.extend(result.items)
                        stats.sources_succeeded += 1
                        self.logger.info(f"✓ {source_name}: {len(result.items)} items")
                    else:
                        stats.sources_failed += 1
                        self.logger.error(f"✗ {source_name}: {result.error_message}")
                        
                except Exception as e:
                    stats.sources_failed += 1
                    self.logger.error(f"Failed to fetch {source_name}: {e}")
        
        stats.total_fetched = len(items_raw)
        self.logger.info(f"拉取完成: {stats.total_fetched} items")
        
        # 保存 raw items
        if items_raw:
            write_jsonl(artifacts_dir / "01_raw_items.jsonl", items_raw)
        
        # 标准化（简化版本，不使用 source_guard）
        normalized = []
        for raw_item in items_raw:
            try:
                norm = normalize_item(raw_item)
                if norm:
                    normalized.append(norm)
            except Exception as e:
                self.logger.warning(f"标准化失败: {e}")
        stats.total_after_normalize = len(normalized)
        
        # 去重 (max_items=1000 作为默认上限)
        deduped_list = dedup_items(normalized, max_items=1000)
        deduped = {item.get("id", str(i)): item for i, item in enumerate(deduped_list)}
        stats.total_after_dedup = len(deduped)
        
        # 合规过滤 (返回 tuple: compliant, non_compliant)
        compliant, _ = filter_compliant_items(list(deduped.values()))
        stats.total_after_compliance = len(compliant)
        
        # 日期过滤
        target_date = input_data.episode_date
        date_filtered = {}
        for item in compliant:
            pub_at = item.get("published_at", "")
            if pub_at and pub_at.startswith(target_date):
                date_filtered[item["id"]] = item
            elif not pub_at:
                date_filtered[item["id"]] = item
        
        stats.total_after_date_filter = len(date_filtered)
        
        # 保存去重后的 items
        if date_filtered:
            write_jsonl(
                artifacts_dir / "02_dedup_items.jsonl",
                list(date_filtered.values())
            )
        
        # 转换为 Schema
        items_raw_schema = [ItemSchema.model_validate(item) for item in items_raw]
        items_dedup_schema = {
            k: ItemSchema.model_validate(v) for k, v in date_filtered.items()
        }
        
        return FetchOutput(
            run_id=input_data.run_id,
            episode_date=input_data.episode_date,
            artifacts_dir=str(artifacts_dir),
            items_raw=items_raw_schema,
            items_dedup=items_dedup_schema,
            stats=stats,
        )
