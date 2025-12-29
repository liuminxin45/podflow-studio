"""
Auto Topic Selection Demo

演示自动选题模块的完整流程
"""

import json
import logging
from pathlib import Path

from src.topic_selection import (
    AutoTopicPipeline,
    AutoTopicPipelineConfig,
    TopicScorerConfig,
)
from src.store.clusters import ClusterConfig, cluster_items
from src.utils.models import StoryCluster


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)


def create_mock_items():
    """创建模拟数据"""
    return [
        {
            "id": "item1",
            "title": "OpenAI发布GPT-5，性能提升10倍",
            "content": "OpenAI今日发布GPT-5模型，在多项基准测试中性能提升10倍，引发AI行业震动。",
            "url": "https://example.com/1",
            "published_at": "2025-12-29T10:00:00Z",
            "source": {"name": "TechCrunch"},
            "category": "AI"
        },
        {
            "id": "item2",
            "title": "GPT-5发布后，AI创业公司估值暴涨",
            "content": "受GPT-5发布影响，多家AI创业公司估值在一周内暴涨50%。",
            "url": "https://example.com/2",
            "published_at": "2025-12-29T11:00:00Z",
            "source": {"name": "Bloomberg"},
            "category": "AI"
        },
        {
            "id": "item3",
            "title": "特斯拉宣布全系降价20%",
            "content": "特斯拉今日宣布全系车型降价20%，引发汽车行业价格战。",
            "url": "https://example.com/3",
            "published_at": "2025-12-29T09:00:00Z",
            "source": {"name": "Reuters"},
            "category": "汽车"
        },
        {
            "id": "item4",
            "title": "比亚迪跟进降价，幅度达15%",
            "content": "比亚迪紧急跟进特斯拉降价策略，全系降价15%。",
            "url": "https://example.com/4",
            "published_at": "2025-12-29T12:00:00Z",
            "source": {"name": "36Kr"},
            "category": "汽车"
        },
        {
            "id": "item5",
            "title": "今日天气晴朗",
            "content": "今天天气不错，适合出门。",
            "url": "https://example.com/5",
            "published_at": "2025-12-29T08:00:00Z",
            "source": {"name": "Weather"},
            "category": "天气"
        },
    ]


def main():
    print("=" * 80)
    print("自动选题模块演示")
    print("=" * 80)
    
    # 1. 准备数据
    items = create_mock_items()
    items_by_id = {item["id"]: item for item in items}
    
    print(f"\n步骤0: 准备数据")
    print(f"  - 总计 {len(items)} 条新闻")
    
    # 2. 聚类
    print(f"\n步骤1: 聚类")
    cluster_cfg = ClusterConfig(
        simhash_max_distance=4,
        title_min_jaccard=0.3,
        time_window_days=1
    )
    clusters = cluster_items(items, config=cluster_cfg)
    print(f"  - 生成 {len(clusters)} 个clusters")
    for cluster in clusters:
        print(f"    - {cluster.cluster_id}: {cluster.headline} ({len(cluster.items)} items)")
    
    # 3. 配置自动选题pipeline
    print(f"\n步骤2: 配置自动选题pipeline")
    scorer_cfg = TopicScorerConfig(
        w_continuity=2.0,
        w_data_enrichable=2.5,
        w_time_signal=1.5,
        w_history_echo=1.0,
        w_trend_signal=2.0,
        threshold_must_publish=15.0,
        threshold_maybe_publish=10.0,
        threshold_discard=10.0,
    )
    
    pipeline_cfg = AutoTopicPipelineConfig(
        enabled=True,
        time_window_days=7,
        scorer_config=scorer_cfg,
        gate_top_n=5,
        gate_fallback=True,
        history_dir="out/history_podcasts",
    )
    
    # 4. 运行自动选题pipeline
    print(f"\n步骤3: 运行自动选题pipeline")
    print("  注意：此演示会调用LLM API（需要配置DEEPSEEK_API_KEY）")
    print("  如果API调用失败，会自动降级到规则决策")
    
    pipeline = AutoTopicPipeline(config=pipeline_cfg)
    result = pipeline.run(
        items=items,
        clusters=clusters,
        item_lookup=items_by_id
    )
    
    # 5. 输出结果
    print(f"\n步骤4: 输出结果")
    print(f"\n统计信息:")
    print(json.dumps(result["stats"], indent=2, ensure_ascii=False))
    
    print(f"\n通过LLM Gate的主题 ({len(result['passed'])}):")
    for candidate in result["passed"]:
        print(f"\n  主题ID: {candidate.topic_id}")
        print(f"  标题: {candidate.title}")
        print(f"  实体: {', '.join(candidate.entities[:5])}")
        print(f"  可发布性评分: {candidate.publishability_score:.2f}")
        print(f"  发布优先级: {candidate.publish_priority}")
        print(f"  包含新闻: {len(candidate.items)} 条")
        
        if candidate.proxy_signals:
            print(f"  代理信号:")
            print(f"    - 趋势信号: {candidate.proxy_signals.trend_signal:.2f}")
            print(f"    - 时间信号: {candidate.proxy_signals.time_signal:.2f}")
            print(f"    - 历史呼应: {candidate.proxy_signals.history_echo:.2f}")
    
    print(f"\n打分详情 (前3个):")
    for breakdown in result["breakdowns"][:3]:
        print(f"\n  主题: {breakdown.topic_id}")
        print(f"  总分: {breakdown.total_score:.2f}")
        print(f"  决策: {breakdown.decision}")
        print(f"  分数构成:")
        print(f"    - 信号平均分: {breakdown.mean_signal_score:.2f}")
        print(f"    - 连续性加权: {breakdown.w_continuity:.2f}")
        print(f"    - 数据可补充加权: {breakdown.w_data_enrichable:.2f}")
        print(f"    - 时间信号加权: {breakdown.w_time_signal:.2f}")
        print(f"    - 历史呼应加权: {breakdown.w_history_echo:.2f}")
        print(f"    - 趋势信号加权: {breakdown.w_trend_signal:.2f}")
    
    # 6. 保存结果
    output_dir = Path("out/demo")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_file = output_dir / "auto_topic_result.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({
            "stats": result["stats"],
            "passed_topics": [c.model_dump() for c in result["passed"]],
            "all_candidates": [c.model_dump() for c in result["candidates"]],
            "breakdowns": [b.model_dump() for b in result["breakdowns"]],
        }, f, ensure_ascii=False, indent=2, default=str)
    
    print(f"\n结果已保存到: {output_file}")
    
    print("\n" + "=" * 80)
    print("演示完成")
    print("=" * 80)


if __name__ == "__main__":
    main()
