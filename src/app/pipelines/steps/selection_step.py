"""
Selection Step

选题步骤：从 clusters 中选择要制作的内容
支持两种模式：
1. 自动选题（auto_topic）- 基于 LLM 的智能选题
2. 传统选题（cluster selection）- 基于规则的选题
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from src.app.pipelines.base_step import BaseStep
from src.topic_selection.core.pipeline import AutoTopicPipeline, AutoTopicPipelineConfig
from src.topic_selection.processing.topic_scoring import TopicScorerConfig
from src.topic_selection.strategies import get_strategy
from src.store.selection.selector import select_clusters, SelectionConfig
from src.store.selection.scoring import ScoringConfig, ScoreWeights
from src.store.selection.constraints import ConstraintConfig
from src.store.core.artifacts import write_cluster_artifacts

if TYPE_CHECKING:
    from src.app.core.context import EpisodeContext


class SelectionStep(BaseStep):
    """选题步骤"""
    
    def execute(self, ctx: EpisodeContext) -> None:
        """执行 Selection 步骤
        
        优先级：
        1. 如果启用 auto_topic 且有通过的主题 → 使用 auto_topic 结果
        2. 否则 → 使用传统 cluster selection
        """
        cfg = ctx.config
        
        # ========== 1. 自动选题（可选） ==========
        auto_topic_cfg = cfg.get("auto_topic", {})
        auto_topic_enabled = auto_topic_cfg.get("enabled", False)
        
        if auto_topic_enabled:
            self.logger.info("启用自动选题模块...")
            ctx.auto_topic_result = self._run_auto_topic(ctx, auto_topic_cfg)
            self.logger.info(f"自动选题完成: {ctx.auto_topic_result['stats']}")
        
        # ========== 2. 传统 cluster selection（备用） ==========
        selection_cfg = self._build_selection_config(cfg)
        ctx.selection_result = select_clusters(
            ctx.clusters,
            item_lookup=ctx.items_dedup,
            config=selection_cfg
        )
        
        # ========== 3. 决定最终使用哪个结果 ==========
        selected_items = []
        seen_ids = set()
        
        if auto_topic_enabled and ctx.auto_topic_result and ctx.auto_topic_result.get("passed"):
            # 使用自动选题结果
            self.logger.info(f"使用自动选题结果: {len(ctx.auto_topic_result['passed'])} 个主题通过")
            
            for candidate in ctx.auto_topic_result["passed"]:
                for item_id in candidate.items:
                    if item_id in ctx.items_dedup and item_id not in seen_ids:
                        selected_items.append(ctx.items_dedup[item_id])
                        seen_ids.add(item_id)
            
            self.logger.info(f"自动选题提取了 {len(selected_items)} 个items用于脚本生成")
        else:
            # 使用传统 cluster selection
            self.logger.info("使用传统 cluster selection")
            
            for entry in ctx.selection_result["selected"]:
                for snapshot in entry.get("items") or []:
                    item_id = snapshot.get("id")
                    if item_id and item_id in ctx.items_dedup and item_id not in seen_ids:
                        selected_items.append(ctx.items_dedup[item_id])
                        seen_ids.add(item_id)
        
        # 如果没有选中任何items，回退到去重后的全部items
        if not selected_items and ctx.clusters:
            self.logger.warning("selection produced no items; fallback to all dedup items")
            selected_items = list(ctx.items_dedup.values())
        
        ctx.items_selected = selected_items
        self.logger.info(f"Selection 步骤完成: {len(ctx.items_selected)} items selected")
        
        # 写入 artifacts
        selection_metrics = write_cluster_artifacts(
            out_dir=ctx.output_dir,
            clusters=ctx.clusters,
            selection=ctx.selection_result,
        )
        
        ctx.add_event("selection_completed", 
                     items_selected=len(ctx.items_selected),
                     clusters_total=selection_metrics["clusters_total"],
                     selected_clusters=selection_metrics["selected_clusters"])
    
    def _run_auto_topic(self, ctx: EpisodeContext, auto_topic_cfg: dict) -> dict:
        """运行自动选题 pipeline"""
        # 1. 加载策略：优先使用配置文件的strategy，否则从 channel_presets 自动推导
        strategy_name = auto_topic_cfg.get("strategy")
        
        if not strategy_name:
            # 从 channel_presets 自动推导策略
            channel_id = ctx.config.get("channel", {}).get("id", "life-consumer")
            channel_presets = ctx.config.get("channel_presets", {})
            
            if channel_id in channel_presets:
                strategy_name = channel_presets[channel_id].get("auto_topic_strategy", "balanced")
                self.logger.info(f"根据频道 '{channel_id}' 自动选择策略: {strategy_name}")
            else:
                strategy_name = "balanced"
                self.logger.warning(f"频道 '{channel_id}' 未配置预设，使用默认策略: balanced")
        else:
            self.logger.info(f"使用配置文件指定的策略: {strategy_name}")
        
        try:
            strategy = get_strategy(strategy_name)
            self.logger.info(f"加载策略成功: {strategy.name} - {strategy.description}")
        except ValueError as e:
            self.logger.warning(f"策略加载失败: {e}，回退到 balanced 策略")
            strategy = get_strategy("balanced")
        
        # 2. 优先使用策略的 scorer config，然后是 Track 配置，最后是默认值
        strategy_scorer_cfg = strategy.get_scorer_config()
        
        if ctx.track:
            track_scoring_cfg = ctx.track.get_scoring_policy().get_scoring_config()
            self.logger.info(f"使用 Track '{ctx.track.get_name()}' 的打分策略")
        else:
            track_scoring_cfg = {}
        
        # 合并配置：Track 策略 > 配置文件 > 默认值
        scoring_cfg = auto_topic_cfg.get("scoring", {})
        
        def get_value(key: str, default: float) -> float:
            # 优先级：Track 策略 > 配置文件 > 默认值
            return float(
                track_scoring_cfg.get(key) or 
                scoring_cfg.get(key) or 
                default
            )
        
        # 3. 合并配置：Track 策略 > 配置文件 > 策略默认值
        def get_value_with_strategy(key: str) -> float:
            # 优先级：Track 策略 > 配置文件 > 策略默认值
            if track_scoring_cfg.get(key):
                return float(track_scoring_cfg[key])
            if scoring_cfg.get(key):
                return float(scoring_cfg[key])
            # 从策略的 scorer_config 获取默认值
            return getattr(strategy_scorer_cfg, key)
        
        scorer_cfg = TopicScorerConfig(
            # 内容价值分 (0-60)
            archetype_mean_max=get_value_with_strategy("archetype_mean_max"),
            personal_impact_max=get_value_with_strategy("personal_impact_max"),
            counter_intuitive_max=get_value_with_strategy("counter_intuitive_max"),
            # 代理信号分 (0-25)
            trend_max=get_value_with_strategy("trend_max"),
            time_max=get_value_with_strategy("time_max"),
            persona_max=get_value_with_strategy("persona_max"),
            history_echo_max=get_value_with_strategy("history_echo_max"),
            # 结构加成 (-10 ~ +15)
            continuity_max=get_value_with_strategy("continuity_max"),
            data_enrichable_max=get_value_with_strategy("data_enrichable_max"),
            follow_up_max=get_value_with_strategy("follow_up_max"),
            # 阈值 (0-100)
            threshold_must_publish=get_value_with_strategy("threshold_must_publish"),
            threshold_maybe_publish=get_value_with_strategy("threshold_maybe_publish"),
        )
        
        pipeline_cfg = AutoTopicPipelineConfig(
            enabled=True,
            time_window_days=int(auto_topic_cfg.get("time_window_days", 7)),
            run_dir=ctx.run_dir,  # 传递run目录
            scorer_config=scorer_cfg,
            gate_top_n=int(auto_topic_cfg.get("gate", {}).get("top_n", 10)),
            gate_fallback=bool(auto_topic_cfg.get("gate", {}).get("fallback_to_score", True)),
            history_dir=auto_topic_cfg.get("history", {}).get("dir", "out/history_podcasts"),
            strategy=strategy,  # 传递策略实例
        )
        
        auto_topic_pipeline = AutoTopicPipeline(config=pipeline_cfg)
        return auto_topic_pipeline.run(
            items=list(ctx.items_dedup.values()),
            clusters=ctx.clusters,
            item_lookup=ctx.items_dedup
        )
    
    def _build_selection_config(self, cfg: dict) -> SelectionConfig:
        """构建 SelectionConfig 对象"""
        selection_cfg_dict = cfg.get("selection", {})
        
        # 构建 ScoringConfig
        scoring_dict = selection_cfg_dict.get("scoring", {})
        weights_dict = scoring_dict.get("weights", {})
        
        score_weights = ScoreWeights(
            freshness=float(weights_dict.get("freshness", 0.4)),
            impact=float(weights_dict.get("impact", 0.3)),
            source_trust=float(weights_dict.get("source_trust", 0.2)),
            quality=float(weights_dict.get("quality", 0.1)),
        )
        
        scoring_config = ScoringConfig(
            freshness_half_life_days=float(scoring_dict.get("freshness_half_life_days", 3.0)),
            source_trust_overrides=scoring_dict.get("source_trust_overrides"),
            weights=score_weights,
        )
        
        # 构建 ConstraintConfig
        constraints_dict = selection_cfg_dict.get("constraints", {})
        
        constraint_config = ConstraintConfig(
            cooldown_days=int(constraints_dict.get("cooldown_days", 2)),
            exception_keywords=constraints_dict.get("exception_keywords", (
                "最新", "宣布", "确认", "发布", "裁决", "修正", "更新",
            )),
            max_per_topic=int(constraints_dict.get("max_per_topic", 2)),
            max_per_domain=int(constraints_dict.get("max_per_domain", 1)),
            max_title_similarity=float(constraints_dict.get("max_title_similarity", 0.7)),
        )
        
        # 构建 SelectionConfig
        return SelectionConfig(
            max_clusters=int(selection_cfg_dict.get("max_clusters", 5)),
            scoring=scoring_config,
            constraints=constraint_config,
        )
