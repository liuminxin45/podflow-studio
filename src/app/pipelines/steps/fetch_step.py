"""
Fetch Step

数据获取步骤：从各个源拉取、标准化、去重、合规验证、日期过滤、汇总拆分
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from src.app.pipelines.base_step import BaseStep
from src.fetch.rss import fetch_rss_items_with_status
from src.fetch.aibot_daily import fetch_aibot_daily_items_with_status
from src.fetch.normalize import prepare_items
from src.store.dedup import dedup_items
from src.fetch.compliance import filter_compliant_items, assess_compliance
from src.fetch.source_guard import SourceGuard
from src.fetch.digest_detector import detect_digest_items
from src.fetch.digest_splitter import DigestSplitter, split_digest_items
from src.store.artifacts import write_jsonl

if TYPE_CHECKING:
    from src.app.context import EpisodeContext


class FetchStep(BaseStep):
    """数据获取步骤"""
    
    def execute(self, ctx: EpisodeContext) -> None:
        """执行 Fetch 步骤
        
        流程：
        1. 从各个源拉取数据
        2. Source guard & 标准化
        3. 去重
        4. 合规验证
        5. 日期过滤（只保留目标日期）
        6. 汇总型RSS检测与拆分
        7. 保存到 ctx.items_raw 和 ctx.items_dedup
        """
        cfg = ctx.config
        
        # 1. 拉取数据
        self.logger.info("开始从各个源拉取数据...")
        fetched = []
        
        # RSS 源
        rss_sources = cfg.get("sources", {}).get("rss", [])
        timeout_s = cfg.get("fetch", {}).get("timeout_seconds", 30)
        
        # 支持列表格式和字典格式
        if isinstance(rss_sources, list):
            for source in rss_sources:
                if not isinstance(source, dict) or not source.get("enabled", True):
                    continue
                name = source.get("name", "unknown")
                url = source.get("url", "")
                if not url:
                    continue
                try:
                    self.logger.info(f"fetch rss: {name} {url}")
                    items, status = fetch_rss_items_with_status(
                        url=url,
                        source=name,
                        timeout_seconds=timeout_s
                    )
                    fetched.extend(items)
                except Exception as e:
                    self.logger.warning(f"fetch rss failed: {name} - {e}")
        elif isinstance(rss_sources, dict):
            for name, url in rss_sources.items():
                try:
                    self.logger.info(f"fetch rss: {name} {url}")
                    items, status = fetch_rss_items_with_status(
                        url=url,
                        source=name,
                        timeout_seconds=timeout_s
                    )
                    fetched.extend(items)
                except Exception as e:
                    self.logger.warning(f"fetch rss failed: {name} - {e}")
        
        # AI Bot Daily
        aibot_sources = cfg.get("sources", {}).get("aibot_daily", [])
        
        # 支持列表格式和字典格式
        if isinstance(aibot_sources, list):
            for source in aibot_sources:
                if not isinstance(source, dict) or not source.get("enabled", True):
                    continue
                name = source.get("name", "aibot_daily")
                urls = source.get("urls", [])
                if not urls:
                    continue
                # 使用第一个 URL
                url = urls[0] if isinstance(urls, list) else urls
                try:
                    self.logger.info(f"fetch aibot_daily: {name} {url}")
                    items, status = fetch_aibot_daily_items_with_status(
                        url=url,
                        source=name,
                        episode_date=ctx.episode_date,
                        timeout_seconds=timeout_s
                    )
                    fetched.extend(items)
                except Exception as e:
                    self.logger.warning(f"fetch aibot_daily failed: {name} - {e}")
        elif isinstance(aibot_sources, dict) and aibot_sources.get("enabled"):
            # 旧格式兼容
            try:
                url = aibot_sources.get("url")
                self.logger.info(f"fetch aibot_daily: {url}")
                items, status = fetch_aibot_daily_items_with_status(
                    url=url,
                    source="aibot_daily",
                    episode_date=ctx.episode_date,
                    timeout_seconds=timeout_s
                )
                fetched.extend(items)
            except Exception as e:
                self.logger.warning(f"fetch aibot_daily failed: {e}")
        
        ctx.items_raw = list(fetched)
        self.logger.info(f"拉取完成: {len(ctx.items_raw)} items")
        
        # 2. Source guard & 标准化
        source_guard_cfg = cfg.get("source_guard", {})
        source_guard_dir = source_guard_cfg.get("config_dir", "./config/sources")
        min_content_length = int(source_guard_cfg.get("min_content_length", 0))
        
        source_guard = SourceGuard(config_dir=source_guard_dir)
        self.logger.info(f"source guard loaded {len(source_guard._policies)} policies")
        
        normalized, blocked = prepare_items(
            ctx.items_raw,
            source_guard=source_guard,
            min_content_length=min_content_length,
        )
        self.logger.info(f"normalization: {len(normalized)} items, {len(blocked)} blocked")
        
        # 写入 artifacts
        artifacts_dir = ctx.run_dir / "1_fetch" / "artifacts"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        if normalized:
            write_jsonl(artifacts_dir / "normalized_items.jsonl", normalized)
        if blocked:
            write_jsonl(artifacts_dir / "source_guard_blocked.jsonl", blocked)
        
        # 3. 去重
        max_items = cfg.get("fetch", {}).get("max_items")
        fetched = dedup_items(normalized, max_items=max_items)
        
        # 4. 合规验证
        compliance_cfg = cfg.get("compliance", {})
        self.logger.info("开始合规验证...")
        compliant_items, non_compliant_items = filter_compliant_items(
            fetched,
            rules=compliance_cfg.get("rules"),
            min_score=float(compliance_cfg.get("min_score", 0.6)),
            policy_level=compliance_cfg.get("policy_level", "standard"),
            rule_overrides=compliance_cfg.get("rule_overrides"),
        )
        self.logger.info(f"合规验证完成：合规{len(compliant_items)}条，不合规{len(non_compliant_items)}条")
        
        if non_compliant_items:
            write_jsonl(artifacts_dir / "non_compliant_items.jsonl", non_compliant_items)
        
        fetched = compliant_items
        
        # 5. 日期过滤
        import datetime as dt
        date_str = ctx.episode_id.split(":")[-1] if ":" in ctx.episode_id else ctx.episode_id
        target_date = dt.datetime.strptime(date_str, "%Y-%m-%d").date()
        
        self.logger.info(f"开始日期过滤：只保留 {target_date} 的数据...")
        date_filtered_items = []
        old_items = []
        
        for item in fetched:
            published_at = item.get("published_at")
            if published_at:
                try:
                    if isinstance(published_at, str):
                        item_date = dt.datetime.fromisoformat(published_at.replace("Z", "+00:00")).date()
                    elif isinstance(published_at, dt.datetime):
                        item_date = published_at.date()
                    else:
                        item_date = None
                    
                    if item_date == target_date:
                        date_filtered_items.append(item)
                    else:
                        old_items.append(item)
                except Exception as e:
                    self.logger.warning(f"日期解析失败: {item.get('title', 'unknown')[:50]} - {e}")
                    date_filtered_items.append(item)
            else:
                date_filtered_items.append(item)
        
        self.logger.info(f"日期过滤完成: 保留 {len(date_filtered_items)} 条, 过滤 {len(old_items)} 条")
        
        if old_items:
            write_jsonl(artifacts_dir / "date_filtered_old_items.jsonl", old_items)
        
        fetched = date_filtered_items
        
        # 6. 汇总型RSS拆分
        digest_split_cfg = cfg.get("digest_split", {})
        if digest_split_cfg.get("enabled", False):
            self.logger.info("开始汇总型RSS检测与拆分...")
            
            normal_items, digest_items = detect_digest_items(fetched)
            self.logger.info(f"检测完成: {len(normal_items)} 普通items, {len(digest_items)} 汇总items")
            
            if digest_items:
                splitter = DigestSplitter(
                    cache_ttl_seconds=int(digest_split_cfg.get("cache_ttl_seconds", 86400)),
                    enable_cache=digest_split_cfg.get("enable_cache", True)
                )
                
                split_items, split_stats = split_digest_items(digest_items, splitter)
                
                self.logger.info(f"拆分完成: 生成 {split_stats['total_sub_events']} 个子事件")
                
                if digest_items:
                    write_jsonl(artifacts_dir / "digest_items.jsonl", digest_items)
                if split_items:
                    write_jsonl(artifacts_dir / "split_items.jsonl", split_items)
                
                fetched = normal_items + split_items
                self.logger.info(f"合并后总计: {len(fetched)} items")
        
        # 7. 确保 item_id 并保存到 ctx
        for item in fetched:
            if not item.get("id"):
                item["id"] = item.get("url", "")
        
        ctx.items_dedup = {item["id"]: item for item in fetched if item.get("id")}
        self.logger.info(f"Fetch 步骤完成: {len(ctx.items_dedup)} items")
        
        ctx.add_event("fetch_completed", items_count=len(ctx.items_dedup))
