"""
Validation Test: Tencent Yuanbao Topic Scoring

验证"腾讯元宝任务功能上线"类主题能稳定通过maybe门槛（>=50分）
"""

from src.topic_selection.models import (
    TopicCandidate, SignalScores, ProxySignals, TopicArchetype
)
from src.topic_selection.strategies.consumer_life_v3 import ConsumerLifeStrategyV3
from src.topic_selection.topic_scoring import TopicScorer


def test_tencent_yuanbao_scoring():
    """测试腾讯元宝主题评分"""
    from datetime import datetime
    
    # 模拟LLM#0打标结果（假设LLM正确识别为consumer_ai_app域）
    signals = SignalScores(
        archetypes={
            TopicArchetype.CHANGE_HAPPENING: 2.0,
            TopicArchetype.PERSONAL_IMPACT: 2.0,
            TopicArchetype.COMPETITION_CONFLICT: 1.0,
            TopicArchetype.RISK_OPPORTUNITY: 1.0,
            TopicArchetype.COUNTER_INTUITIVE: 0.5,
            TopicArchetype.INFLECTION_TREND: 1.5,
        },
        continuity=0.7,
        why_now=0.8,
        data_enrichable=0.6,
        follow_up_potential=0.7,
        domains=["consumer_ai_app"]  # 关键：LLM识别为国民AI应用
    )
    
    proxy = ProxySignals(
        trend_signal=0.5,
        time_signal=0.7,
        persona_relevance=0.6,
        history_echo=0.0
    )
    
    candidate = TopicCandidate(
        topic_id="topic:test_yuanbao",
        title="腾讯元宝宣布"任务"功能上线：一句话安排时间，到点就提醒",
        items=["item1"],
        entities=["腾讯元宝", "DeepSeek"],
        signal_profile=signals,
        domains=["consumer_ai_app"],
        proxy_signals=proxy,
        created_at=datetime.now().isoformat()
    )
    
    # 使用ConsumerLifeStrategyV3
    strategy = ConsumerLifeStrategyV3()
    scorer_config = strategy.get_scorer_config()
    scorer = TopicScorer(config=scorer_config)
    
    # 步骤1: 基础打分
    breakdown = scorer._score_single(candidate)
    base_score = breakdown.total_score
    
    print(f"\n=== 腾讯元宝主题评分测试 ===")
    print(f"标题: {candidate.title}")
    print(f"\n【步骤1: 基础打分】")
    print(f"  内容价值分: {breakdown.content_score:.2f}")
    print(f"  代理信号分: {breakdown.proxy_score:.2f}")
    print(f"  结构加成: {breakdown.structure_bonus:.2f}")
    print(f"  基础总分: {base_score:.2f}")
    print(f"  决策: {breakdown.decision}")
    
    # 步骤2: 应用策略调整
    adjustment_result = strategy.compute_strategy_adjustment(
        candidate_title=candidate.title,
        candidate_entities=candidate.entities,
        candidate_domains=candidate.domains,
        enable_keywords=True,
        enable_patterns=True,
        enable_compounds=True,
        enable_domains=True
    )
    
    total_adjustment = adjustment_result["total_adjustment"]
    final_score = base_score + total_adjustment
    final_score = max(0.0, min(100.0, final_score))
    
    print(f"\n【步骤2: 策略调整】")
    print(f"  匹配关键词: {adjustment_result['matched_keywords']}")
    print(f"  匹配模式: {adjustment_result['matched_patterns']}")
    print(f"  匹配联合规则: {adjustment_result['matched_compounds']}")
    print(f"  匹配域: {adjustment_result['matched_domains']}")
    print(f"  域加分: {adjustment_result['domain_bonus']:.2f}")
    print(f"  总调整: {total_adjustment:+.2f}")
    print(f"  最终得分: {final_score:.2f}")
    
    # 验证结果
    print(f"\n【验证结果】")
    
    # 检查1: 域识别
    assert "consumer_ai_app" in candidate.domains, "❌ 未识别consumer_ai_app域"
    print(f"  ✅ 域识别正确: {candidate.domains}")
    
    # 检查2: 域加分
    assert adjustment_result["domain_bonus"] >= 10.0, f"❌ 域加分过低: {adjustment_result['domain_bonus']}"
    print(f"  ✅ 域加分充足: {adjustment_result['domain_bonus']:.2f}")
    
    # 检查3: 联合规则命中
    assert len(adjustment_result["matched_compounds"]) > 0, "❌ 未命中联合规则"
    print(f"  ✅ 联合规则命中: {adjustment_result['matched_compounds']}")
    
    # 检查4: 技术惩罚豁免（如果有"模型"关键词）
    if "模型" in candidate.title or any("模型" in e for e in candidate.entities):
        # 应该看到豁免标记
        exempted = any("豁免" in kw for kw in adjustment_result["matched_keywords"])
        if exempted:
            print(f"  ✅ 技术惩罚词已豁免")
        else:
            print(f"  ⚠️ 未检测到豁免标记（可能未命中技术词）")
    
    # 检查5: 最终得分达标
    threshold = scorer_config.threshold_maybe_publish
    if final_score >= threshold:
        print(f"  ✅ 最终得分达标: {final_score:.2f} >= {threshold}")
    else:
        print(f"  ❌ 最终得分未达标: {final_score:.2f} < {threshold}")
        print(f"     需要提升: {threshold - final_score:.2f}分")
    
    # 断言
    assert final_score >= threshold, \
        f"腾讯元宝主题得分{final_score:.2f}未达到maybe门槛{threshold}"
    
    print(f"\n✅ 测试通过！腾讯元宝主题得分 {final_score:.2f} >= {threshold}")
    return final_score


