"""
测试播客内容增强功能

使用最近的研究结果测试播客内容增强器
"""

import json
import sys
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# 加载环境变量
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

from src.research.podcast_enhancer import PodcastEnhancer


def test_podcast_enhancement():
    """测试播客内容增强"""
    
    # 使用测试数据
    topic_title = "2026年央视春晚四地分会场正式公布"
    
    research_summary = """2026年央视春晚的四个分会场已正式官宣，分别为黑龙江哈尔滨、浙江义乌、安徽合肥和四川宜宾。
多个权威媒体平台在同一时间段发布相同信息，确认了分会场的具体城市名称。
哈尔滨作为北方分会场，将展现冰雪文化特色；义乌以商贸闻名，体现新时代民营经济活力；
合肥聚焦科技创新与长三角发展；宜宾则突出长江文化与酒乡风情。"""
    
    print("=" * 60)
    print("测试播客内容增强功能")
    print("=" * 60)
    print(f"\n主题: {topic_title}")
    print(f"\n研究摘要:\n{research_summary}")
    print("\n" + "=" * 60)
    print("开始增强...")
    print("=" * 60 + "\n")
    
    # 创建增强器
    enhancer = PodcastEnhancer()
    
    # 执行增强
    enhanced = enhancer.enhance_research_result(
        topic_title=topic_title,
        research_summary=research_summary,
        background="央视春晚是中国最重要的电视节目之一，分会场的选择往往反映了国家发展战略和文化导向。",
        related_events="2025年春晚分会场包括了深圳、西安等城市。"
    )
    
    if not enhanced:
        print("❌ 增强失败")
        return
    
    print("✅ 增强成功！\n")
    print("=" * 60)
    print("【A】事件级理解（是什么事）")
    print("=" * 60)
    print(enhanced.event_summary)
    
    print("\n" + "=" * 60)
    print("【B】有趣数据/结构化补充（重点）")
    print("=" * 60)
    print(enhanced.data_enrichment)
    
    print("\n" + "=" * 60)
    print("【C】Why Now（为什么是现在）")
    print("=" * 60)
    print(enhanced.why_now)
    
    print("\n" + "=" * 60)
    print("【D】实际影响（量化但不夸张）")
    print("=" * 60)
    print(enhanced.actual_impact)
    
    print("\n" + "=" * 60)
    print("【E】反直觉点/被忽略的角度")
    print("=" * 60)
    print(enhanced.counter_intuitive)
    
    print("\n" + "=" * 60)
    print("【F】播客朗读文本（核心输出）")
    print("=" * 60)
    print(enhanced.podcast_script)
    
    print("\n" + "=" * 60)
    print(f"处理时间: {enhanced.processing_time_ms}ms")
    print("=" * 60)
    
    # 保存结果
    output_file = project_root / "demo" / "enhanced_podcast_sample.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(enhanced.model_dump(), f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 结果已保存到: {output_file}")


if __name__ == "__main__":
    test_podcast_enhancement()
