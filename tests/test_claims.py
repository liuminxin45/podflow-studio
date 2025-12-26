"""
Unit tests for src/research/claims.py
"""

from __future__ import annotations

from src.research.claims import (
    Claim,
    extract_claims_from_item,
    extract_claims_batch,
    _split_sentences,
)


def test_split_sentences():
    text = "这是第一句话的内容。这是第二句话的内容！这是第三句话的内容？"
    sentences = _split_sentences(text)
    assert len(sentences) == 3
    assert "第一句" in sentences[0]
    assert "第二句" in sentences[1]
    assert "第三句" in sentences[2]


def test_extract_claims_factual():
    item = {
        "id": "test1",
        "title": "公司营收增长50%",
        "summary": "根据财报显示，该公司2024年营收达到100亿元",
        "content": "数据显示营收同比增长50%，超过市场预期。",
    }
    
    claims = extract_claims_from_item(item, max_claims_per_item=10)
    
    assert len(claims) > 0
    factual_claims = [c for c in claims if c.claim_type == "factual"]
    assert len(factual_claims) > 0
    assert all(c.source_item_id == "test1" for c in claims)


def test_extract_claims_causal():
    item = {
        "id": "test2",
        "title": "政策导致市场波动",
        "summary": "由于新政策的实施，导致市场出现大幅波动",
        "content": "分析认为，政策变化引发了投资者的担忧，造成股市下跌。",
    }
    
    claims = extract_claims_from_item(item)
    
    causal_claims = [c for c in claims if c.claim_type == "causal"]
    assert len(causal_claims) > 0


def test_extract_claims_predictive():
    item = {
        "id": "test3",
        "title": "专家预测未来趋势",
        "summary": "预计明年经济将保持稳定增长",
        "content": "分析师预测，未来三年市场规模将达到1000亿。",
    }
    
    claims = extract_claims_from_item(item)
    
    predictive_claims = [c for c in claims if c.claim_type == "predictive"]
    assert len(predictive_claims) > 0


def test_extract_claims_confidence():
    item = {
        "id": "test4",
        "title": "数据显示增长趋势",
        "summary": "根据统计数据，用户数量增长了30%",
        "content": "官方发布的数据显示，活跃用户达到500万人。",
    }
    
    claims = extract_claims_from_item(item, min_confidence=0.6)
    
    assert all(c.confidence >= 0.6 for c in claims)
    # 包含数字的断言应该有较高置信度
    number_claims = [c for c in claims if any(char.isdigit() for char in c.text)]
    if number_claims:
        assert any(c.confidence >= 0.7 for c in number_claims)


def test_extract_claims_max_limit():
    item = {
        "id": "test5",
        "title": "标题",
        "summary": "摘要1。摘要2。摘要3。",
        "content": "内容1。内容2。内容3。内容4。内容5。内容6。内容7。内容8。",
    }
    
    claims = extract_claims_from_item(item, max_claims_per_item=3)
    
    assert len(claims) <= 3


def test_extract_claims_location():
    item = {
        "id": "test6",
        "title": "数据显示增长了30%",
        "summary": "根据报告显示，市场规模达到100亿元",
        "content": "分析认为，未来将继续保持增长趋势。",
    }
    
    claims = extract_claims_from_item(item)
    
    # 应该至少提取到一些断言
    assert len(claims) > 0
    locations = {c.location for c in claims}
    assert "title" in locations or "summary" in locations or "content" in locations


def test_extract_claims_batch():
    items = [
        {
            "id": "item1",
            "title": "新闻1",
            "summary": "数据显示增长了20%",
            "content": "详细内容",
        },
        {
            "id": "item2",
            "title": "新闻2",
            "summary": "预计未来将继续增长",
            "content": "分析内容",
        },
    ]
    
    claims = extract_claims_batch(items, max_claims_per_item=5)
    
    assert len(claims) > 0
    source_ids = {c.source_item_id for c in claims}
    assert "item1" in source_ids or "item2" in source_ids


def test_extract_claims_no_opinions_by_default():
    item = {
        "id": "test7",
        "title": "观点文章",
        "summary": "我认为这个趋势会持续",
        "content": "笔者觉得市场前景看好，应该积极投资。",
    }
    
    claims_no_opinion = extract_claims_from_item(item, include_opinions=False)
    claims_with_opinion = extract_claims_from_item(item, include_opinions=True)
    
    opinion_claims = [c for c in claims_with_opinion if c.claim_type == "opinion"]
    assert len(claims_with_opinion) >= len(claims_no_opinion)
    if opinion_claims:
        assert all(c not in claims_no_opinion for c in opinion_claims)


def test_claim_to_dict():
    claim = Claim(
        text="测试断言",
        claim_type="factual",
        confidence=0.8,
        source_item_id="test_id",
        location="title",
        metadata={"test": "value"},
    )
    
    data = claim.to_dict()
    
    assert data["text"] == "测试断言"
    assert data["claim_type"] == "factual"
    assert data["confidence"] == 0.8
    assert data["source_item_id"] == "test_id"
    assert data["location"] == "title"
    assert data["metadata"]["test"] == "value"


def test_extract_claims_empty_item():
    item = {
        "id": "empty",
        "title": "",
        "summary": "",
        "content": "",
    }
    
    claims = extract_claims_from_item(item)
    
    assert len(claims) == 0


def test_extract_claims_comparative():
    item = {
        "id": "test8",
        "title": "对比分析",
        "summary": "相比去年，今年业绩提升明显",
        "content": "同比增长超过竞争对手，市场份额高于行业平均水平。",
    }
    
    claims = extract_claims_from_item(item)
    
    comparative_claims = [c for c in claims if c.claim_type == "comparative"]
    assert len(comparative_claims) > 0