def test_comparison_with_jd_ai():
    """对比测试：腾讯元宝 vs 京东AI购"""
    from datetime import datetime
    
    print("\n\n=== 对比测试：腾讯元宝 vs 京东AI购 ===")
    
    # 腾讯元宝
    yuanbao_signals = SignalScores(
        archetypes={
            TopicArchetype.CHANGE_HAPPENING: 2.0,
            TopicArchetype.PERSONAL_IMPACT: 2.0,
            TopicArchetype.COMPETITION_CONFLICT: 1.0,
            TopicArchetype.RISK_OPPORTUNITY: 1.0,
            TopicArchetype.COUNTER_INTUITIVE: 0.5,
            TopicArchetype.INFLECTION_TREND: 1.5,
        },
        continuity=0.7,
        why_now=0.8,
        data_enrichable=0.6,
        follow_up_potential=0.7,
        domains=["consumer_ai_app"]
    )
    
    yuanbao_candidate = TopicCandidate(
        topic_id="topic:yuanbao",
        title="腾讯元宝宣布“任务”功能上线：一句话安排时间，到点就提醒",
        items=["item1"],
        entities=["腾讯元宝", "DeepSeek"],
        signal_profile=yuanbao_signals,
        domains=["consumer_ai_app"],
        proxy_signals=ProxySignals(
            trend_signal=0.5, time_signal=0.7,
            persona_relevance=0.6, history_echo=0.0
        ),
        created_at=datetime.now().isoformat()
    )
    
    # 京东AI购
    jd_signals = SignalScores(
        archetypes={
            TopicArchetype.CHANGE_HAPPENING: 2.0,
            TopicArchetype.PERSONAL_IMPACT: 2.0,
            TopicArchetype.COMPETITION_CONFLICT: 1.5,
            TopicArchetype.RISK_OPPORTUNITY: 1.0,
            TopicArchetype.COUNTER_INTUITIVE: 0.0,
            TopicArchetype.INFLECTION_TREND: 1.5,
        },
        continuity=0.8,
        why_now=0.7,
        data_enrichable=0.8,
        follow_up_potential=0.5,
        domains=["consumer_frontier_tech"]
    )
    
    jd_candidate = TopicCandidate(
        topic_id="topic:jd_ai",
        title="京东AI购抢先实测，一句话搞定吃喝穿用，背靠自研大模型",
        items=["item1"],
        entities=["京东AI购", "京东", "言犀大模型"],
        signal_profile=jd_signals,
        domains=["consumer_frontier_tech"],
        proxy_signals=ProxySignals(
            trend_signal=0.7, time_signal=0.7,
            persona_relevance=0.6, history_echo=0.0
        ),
        created_at=datetime.now().isoformat()
    )
    
    strategy = ConsumerLifeStrategyV3()
    scorer = TopicScorer(config=strategy.get_scorer_config())
    
    # 评分
    candidates = [yuanbao_candidate, jd_candidate]
    results = []
    
    for candidate in candidates:
        breakdown = scorer._score_single(candidate)
        base_score = breakdown.total_score
        
        adjustment_result = strategy.compute_strategy_adjustment(
            candidate_title=candidate.title,
            candidate_entities=candidate.entities,
            candidate_domains=candidate.domains,
            enable_keywords=True,
            enable_patterns=True,
            enable_compounds=True,
            enable_domains=True
        )
        
        final_score = base_score + adjustment_result["total_adjustment"]
        final_score = max(0.0, min(100.0, final_score))
        
        results.append({
            "title": candidate.title[:30] + "...",
            "base_score": base_score,
            "domain_bonus": adjustment_result["domain_bonus"],
            "total_adjustment": adjustment_result["total_adjustment"],
            "final_score": final_score,
            "domains": candidate.domains,
            "compounds": adjustment_result["matched_compounds"]
        })
    
    print("\n对比结果：")
    for i, result in enumerate(results, 1):
        print(f"\n{i}. {result['title']}")
        print(f"   域: {result['domains']}")
        print(f"   基础分: {result['base_score']:.2f}")
        print(f"   域加分: {result['domain_bonus']:.2f}")
        print(f"   总调整: {result['total_adjustment']:+.2f}")
        print(f"   最终分: {result['final_score']:.2f}")
        print(f"   联合规则: {result['compounds']}")
    
    # 两者都应该通过
    threshold = strategy.get_scorer_config().threshold_maybe_publish
    for result in results:
        assert result["final_score"] >= threshold, \
            f"{result['title']} 得分{result['final_score']:.2f}未达标"
    
    print(f"\n✅ 两个主题均通过maybe门槛（{threshold}）")


if __name__ == "__main__":
    print("=" * 60)
    print("腾讯元宝主题评分验证测试")
    print("=" * 60)
    
    try:
        score = test_tencent_yuanbao_scoring()
        test_comparison_with_jd_ai()
        
        print("\n" + "=" * 60)
        print("✅ 所有测试通过！")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ 测试失败: {e}")
        raise
    except Exception as e:
        print(f"\n❌ 测试异常: {e}")
        raise
