"""
Pipeline V2 集成测试

演示完整的二次检索+二阶段LLM流程
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

from src.research.models import (
    RetrievalQuery,
    RetrievalPlan,
    LLM1Output,
    EnhancementFields,
    RetrievalBundle,
)
from src.research.cache_manager import CacheManager
from src.research.history_search import HistoryPodcastSearcher
from src.research.retrieval_v2 import RetrievalV2Executor
from src.research.llm_stages import LLMStage1, LLMStage2


def test_full_pipeline_v2():
    """测试完整的Pipeline V2流程"""
    
    print("=" * 80)
    print("Pipeline V2 完整流程测试")
    print("=" * 80)
    
    # 测试数据
    topic_title = "2026年央视春晚四地分会场正式公布"
    research_summary = """
    2026年央视春晚的四个分会场已正式官宣，分别为黑龙江哈尔滨、浙江义乌、安徽合肥和四川宜宾。
    哈尔滨作为北方分会场，将展现冰雪文化特色；义乌以商贸闻名，体现新时代民营经济活力；
    合肥聚焦科技创新与长三角发展；宜宾则突出长江文化与酒乡风情。
    """
    
    # ========================================================================
    # 阶段1: LLM#1 增强
    # ========================================================================
    print("\n" + "=" * 80)
    print("阶段1: LLM#1 增强（生成draft + retrieval_plan）")
    print("=" * 80)
    
    llm_stage1 = LLMStage1()
    llm1_output = llm_stage1.process(topic_title, research_summary)
    
    if not llm1_output:
        print("❌ LLM#1处理失败")
        return
    
    print(f"✅ LLM#1处理成功，耗时 {llm1_output.processing_time_ms}ms")
    print(f"\n【草稿脚本】（前200字）")
    print(llm1_output.draft_script[:200] + "...")
    
    print(f"\n【检索计划】")
    print(f"- 查询数量: {len(llm1_output.retrieval_plan.queries)}")
    for i, query in enumerate(llm1_output.retrieval_plan.queries[:3], 1):
        print(f"  {i}. [{query.intent}] {query.query[:50]}")
    
    # ========================================================================
    # 阶段2: Retrieval#2 二次检索
    # ========================================================================
    print("\n" + "=" * 80)
    print("阶段2: Retrieval#2 二次检索")
    print("=" * 80)
    
    cache_manager = CacheManager(cache_dir=".cache/research")
    history_searcher = HistoryPodcastSearcher(history_dir="out/history_podcasts")
    retrieval_executor = RetrievalV2Executor(
        cache_manager=cache_manager,
        history_searcher=history_searcher,
        max_concurrent=2
    )
    
    retrieval_bundle = retrieval_executor.execute(llm1_output.retrieval_plan)
    
    print(f"✅ 检索完成，耗时 {retrieval_bundle.processing_time_ms}ms")
    print(f"\n【检索结果统计】")
    print(f"- 总查询数: {retrieval_bundle.total_queries}")
    print(f"- 成功查询: {retrieval_bundle.successful_queries}")
    print(f"- 缓存命中: {retrieval_bundle.cache_hits}")
    print(f"- 硬事实: {len(retrieval_bundle.hard_facts)}条")
    print(f"- 统计数据: {len(retrieval_bundle.stats_and_rankings)}条")
    print(f"- 引用来源: {len(retrieval_bundle.citations)}条")
    print(f"- 历史播客: {len(retrieval_bundle.history_podcast_hits)}条")
    print(f"- 缺失项: {len(retrieval_bundle.gaps)}条")
    
    if retrieval_bundle.hard_facts:
        print(f"\n【硬事实示例】")
        for fact in retrieval_bundle.hard_facts[:2]:
            print(f"  - {fact[:100]}...")
    
    # ========================================================================
    # 阶段3: LLM#2 终稿
    # ========================================================================
    print("\n" + "=" * 80)
    print("阶段3: LLM#2 终稿（基于retrieval_bundle生成final_script）")
    print("=" * 80)
    
    llm_stage2 = LLMStage2()
    llm2_output = llm_stage2.process(llm1_output, retrieval_bundle)
    
    if not llm2_output:
        print("❌ LLM#2处理失败")
        print("⚠️ 降级：使用LLM#1的draft_script")
        final_script = llm1_output.draft_script
        degraded = True
    else:
        print(f"✅ LLM#2处理成功，耗时 {llm2_output.processing_time_ms}ms")
        print(f"\n【质量指标】")
        print(f"- 有硬数据: {'是' if llm2_output.has_hard_data else '否'}")
        print(f"- 数据质量分数: {llm2_output.data_quality_score:.2f}")
        print(f"- 降级输出: {'是' if llm2_output.degraded else '否'}")
        print(f"- 使用引用: {len(llm2_output.citations_used)}条")
        
        final_script = llm2_output.final_podcast_script
        degraded = False
    
    # ========================================================================
    # 最终输出
    # ========================================================================
    print("\n" + "=" * 80)
    print("最终播客脚本")
    print("=" * 80)
    print(final_script)
    
    # ========================================================================
    # 保存结果
    # ========================================================================
    output_data = {
        "topic_title": topic_title,
        "llm1_output": llm1_output.model_dump() if llm1_output else None,
        "retrieval_bundle": {
            "total_queries": retrieval_bundle.total_queries,
            "successful_queries": retrieval_bundle.successful_queries,
            "cache_hits": retrieval_bundle.cache_hits,
            "hard_facts_count": len(retrieval_bundle.hard_facts),
            "citations_count": len(retrieval_bundle.citations),
        },
        "llm2_output": llm2_output.model_dump() if llm2_output else None,
        "final_script": final_script,
        "degraded": degraded
    }
    
    output_file = project_root / "demo" / "pipeline_v2_result.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print("\n" + "=" * 80)
    print(f"✅ 结果已保存到: {output_file}")
    print("=" * 80)


def test_no_hard_data_scenario():
    """测试无硬数据场景（验证LLM#2约束）"""
    
    print("\n" + "=" * 80)
    print("测试场景：无硬数据时的约束验证")
    print("=" * 80)
    
    from src.research.models import RetrievalBundle, EnhancementFields
    
    # 模拟LLM#1输出
    llm1_output = LLM1Output(
        draft_script="这是一个测试草稿",
        enhancement=EnhancementFields(
            event_summary="测试事件",
            data_enrichment="测试数据",
            why_now="测试时机",
            actual_impact="测试影响",
            counter_intuitive="测试反直觉"
        ),
        retrieval_plan=RetrievalPlan(queries=[], constraints={}),
        topic_title="测试主题",
        processing_time_ms=0,
        model_used="test"
    )
    
    # 模拟空的检索结果（无硬数据）
    empty_bundle = RetrievalBundle(
        hard_facts=[],
        stats_and_rankings=[],
        citations=[],
        gaps=["所有查询均失败"],
        total_queries=3,
        successful_queries=0,
        cache_hits=0
    )
    
    llm_stage2 = LLMStage2()
    
    # 检查是否正确识别无硬数据
    has_hard_data = llm_stage2._check_hard_data(empty_bundle)
    print(f"检测到硬数据: {has_hard_data}")
    assert has_hard_data is False, "应该检测到无硬数据"
    
    print("✅ 无硬数据场景验证通过")


if __name__ == "__main__":
    # 运行完整流程测试
    test_full_pipeline_v2()
    
    # 运行无硬数据场景测试
    test_no_hard_data_scenario()
