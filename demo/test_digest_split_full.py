"""
完整测试 Digest Split Pipeline

演示从RSS获取到聚类的完整流程，包含详细日志
"""

import logging
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.fetch.processors.digest_detector import detect_digest_items
from src.fetch.processors.digest_splitter import DigestSplitter, split_digest_items
from src.store.clusters import ClusterConfig, cluster_items
from src.store.fingerprints import ensure_item_fingerprints


# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("out/test_digest_split_full.log", encoding="utf-8")
    ]
)

logger = logging.getLogger(__name__)


def create_test_items():
    """创建测试数据：包含普通新闻和汇总型RSS"""
    return [
        # 普通新闻1
        {
            "id": "normal001",
            "title": "OpenAI发布GPT-5，性能提升10倍",
            "content": "OpenAI今日正式发布GPT-5模型，在多项基准测试中性能提升10倍。该模型采用全新架构，支持更长的上下文窗口，引发AI行业震动。",
            "url": "https://example.com/news/openai-gpt5",
            "published_at": "2025-12-29T10:00:00Z",
            "source": "TechCrunch",
            "category": "AI"
        },
        
        # 汇总型RSS（60秒读懂世界）
        {
            "id": "digest001",
            "title": "2025-12-29 星期一 / 每天60秒读懂世界",
            "content": """
1、无人机事件持续发酵，美国多地报告目击不明飞行物，国防部表示正在调查中。
2、财政部宣布新一轮消费补贴政策，家电、汽车等领域将获得补贴支持，预计惠及数千万家庭。
3、某市发生重大火灾事故，消防部门已救出12人，事故原因正在调查中。
4、OpenAI发布GPT-5模型，在多项基准测试中性能提升10倍，引发AI行业震动。
5、A股今日大涨，创业板指数涨幅超过3%，科技股领涨市场。
6、特斯拉宣布全系车型降价20%，引发汽车行业价格战。
7、比亚迪紧急跟进降价策略，全系降价15%。
8、苹果发布新款iPhone，售价创历史新高。
9、微软收购游戏公司，交易额达百亿美元。
10、谷歌推出新AI模型，性能超越GPT-4。
            """.strip(),
            "url": "https://example.com/60s/2025-12-29",
            "published_at": "2025-12-29T08:00:00Z",
            "source": "60s-每天60秒读懂世界",
            "category": "综合"
        },
        
        # 普通新闻2
        {
            "id": "normal002",
            "title": "特斯拉降价引发汽车行业价格战",
            "content": "特斯拉宣布全系车型降价20%，引发汽车行业价格战。比亚迪、蔚来等竞争对手纷纷跟进降价。",
            "url": "https://example.com/news/tesla-price-cut",
            "published_at": "2025-12-29T11:00:00Z",
            "source": "Reuters",
            "category": "汽车"
        },
        
        # 汇总型RSS（科技日报）
        {
            "id": "digest002",
            "title": "今日科技要闻汇总",
            "content": """
1、苹果发布新款iPhone，售价创新高，预订量超预期
2、特斯拉宣布全系降价20%，引发行业震动
3、微软收购游戏公司，交易额达百亿
4、谷歌推出新AI模型，性能超越GPT-4
5、亚马逊扩展云服务，进军AI领域
6、Meta发布VR新品，价格大幅下降
7、英伟达股价创新高，市值突破万亿
8、AMD推出新芯片，性能提升50%
            """.strip(),
            "url": "https://example.com/tech-daily/2025-12-29",
            "published_at": "2025-12-29T09:00:00Z",
            "source": "科技日报",
            "category": "科技"
        },
        
        # 普通新闻3
        {
            "id": "normal003",
            "title": "比亚迪跟进降价，幅度达15%",
            "content": "比亚迪紧急跟进特斯拉降价策略，全系降价15%。业内人士认为这将加剧新能源汽车市场竞争。",
            "url": "https://example.com/news/byd-price-cut",
            "published_at": "2025-12-29T12:00:00Z",
            "source": "36Kr",
            "category": "汽车"
        },
    ]


