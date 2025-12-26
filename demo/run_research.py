"""
Research Mode Demo

演示调研模式播客生成流程：
- 深度分析
- 长期趋势
- 系统性研究

运行方式：
    python demo/run_research.py --topic "技术趋势" --depth "deep"

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime
from pathlib import Path

import yaml

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.trace import get_tracer
from src.utils.metrics import get_metrics
from src.utils.manifest import create_manifest_from_metrics_and_traces

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def load_config(config_path: Path) -> dict:
    """加载配置文件"""
    with open(config_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def run_research_pipeline(topic: str, depth: str = "standard", keywords: list[str] | None = None):
    """
    运行调研模式流水线
    
    Args:
        topic: 主题名称
        depth: 深度级别 (standard / deep)
        keywords: 关键词列表
    """
    logger.info("=" * 60)
    logger.info("Auto-Podcast Research Mode Demo")
    logger.info("=" * 60)
    
    # 加载配置
    config_dir = Path(__file__).parent.parent / "config"
    research_config = load_config(config_dir / "topics" / "research.yaml")
    pipeline_config = load_config(config_dir / "pipeline.yaml")
    
    logger.info(f"主题: {topic}")
    logger.info(f"模式: {research_config['mode']}")
    logger.info(f"深度: {depth}")
    logger.info(f"描述: {research_config['description']}")
    
    # 获取追踪器和指标收集器
    tracer = get_tracer()
    metrics = get_metrics()
    
    # 生成Episode ID
    episode_id = f"research_{topic}_{depth}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    logger.info(f"Episode ID: {episode_id}")
    
    # ========== Phase 1: Fetch ==========
    with tracer.trace("fetch", tags={"mode": "research", "topic": topic, "depth": depth}):
        logger.info("\n[Phase 1] Fetch - 获取内容")
        
        # 调研模式允许更长的时间范围
        max_age_days = research_config['time_constraints']['max_age_days']
        logger.info(f"  - 时间范围: 最近 {max_age_days} 天")
        logger.info(f"  - 关键词: {keywords or '使用配置中的关键词'}")
        
        # 这里应该调用实际的fetch逻辑
        # fetched_items = fetch_news(keywords, max_age_days)
        fetched_items = []  # 模拟
        
        metrics.increment("fetch.items", len(fetched_items))
        logger.info(f"  ✓ 获取到 {len(fetched_items)} 条内容")
    
    # ========== Phase 2: Store (Dedup + Cluster + Select) ==========
    with tracer.trace("store", tags={"mode": "research"}):
        logger.info("\n[Phase 2] Store - 去重、聚类、选择")
        
        # 调研模式选择更多内容
        max_items = research_config['selection']['max_items']
        min_score = research_config['selection']['min_score']
        
        logger.info(f"  - 最大选择数: {max_items}")
        logger.info(f"  - 最低分数: {min_score}")
        logger.info(f"  - 多样性: 允许更多相关内容")
        
        # selected_items = select_clusters(fetched_items, max_items, min_score)
        selected_items = []  # 模拟
        
        metrics.increment("store.selected", len(selected_items))
        logger.info(f"  ✓ 选择了 {len(selected_items)} 个主题")
    
    # ========== Phase 3: Research (深度调查) ==========
    with tracer.trace("research", tags={"scenario": "research", "depth": depth}):
        logger.info("\n[Phase 3] Research - 深度断言提取和证据收集")
        
        scenario = research_config['evidence']['scenario']
        budget = research_config['research_budget']
        
        logger.info(f"  - 场景: {scenario}")
        logger.info(f"  - 最大新闻数: {budget['max_news_items']}")
        logger.info(f"  - 每条新闻最多断言: {budget['max_claims_per_item']}")
        logger.info(f"  - 总断言数上限: {budget['max_total_claims']}")
        
        if depth == "deep":
            logger.info("  - 深度模式: 扩展证据收集范围")
        
        # evidence_packs = research_pipeline(selected_items, scenario, budget)
        evidence_packs = []  # 模拟
        
        metrics.increment("research.evidence_packs", len(evidence_packs))
        metrics.record_cost("research.total", 0.15)  # 模拟成本
        logger.info(f"  ✓ 生成了 {len(evidence_packs)} 个证据包")
    
    # ========== Phase 4: Editorial (系统性分析) ==========
    with tracer.trace("editorial"):
        logger.info("\n[Phase 4] Editorial - 系统性编辑规划")
        
        audience = research_config['audience']
        editorial_focus = research_config['editorial_focus']
        
        logger.info(f"  - 目标听众: {audience['target']}")
        logger.info(f"  - 风格: {audience['tone']}")
        logger.info(f"  - 时长: {audience['length_preference']}")
        logger.info("  - 编辑重点:")
        for focus in editorial_focus:
            logger.info(f"    • {focus}")
        
        # editorial_plan = create_editorial_plan(evidence_packs, audience)
        logger.info("  ✓ 系统性编辑计划已生成")
    
    # ========== Phase 5: Script & Quality Gate ==========
    with tracer.trace("script"):
        logger.info("\n[Phase 5] Script - 深度脚本生成")
        
        quality_config = pipeline_config['script']['quality_gate']
        logger.info(f"  - 质量阈值: {quality_config['pass_threshold']}")
        logger.info(f"  - 最大修订次数: {quality_config['max_revisions']}")
        
        # script, assessment = generate_and_assess_script(editorial_plan)
        logger.info("  ✓ 深度脚本已生成并通过质量检查")
    
    # ========== Phase 6: TTS & Audio ==========
    with tracer.trace("tts_audio"):
        logger.info("\n[Phase 6] TTS & Audio - 语音合成和混音")
        
        tts_config = pipeline_config['tts']
        audio_config = pipeline_config['audio']
        
        logger.info(f"  - 分段: {tts_config['segmentation']['min_length']}-{tts_config['segmentation']['max_length']} 字")
        logger.info(f"  - 响度标准: {audio_config['mixing']['target_loudness']} LUFS")
        logger.info("  - 预计时长: 30-45分钟（调研模式）")
        
        # audio_file = create_podcast_audio(script, tts_config, audio_config)
        logger.info("  ✓ 长篇音频已生成")
    
    # ========== Phase 7: Chapters & Subtitles ==========
    with tracer.trace("publish"):
        logger.info("\n[Phase 7] Publish - 章节和字幕")
        
        logger.info("  - 生成章节标记")
        logger.info("  - 生成字幕文件 (SRT/VTT)")
        
        # chapters = create_chapters(editorial_plan)
        # subtitles = generate_subtitles(timeline)
        logger.info("  ✓ 发布资源已生成")
    
    # ========== 生成Manifest ==========
    logger.info("\n[生成清单]")
    manifest = create_manifest_from_metrics_and_traces(
        episode_id=episode_id,
        version="2.0.0"
    )
    
    # 添加调研模式特定元数据
    manifest.metadata.update({
        "mode": "research",
        "depth": depth,
        "topic": topic,
        "research_budget": research_config['research_budget'],
    })
    
    # 输出统计
    logger.info("\n" + "=" * 60)
    logger.info("执行统计")
    logger.info("=" * 60)
    logger.info(manifest.get_summary())
    
    # 保存manifest
    output_dir = Path(__file__).parent.parent / "output" / episode_id
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = manifest.export_json(output_dir / "manifest.json")
    logger.info(f"\n✓ Manifest已保存: {manifest_path}")
    
    # 输出模式对比
    logger.info("\n" + "=" * 60)
    logger.info("调研模式 vs 实时模式")
    logger.info("=" * 60)
    logger.info("调研模式特点:")
    logger.info("  • 时间范围更长 (30天 vs 24小时)")
    logger.info("  • 内容更多 (15项 vs 10项)")
    logger.info("  • 断言更深入 (50个 vs 30个)")
    logger.info("  • 分析更系统 (5W框架完整展开)")
    logger.info("  • 时长更长 (30-45分钟 vs 15-20分钟)")
    
    logger.info("\n" + "=" * 60)
    logger.info("调研模式演示完成！")
    logger.info("=" * 60)


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="Auto-Podcast Research Mode Demo")
    parser.add_argument(
        "--topic",
        type=str,
        default="技术趋势",
        help="主题名称（默认：技术趋势）"
    )
    parser.add_argument(
        "--depth",
        type=str,
        choices=["standard", "deep"],
        default="standard",
        help="深度级别（默认：standard）"
    )
    parser.add_argument(
        "--keywords",
        type=str,
        nargs="+",
        help="关键词列表"
    )
    
    args = parser.parse_args()
    
    try:
        run_research_pipeline(args.topic, args.depth, args.keywords)
    except Exception as e:
        logger.error(f"执行失败: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
