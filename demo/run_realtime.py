"""
Realtime Mode Demo

演示实时模式播客生成流程：
- 关注最新热点
- 快速更新
- 时效性优先

运行方式：
    python demo/run_realtime.py --topic "科技前沿"

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


def run_realtime_pipeline(topic: str, keywords: list[str] | None = None):
    """
    运行实时模式流水线
    
    Args:
        topic: 主题名称
        keywords: 关键词列表
    """
    logger.info("=" * 60)
    logger.info("Auto-Podcast Realtime Mode Demo")
    logger.info("=" * 60)
    
    # 加载配置
    config_dir = Path(__file__).parent.parent / "config"
    realtime_config = load_config(config_dir / "topics" / "realtime.yaml")
    pipeline_config = load_config(config_dir / "pipeline.yaml")
    
    logger.info(f"主题: {topic}")
    logger.info(f"模式: {realtime_config['mode']}")
    logger.info(f"描述: {realtime_config['description']}")
    
    # 获取追踪器和指标收集器
    tracer = get_tracer()
    metrics = get_metrics()
    
    # 生成Episode ID
    episode_id = f"realtime_{topic}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    logger.info(f"Episode ID: {episode_id}")
    
    # ========== Phase 1: Fetch ==========
    with tracer.trace("fetch", tags={"mode": "realtime", "topic": topic}):
        logger.info("\n[Phase 1] Fetch - 获取新闻")
        
        # 模拟fetch操作
        max_age_hours = realtime_config['time_constraints']['max_age_hours']
        logger.info(f"  - 时间范围: 最近 {max_age_hours} 小时")
        logger.info(f"  - 关键词: {keywords or '使用配置中的关键词'}")
        
        # 这里应该调用实际的fetch逻辑
        # fetched_items = fetch_news(keywords, max_age_hours)
        fetched_items = []  # 模拟
        
        metrics.increment("fetch.items", len(fetched_items))
        logger.info(f"  ✓ 获取到 {len(fetched_items)} 条新闻")
    
    # ========== Phase 2: Store (Dedup + Cluster + Select) ==========
    with tracer.trace("store", tags={"mode": "realtime"}):
        logger.info("\n[Phase 2] Store - 去重、聚类、选择")
        
        # 模拟store操作
        max_items = realtime_config['selection']['max_items']
        min_score = realtime_config['selection']['min_score']
        
        logger.info(f"  - 最大选择数: {max_items}")
        logger.info(f"  - 最低分数: {min_score}")
        
        # selected_items = select_clusters(fetched_items, max_items, min_score)
        selected_items = []  # 模拟
        
        metrics.increment("store.selected", len(selected_items))
        logger.info(f"  ✓ 选择了 {len(selected_items)} 个故事")
    
    # ========== Phase 3: Research ==========
    with tracer.trace("research", tags={"scenario": "realtime"}):
        logger.info("\n[Phase 3] Research - 断言提取和证据收集")
        
        scenario = realtime_config['evidence']['scenario']
        max_age_days = realtime_config['evidence']['max_age_days']
        
        logger.info(f"  - 场景: {scenario}")
        logger.info(f"  - 证据时间范围: {max_age_days} 天")
        
        # evidence_packs = research_pipeline(selected_items, scenario)
        evidence_packs = []  # 模拟
        
        metrics.increment("research.evidence_packs", len(evidence_packs))
        logger.info(f"  ✓ 生成了 {len(evidence_packs)} 个证据包")
    
    # ========== Phase 4: Editorial ==========
    with tracer.trace("editorial"):
        logger.info("\n[Phase 4] Editorial - 编辑规划")
        
        audience = realtime_config['audience']
        logger.info(f"  - 目标听众: {audience['target']}")
        logger.info(f"  - 风格: {audience['tone']}")
        logger.info(f"  - 时长: {audience['length_preference']}")
        
        # editorial_plan = create_editorial_plan(evidence_packs, audience)
        logger.info("  ✓ 编辑计划已生成")
    
    # ========== Phase 5: Script & Quality Gate ==========
    with tracer.trace("script"):
        logger.info("\n[Phase 5] Script - 脚本生成和质量检查")
        
        quality_config = pipeline_config['script']['quality_gate']
        logger.info(f"  - 质量阈值: {quality_config['pass_threshold']}")
        
        # script, assessment = generate_and_assess_script(editorial_plan)
        logger.info("  ✓ 脚本已生成并通过质量检查")
    
    # ========== Phase 6: TTS & Audio ==========
    with tracer.trace("tts_audio"):
        logger.info("\n[Phase 6] TTS & Audio - 语音合成和混音")
        
        tts_config = pipeline_config['tts']
        audio_config = pipeline_config['audio']
        
        logger.info(f"  - 分段: {tts_config['segmentation']['min_length']}-{tts_config['segmentation']['max_length']} 字")
        logger.info(f"  - 响度标准: {audio_config['mixing']['target_loudness']} LUFS")
        
        # audio_file = create_podcast_audio(script, tts_config, audio_config)
        logger.info("  ✓ 音频已生成")
    
    # ========== 生成Manifest ==========
    logger.info("\n[生成清单]")
    manifest = create_manifest_from_metrics_and_traces(
        episode_id=episode_id,
        version="2.0.0"
    )
    
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
    
    logger.info("\n" + "=" * 60)
    logger.info("实时模式演示完成！")
    logger.info("=" * 60)


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="Auto-Podcast Realtime Mode Demo")
    parser.add_argument(
        "--topic",
        type=str,
        default="科技前沿",
        help="主题名称（默认：科技前沿）"
    )
    parser.add_argument(
        "--keywords",
        type=str,
        nargs="+",
        help="关键词列表"
    )
    
    args = parser.parse_args()
    
    try:
        run_realtime_pipeline(args.topic, args.keywords)
    except Exception as e:
        logger.error(f"执行失败: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
