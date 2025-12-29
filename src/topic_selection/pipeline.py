"""
Auto Topic Selection Pipeline

自动选题pipeline编排：整合所有模块
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from src.topic_selection.models import TopicCandidate, TopicScoreBreakdown
from src.topic_selection.signal_tagging import ItemSignalTagger
from src.topic_selection.topic_mining import TopicMiner
from src.topic_selection.proxy_signals import ProxySignalComputer
from src.topic_selection.topic_scoring import TopicScorer, TopicScorerConfig
from src.topic_selection.topic_gate import TopicGate
from src.utils.models import StoryCluster


class AutoTopicPipelineConfig:
    """自动选题pipeline配置"""
    def __init__(
        self,
        enabled: bool = False,
        time_window_days: int = 7,
        scorer_config: Optional[TopicScorerConfig] = None,
        gate_top_n: int = 10,
        gate_fallback: bool = True,
        history_dir: str = "out/history_podcasts",
    ):
        self.enabled = enabled
        self.time_window_days = time_window_days
        self.scorer_config = scorer_config or TopicScorerConfig()
        self.gate_top_n = gate_top_n
        self.gate_fallback = gate_fallback
        self.history_dir = history_dir


class AutoTopicPipeline:
    """自动选题pipeline"""
    
    def __init__(self, config: AutoTopicPipelineConfig):
        self.config = config
        self.logger = logging.getLogger("topic_selection.pipeline")
        
        # 初始化各模块
        self.signal_tagger = ItemSignalTagger()
        self.topic_miner = TopicMiner(time_window_days=config.time_window_days)
        self.proxy_computer = ProxySignalComputer(history_dir=config.history_dir)
        self.topic_scorer = TopicScorer(config=config.scorer_config)
        self.topic_gate = TopicGate(
            top_n=config.gate_top_n,
            fallback_to_score=config.gate_fallback
        )
    
    def run(
        self,
        items: List[dict],
        clusters: List[StoryCluster],
        item_lookup: Dict[str, dict]
    ) -> Dict:
        """运行完整的自动选题pipeline
        
        Returns:
            {
                "candidates": List[TopicCandidate],  # 所有候选
                "passed": List[TopicCandidate],      # 通过gate的
                "breakdowns": List[TopicScoreBreakdown],  # 打分详情
                "stats": {...}
            }
        """
        
        if not self.config.enabled:
            self.logger.info("自动选题模块未启用")
            return {
                "candidates": [],
                "passed": [],
                "breakdowns": [],
                "stats": {"enabled": False}
            }
        
        self.logger.info("=" * 60)
        self.logger.info("开始自动选题pipeline")
        self.logger.info("=" * 60)
        
        # 步骤1: item_signal_tagging (LLM#0)
        self.logger.info("步骤1: 为items打信号标签 (LLM#0)...")
        signal_taggings = self.signal_tagger.tag_items(items)
        self.logger.info(f"  完成: {len(signal_taggings)}/{len(items)} items已打标签")
        
        # 步骤2: topic_candidate_mining
        self.logger.info("步骤2: 挖掘主题候选...")
        candidates = self.topic_miner.mine_topics(clusters, item_lookup, signal_taggings)
        self.logger.info(f"  完成: 生成 {len(candidates)} 个主题候选")
        
        if not candidates:
            self.logger.warning("未生成任何主题候选，pipeline终止")
            return {
                "candidates": [],
                "passed": [],
                "breakdowns": [],
                "stats": {
                    "enabled": True,
                    "items_tagged": len(signal_taggings),
                    "candidates_generated": 0,
                    "candidates_passed_scoring": 0,
                    "candidates_passed_gate": 0
                }
            }
        
        # 步骤3: proxy_signals_compute
        self.logger.info("步骤3: 计算代理信号...")
        candidates = self.proxy_computer.compute_signals(candidates, item_lookup, items)
        self.logger.info(f"  完成: {len(candidates)} 个候选已计算代理信号")
        
        # 步骤4: topic_scoring_and_filtering
        self.logger.info("步骤4: 主题打分与过滤...")
        filtered_candidates, breakdowns = self.topic_scorer.score_and_filter(candidates)
        self.logger.info(f"  完成: {len(filtered_candidates)}/{len(candidates)} 通过打分筛选")
        
        if not filtered_candidates:
            self.logger.warning("所有候选均被打分淘汰，pipeline终止")
            
            # 即使被淘汰也输出报告
            stats = {
                "enabled": True,
                "items_tagged": len(signal_taggings),
                "candidates_generated": len(candidates),
                "candidates_passed_scoring": 0,
                "candidates_passed_gate": 0
            }
            
            self._write_report(
                candidates=candidates,
                filtered_candidates=[],
                passed_candidates=[],
                breakdowns=breakdowns,
                stats=stats
            )
            
            self._log_detailed_results([], breakdowns, [])
            
            return {
                "candidates": candidates,
                "passed": [],
                "breakdowns": breakdowns,
                "stats": stats
            }
        
        # 步骤5: topic_gate_llm (LLM Gate)
        self.logger.info("步骤5: LLM决策门...")
        passed_candidates = self.topic_gate.gate_topics(filtered_candidates, item_lookup)
        self.logger.info(f"  完成: {len(passed_candidates)}/{len(filtered_candidates)} 通过LLM Gate")
        
        # 统计
        stats = {
            "enabled": True,
            "items_tagged": len(signal_taggings),
            "candidates_generated": len(candidates),
            "candidates_passed_scoring": len(filtered_candidates),
            "candidates_passed_gate": len(passed_candidates),
        }
        
        # 输出JSON报告
        self._write_report(
            candidates=candidates,
            filtered_candidates=filtered_candidates,
            passed_candidates=passed_candidates,
            breakdowns=breakdowns,
            stats=stats
        )
        
        # 输出详细日志
        self._log_detailed_results(filtered_candidates, breakdowns, passed_candidates)
        
        self.logger.info("=" * 60)
        self.logger.info(f"自动选题pipeline完成: {len(passed_candidates)} 个主题通过")
        self.logger.info("=" * 60)
        
        return {
            "candidates": candidates,
            "passed": passed_candidates,
            "breakdowns": breakdowns,
            "stats": stats
        }


    def _write_report(
        self,
        candidates: List[TopicCandidate],
        filtered_candidates: List[TopicCandidate],
        passed_candidates: List[TopicCandidate],
        breakdowns: List[TopicScoreBreakdown],
        stats: Dict
    ):
        """输出JSON报告到out/auto_topic/"""
        try:
            output_dir = Path("out/auto_topic")
            output_dir.mkdir(parents=True, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            report_file = output_dir / f"report_{timestamp}.json"
            
            # 构建报告
            report = {
                "timestamp": datetime.now().isoformat(),
                "stats": stats,
                "all_candidates": [
                    {
                        "topic_id": c.topic_id,
                        "title": c.title,
                        "entities": c.entities,
                        "items_count": len(c.items),
                        "topic_score": c.topic_score,
                        "should_publish": c.should_publish,
                        "priority": c.publish_priority,
                    }
                    for c in candidates
                ],
                "score_breakdowns": [
                    {
                        "topic_id": b.topic_id,
                        "content_score": b.content_score,
                        "proxy_score": b.proxy_score,
                        "structure_bonus": b.structure_bonus,
                        "total_score": b.total_score,
                        "decision": b.decision,
                        "details": {
                            "archetype_mean": b.archetype_mean_score,
                            "personal_impact": b.personal_impact_score,
                            "counter_intuitive": b.counter_intuitive_score,
                            "trend": b.trend_score,
                            "time": b.time_score,
                            "persona": b.persona_score,
                            "history_echo": b.history_echo_score,
                            "continuity": b.continuity_bonus,
                            "data_enrichable": b.data_enrichable_bonus,
                            "follow_up": b.follow_up_bonus,
                        }
                    }
                    for b in breakdowns
                ],
                "passed_topics": [
                    {
                        "topic_id": c.topic_id,
                        "title": c.title,
                        "entities": c.entities,
                        "topic_score": c.topic_score,
                        "priority": c.publish_priority,
                        "score_breakdown": c.score_breakdown,
                    }
                    for c in passed_candidates
                ]
            }
            
            with open(report_file, "w", encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
            
            self.logger.info(f"报告已保存: {report_file}")
            
        except Exception as e:
            self.logger.error(f"保存报告失败: {e}")
    
    def _log_detailed_results(
        self,
        filtered_candidates: List[TopicCandidate],
        breakdowns: List[TopicScoreBreakdown],
        passed_candidates: List[TopicCandidate]
    ):
        """输出详细日志"""
        
        # 构建breakdown查找表
        breakdown_map = {b.topic_id: b for b in breakdowns}
        
        self.logger.info("\n" + "=" * 80)
        self.logger.info("打分详情（通过筛选的主题）")
        self.logger.info("=" * 80)
        
        for candidate in filtered_candidates:
            breakdown = breakdown_map.get(candidate.topic_id)
            if not breakdown:
                continue
            
            self.logger.info(f"\n【{candidate.topic_id}】{candidate.title}")
            self.logger.info(f"  实体: {', '.join(candidate.entities[:5])}")
            self.logger.info(f"  包含新闻: {len(candidate.items)}条")
            self.logger.info(f"")
            self.logger.info(f"  总分: {breakdown.total_score:.2f}/100 ({breakdown.decision})")
            self.logger.info(f"  ├─ 内容价值分: {breakdown.content_score:.2f}/60")
            self.logger.info(f"  │  ├─ 母型平均: {breakdown.archetype_mean_score:.2f}/40")
            self.logger.info(f"  │  ├─ 个人影响: {breakdown.personal_impact_score:.2f}/10")
            self.logger.info(f"  │  └─ 反直觉: {breakdown.counter_intuitive_score:.2f}/10")
            self.logger.info(f"  ├─ 代理信号分: {breakdown.proxy_score:.2f}/25")
            self.logger.info(f"  │  ├─ 趋势: {breakdown.trend_score:.2f}/10")
            self.logger.info(f"  │  ├─ 时间: {breakdown.time_score:.2f}/5")
            self.logger.info(f"  │  ├─ 人群: {breakdown.persona_score:.2f}/5")
            self.logger.info(f"  │  └─ 历史呼应: {breakdown.history_echo_score:.2f}/5")
            self.logger.info(f"  └─ 结构加成: {breakdown.structure_bonus:.2f}/15")
            self.logger.info(f"     ├─ 连续性: {breakdown.continuity_bonus:.2f}/6")
            self.logger.info(f"     ├─ 数据可补充: {breakdown.data_enrichable_bonus:.2f}/6")
            self.logger.info(f"     └─ 可跟进: {breakdown.follow_up_bonus:.2f}/3")
        
        self.logger.info("\n" + "=" * 80)
        self.logger.info(f"通过LLM Gate的主题 ({len(passed_candidates)})：")
        self.logger.info("=" * 80)
        
        for candidate in passed_candidates:
            self.logger.info(f"\n✅ {candidate.topic_id}")
            self.logger.info(f"   标题: {candidate.title}")
            self.logger.info(f"   总分: {candidate.topic_score:.2f}/100")
            self.logger.info(f"   优先级: {candidate.publish_priority}/5")


__all__ = ["AutoTopicPipeline", "AutoTopicPipelineConfig"]
