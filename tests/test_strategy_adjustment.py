"""
Minimal Test/Demo for Strategy Adjustment System

验收用例：
- Case 1（漏报修复）：标题没有"春晚"但有"总台/央视" → 触发 pattern 或 domain
- Case 2（误报抑制）：只有"字节合作某品牌"无春晚锚点 → 不触发 compound
- Case 3（domain 触发）：LLM#0 输出 domains=["real_estate"] → domain_bonus 可见
"""

from src.topic_selection.strategies.consumer_life_v3 import ConsumerLifeStrategyV3
from src.topic_selection.models import TopicCandidate, SignalScores


def test_case_1_pattern_matching():
    """Case 1: 漏报修复 - 央视/总台等同义词应触发加分"""
    print("\n" + "="*60)
    print("Case 1: 漏报修复 - 央视/总台等同义词应触发加分")
    print("="*60)
    
    strategy = ConsumerLifeStrategyV3()
    
    # 模拟候选：标题没有"春晚"，但有"央视"和"除夕晚会"
    candidate_title = "央视除夕晚会节目单曝光，多个品牌参与合作"
    candidate_entities = ["央视", "除夕晚会"]
    candidate_domains = []  # 假设LLM没有标注domain
    
    result = strategy.compute_strategy_adjustment(
        candidate_title=candidate_title,
        candidate_entities=candidate_entities,
        candidate_domains=candidate_domains,
        enable_keywords=True,
        enable_patterns=True,
        enable_compounds=True,
        enable_domains=False,  # 本case不测试domain
    )
    
    print(f"标题: {candidate_title}")
    print(f"实体: {candidate_entities}")
    print(f"\n调整结果:")
    print(f"  总调整分: {result['total_adjustment']:+.1f}")
    print(f"  命中关键词: {result['matched_keywords']}")
    print(f"  命中模式: {result['matched_patterns']}")
    print(f"  命中联合规则: {result['matched_compounds']}")
    
    # 验证：应该触发 pattern（央视/总台）和 compound（春晚+合作）
    assert result['total_adjustment'] > 10.0, "应该有显著加分"
    assert len(result['matched_patterns']) > 0, "应该命中正则模式"
    assert len(result['matched_compounds']) > 0, "应该命中联合规则（春晚+合作）"
    
    print("\n✅ Case 1 通过：同义词成功触发加分")


def test_case_2_compound_suppression():
    """Case 2: 误报抑制 - 泛词"合作"无锚点不应加分"""
    print("\n" + "="*60)
    print("Case 2: 误报抑制 - 泛词'合作'无锚点不应加分")
    print("="*60)
    
    strategy = ConsumerLifeStrategyV3()
    
    # 模拟候选：只有"字节合作某品牌"，无春晚相关
    candidate_title = "字节跳动与某知名品牌达成战略合作"
    candidate_entities = ["字节跳动", "品牌"]
    candidate_domains = []
    
    result = strategy.compute_strategy_adjustment(
        candidate_title=candidate_title,
        candidate_entities=candidate_entities,
        candidate_domains=candidate_domains,
        enable_keywords=True,
        enable_patterns=True,
        enable_compounds=True,
        enable_domains=False,
    )
    
    print(f"标题: {candidate_title}")
    print(f"实体: {candidate_entities}")
    print(f"\n调整结果:")
    print(f"  总调整分: {result['total_adjustment']:+.1f}")
    print(f"  命中关键词: {result['matched_keywords']}")
    print(f"  命中模式: {result['matched_patterns']}")
    print(f"  命中联合规则: {result['matched_compounds']}")
    
    # 验证：不应该触发春晚相关的compound规则
    spring_festival_compounds = [c for c in result['matched_compounds'] if '春晚' in c]
    assert len(spring_festival_compounds) == 0, "不应该触发春晚联合规则"
    
    # "合作"和"字节"的基础加分应该很低（已降权）
    keyword_bonus = sum(
        strategy.get_keyword_adjustments().get(kw, 0.0) 
        for kw in result['matched_keywords']
    )
    assert keyword_bonus < 5.0, "泛词加分应该很低"
    
    print("\n✅ Case 2 通过：泛词无锚点成功抑制误报")