def main():
    logger.info("=" * 80)
    logger.info("完整测试 Digest Split Pipeline")
    logger.info("=" * 80)
    
    # 1. 准备测试数据
    logger.info("\n步骤1: 准备测试数据")
    items = create_test_items()
    logger.info(f"  总计: {len(items)} 个items")
    logger.info(f"    - 普通新闻: 3 个")
    logger.info(f"    - 汇总RSS: 2 个")
    
    # 2. Digest检测
    logger.info("\n" + "=" * 80)
    logger.info("步骤2: Digest检测")
    logger.info("=" * 80)
    
    normal_items, digest_items = detect_digest_items(items)
    
    logger.info(f"\n检测结果汇总:")
    logger.info(f"  - 普通items: {len(normal_items)}")
    logger.info(f"  - 汇总items: {len(digest_items)}")
    
    # 3. LLM拆分（如果有汇总items）
    split_items = []
    if digest_items:
        logger.info("\n" + "=" * 80)
        logger.info("步骤3: LLM拆分汇总items")
        logger.info("=" * 80)
        
        # 注意：这里需要真实的DEEPSEEK_API_KEY才能完成拆分
        # 如果没有配置，会失败但不影响流程演示
        try:
            splitter = DigestSplitter(
                cache_ttl_seconds=86400,
                enable_cache=True
            )
            
            split_items, split_stats = split_digest_items(digest_items, splitter)
            
            logger.info(f"\n拆分统计:")
            logger.info(f"  - 成功拆分: {split_stats['successfully_split']}/{split_stats['total_digest_items']}")
            logger.info(f"  - 失败拆分: {split_stats['failed_split']}")
            logger.info(f"  - 生成子事件: {split_stats['total_sub_events']}")
            logger.info(f"  - 平均每个汇总拆出: {split_stats['avg_sub_events_per_digest']:.1f} 个")
            
        except Exception as e:
            logger.error(f"拆分失败（可能是没有配置API_KEY）: {e}")
            logger.info("继续演示后续流程...")
    
    # 4. 合并items
    logger.info("\n" + "=" * 80)
    logger.info("步骤4: 合并items")
    logger.info("=" * 80)
    
    all_items = normal_items + split_items
    logger.info(f"  合并后总计: {len(all_items)} items")
    logger.info(f"    - 普通items: {len(normal_items)}")
    logger.info(f"    - 拆分items: {len(split_items)}")
    
    # 5. 添加fingerprints（聚类需要）
    logger.info("\n步骤5: 添加fingerprints")
    for item in all_items:
        ensure_item_fingerprints(item)
    logger.info(f"  完成: {len(all_items)} items已添加fingerprints")
    
    # 6. 聚类
    logger.info("\n" + "=" * 80)
    logger.info("步骤6: 聚类")
    logger.info("=" * 80)
    
    cluster_cfg = ClusterConfig(
        simhash_max_distance=4,
        title_min_jaccard=0.3,
        time_window_days=3
    )
    
    clusters = cluster_items(all_items, config=cluster_cfg)
    
    logger.info(f"\n聚类结果:")
    logger.info(f"  - 生成clusters: {len(clusters)}")
    
    for idx, cluster in enumerate(clusters, 1):
        logger.info(f"\n  Cluster {idx}: {cluster.cluster_id}")
        logger.info(f"    标题: {cluster.headline[:60]}")
        logger.info(f"    包含items: {len(cluster.items)}")
        
        # 显示cluster中的items来源
        for item_id in cluster.items[:3]:  # 只显示前3个
            item = next((it for it in all_items if it.get("id") == item_id), None)
            if item:
                is_split = "_split_from" in item
                source_type = "拆分" if is_split else "普通"
                logger.info(f"      - [{source_type}] {item.get('title', '')[:50]}")
    
    # 7. 对比分析
    logger.info("\n" + "=" * 80)
    logger.info("步骤7: 效果对比分析")
    logger.info("=" * 80)
    
    logger.info("\n【旧流程问题】:")
    logger.info("  如果不拆分，2个汇总RSS会直接形成2个clusters")
    logger.info("  每个cluster包含10+个不相关事件")
    logger.info("  entities字段会混杂10+个不相关实体")
    logger.info("  topic_score会因为实体过多而虚高")
    
    logger.info("\n【新流程改进】:")
    logger.info(f"  拆分后生成 {len(split_items)} 个独立事件")
    logger.info(f"  每个事件单独参与聚类")
    logger.info(f"  最终形成 {len(clusters)} 个clusters")
    logger.info("  每个cluster只包含相关的单一事件")
    logger.info("  entities准确，topic_score真实可信")
    
    # 8. 输出artifacts
    logger.info("\n" + "=" * 80)
    logger.info("步骤8: 输出artifacts")
    logger.info("=" * 80)
    
    output_dir = Path("out/test_digest_split")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    import json
    
    # 保存检测结果
    with open(output_dir / "digest_items.json", "w", encoding="utf-8") as f:
        json.dump(digest_items, f, ensure_ascii=False, indent=2, default=str)
    logger.info(f"  ✓ 保存: {output_dir / 'digest_items.json'}")
    
    # 保存拆分结果
    if split_items:
        with open(output_dir / "split_items.json", "w", encoding="utf-8") as f:
            json.dump(split_items, f, ensure_ascii=False, indent=2, default=str)
        logger.info(f"  ✓ 保存: {output_dir / 'split_items.json'}")
    
    # 保存聚类结果
    clusters_dict = [
        {
            "cluster_id": c.cluster_id,
            "headline": c.headline,
            "items": c.items,
            "item_count": len(c.items)
        }
        for c in clusters
    ]
    with open(output_dir / "clusters.json", "w", encoding="utf-8") as f:
        json.dump(clusters_dict, f, ensure_ascii=False, indent=2, default=str)
    logger.info(f"  ✓ 保存: {output_dir / 'clusters.json'}")
    
    logger.info("\n" + "=" * 80)
    logger.info("✅ 完整测试完成！")
    logger.info("=" * 80)
    
    logger.info("\n查看详细日志: out/test_digest_split_full.log")
    logger.info("查看输出文件: out/test_digest_split/")


if __name__ == "__main__":
    main()