def test_case_3_domain_bonus():
    """Case 3: domain 触发 - LLM标注的domain应产生加分"""
    print("\n" + "="*60)
    print("Case 3: domain 触发 - LLM标注的domain应产生加分")
    print("="*60)
    
    strategy = ConsumerLifeStrategyV3()
    
    # 模拟候选：LLM标注了 real_estate 和 macro_consume_policy
    candidate_title = "多地调整房贷利率，LPR下调释放利好信号"
    candidate_entities = ["房贷利率", "LPR"]
    candidate_domains = ["real_estate", "macro_consume_policy"]
    
    result = strategy.compute_strategy_adjustment(
        candidate_title=candidate_title,
        candidate_entities=candidate_entities,
        candidate_domains=candidate_domains,
        enable_keywords=True,
        enable_patterns=True,
        enable_compounds=True,
        enable_domains=True,  # 启用domain加分
    )
    
    print(f"标题: {candidate_title}")
    print(f"实体: {candidate_entities}")
    print(f"语义域: {candidate_domains}")
    print(f"\n调整结果:")
    print(f"  总调整分: {result['total_adjustment']:+.1f}")
    print(f"  命中关键词: {result['matched_keywords']}")
    print(f"  命中模式: {result['matched_patterns']}")
    print(f"  命中联合规则: {result['matched_compounds']}")
    print(f"  命中语义域: {result['matched_domains']}")
    print(f"  语义域加成: {result['domain_bonus']:+.1f}")
    
    # 验证：应该有domain加分
    assert result['domain_bonus'] > 0, "应该有语义域加分"
    assert len(result['matched_domains']) > 0, "应该命中语义域"
    assert "real_estate" in result['matched_domains'], "应该命中 real_estate"
    
    # real_estate 的加分应该是 15.0
    domain_map = strategy.get_domain_bonus_map()
    expected_bonus = sum(domain_map.get(d, 0.0) for d in candidate_domains)
    assert abs(result['domain_bonus'] - expected_bonus) < 0.1, "domain加分应该匹配配置"
    
    print(f"\n✅ Case 3 通过：语义域加分 {result['domain_bonus']:.1f} 分（预期 {expected_bonus:.1f}）")


def test_integration_example():
    """综合示例：展示完整的调整流程"""
    print("\n" + "="*60)
    print("综合示例：春晚+房地产+电车 多域叠加")
    print("="*60)
    
    strategy = ConsumerLifeStrategyV3()
    
    # 模拟一个复杂场景：春晚合作 + 房地产政策 + 电车降价
    candidate_title = "央视春晚官宣字节独家合作，同日多地房贷利率下调，新能源车价格战升级"
    candidate_entities = ["央视", "春晚", "字节", "房贷利率", "LPR", "新能源车"]
    candidate_domains = ["national_culture", "real_estate", "ev_auto"]
    
    result = strategy.compute_strategy_adjustment(
        candidate_title=candidate_title,
        candidate_entities=candidate_entities,
        candidate_domains=candidate_domains,
        enable_keywords=True,
        enable_patterns=True,
        enable_compounds=True,
        enable_domains=True,
    )
    
    print(f"标题: {candidate_title}")
    print(f"实体: {candidate_entities}")
    print(f"语义域: {candidate_domains}")
    print(f"\n调整结果:")
    print(f"  总调整分: {result['total_adjustment']:+.1f}")
    print(f"  命中关键词: {result['matched_keywords'][:5]}...")
    print(f"  命中模式: {result['matched_patterns'][:3]}...")
    print(f"  命中联合规则: {result['matched_compounds']}")
    print(f"  命中语义域: {result['matched_domains']}")
    print(f"  语义域加成: {result['domain_bonus']:+.1f}")
    
    # 验证：多域叠加应该有很高的加分
    assert result['total_adjustment'] > 30.0, "多域叠加应该有显著加分"
    assert len(result['matched_domains']) == 3, "应该命中3个语义域"
    
    print(f"\n✅ 综合示例通过：多域叠加总加分 {result['total_adjustment']:.1f} 分")


if __name__ == "__main__":
    print("\n" + "="*60)
    print("策略增强调整系统 - 最小验收测试")
    print("="*60)
    
    try:
        test_case_1_pattern_matching()
        test_case_2_compound_suppression()
        test_case_3_domain_bonus()
        test_integration_example()
        
        print("\n" + "="*60)
        print("✅ 所有测试通过！")
        print("="*60)
        print("\n系统特性验证:")
        print("  ✓ Pattern 正则匹配覆盖同义词（央视/总台/CCTV）")
        print("  ✓ Compound 联合规则抑制泛词误报（合作需要锚点）")
        print("  ✓ Domain 语义域加分修复硬匹配卡死")
        print("  ✓ 多域叠加产生显著加分效果")
        print("\n可回滚:")
        print("  - 通过 enable_keywords/patterns/compounds/domains 开关控制")
        print("  - 默认行为与之前一致（仅 keywords）")
        
    except AssertionError as e:
        print(f"\n❌ 测试失败: {e}")
        raise
    except Exception as e:
        print(f"\n❌ 运行错误: {e}")
        raise
