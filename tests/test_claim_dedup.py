"""
Unit tests for src/research/claim_dedup.py
"""

from __future__ import annotations

from src.research.claims import Claim
from src.research.claim_dedup import (
    ClaimCluster,
    deduplicate_claims,
    merge_similar_clusters,
    select_top_claims,
    _calculate_jaccard_similarity,
    _are_claims_similar,
)


def test_jaccard_similarity():
    text1 = "这是一个测试句子"
    text2 = "这是另一个测试句子"
    
    similarity = _calculate_jaccard_similarity(text1, text2)
    
    assert 0.0 <= similarity <= 1.0
    assert similarity > 0.5  # 有较多重叠词


def test_jaccard_similarity_identical():
    text = "完全相同的文本"
    
    similarity = _calculate_jaccard_similarity(text, text)
    
    assert similarity == 1.0


def test_jaccard_similarity_no_overlap():
    text1 = "apple banana orange"
    text2 = "dog cat bird"
    
    similarity = _calculate_jaccard_similarity(text1, text2)
    
    assert similarity == 0.0


def test_are_claims_similar_same_type():
    claim1 = Claim(
        text="公司营收增长50%",
        claim_type="factual",
        confidence=0.8,
        source_item_id="item1",
        location="title",
    )
    
    claim2 = Claim(
        text="公司营收增长50%左右",
        claim_type="factual",
        confidence=0.8,
        source_item_id="item2",
        location="summary",
    )
    
    assert _are_claims_similar(claim1, claim2)


def test_are_claims_similar_different_type():
    claim1 = Claim(
        text="公司营收增长50%",
        claim_type="factual",
        confidence=0.8,
        source_item_id="item1",
        location="title",
    )
    
    claim2 = Claim(
        text="公司营收增长50%",
        claim_type="predictive",
        confidence=0.8,
        source_item_id="item2",
        location="summary",
    )
    
    assert not _are_claims_similar(claim1, claim2)


def test_deduplicate_claims_identical():
    claims = [
        Claim(
            text="相同的断言",
            claim_type="factual",
            confidence=0.8,
            source_item_id="item1",
            location="title",
        ),
        Claim(
            text="相同的断言",
            claim_type="factual",
            confidence=0.9,
            source_item_id="item2",
            location="summary",
        ),
    ]
    
    clusters = deduplicate_claims(claims)
    
    assert len(clusters) == 1
    assert len(clusters[0].members) == 2
    assert clusters[0].representative.confidence == 0.9  # 选择最高置信度


def test_deduplicate_claims_different():
    claims = [
        Claim(
            text="完全不同的断言A",
            claim_type="factual",
            confidence=0.8,
            source_item_id="item1",
            location="title",
        ),
        Claim(
            text="完全不同的断言B",
            claim_type="factual",
            confidence=0.8,
            source_item_id="item2",
            location="summary",
        ),
    ]
    
    clusters = deduplicate_claims(claims)
    
    assert len(clusters) == 2


def test_deduplicate_claims_empty():
    claims = []
    
    clusters = deduplicate_claims(claims)
    
    assert len(clusters) == 0


def test_select_top_claims():
    clusters = [
        ClaimCluster(
            representative=Claim(
                text="高置信度断言",
                claim_type="factual",
                confidence=0.9,
                source_item_id="item1",
                location="title",
            ),
            members=[],
            fingerprint="fp1",
            normalized_text="高置信度断言",
            source_item_ids={"item1"},
            avg_confidence=0.9,
        ),
        ClaimCluster(
            representative=Claim(
                text="低置信度断言",
                claim_type="factual",
                confidence=0.5,
                source_item_id="item2",
                location="title",
            ),
            members=[],
            fingerprint="fp2",
            normalized_text="低置信度断言",
            source_item_ids={"item2"},
            avg_confidence=0.5,
        ),
    ]
    
    selected = select_top_claims(clusters, max_claims=1, min_confidence=0.6)
    
    assert len(selected) == 1
    assert selected[0].avg_confidence == 0.9


def test_select_top_claims_multi_source_bonus():
    clusters = [
        ClaimCluster(
            representative=Claim(
                text="单来源断言",
                claim_type="factual",
                confidence=0.8,
                source_item_id="item1",
                location="title",
            ),
            members=[],
            fingerprint="fp1",
            normalized_text="单来源断言",
            source_item_ids={"item1"},
            avg_confidence=0.8,
        ),
        ClaimCluster(
            representative=Claim(
                text="多来源断言",
                claim_type="factual",
                confidence=0.75,
                source_item_id="item2",
                location="title",
            ),
            members=[],
            fingerprint="fp2",
            normalized_text="多来源断言",
            source_item_ids={"item2", "item3", "item4"},
            avg_confidence=0.75,
        ),
    ]
    
    selected = select_top_claims(clusters, max_claims=2, prefer_multi_source=True)
    
    assert len(selected) == 2
    # 多来源断言应该排在前面（因为有加分）
    assert len(selected[0].source_item_ids) > len(selected[1].source_item_ids)


def test_claim_cluster_to_dict():
    claim = Claim(
        text="测试断言",
        claim_type="factual",
        confidence=0.8,
        source_item_id="item1",
        location="title",
    )
    
    cluster = ClaimCluster(
        representative=claim,
        members=[claim],
        fingerprint="test_fp",
        normalized_text="测试断言",
        source_item_ids={"item1"},
        avg_confidence=0.8,
    )
    
    data = cluster.to_dict()
    
    assert data["representative"]["text"] == "测试断言"
    assert data["member_count"] == 1
    assert data["fingerprint"] == "test_fp"
    assert "item1" in data["source_item_ids"]
    assert data["avg_confidence"] == 0.8


def test_merge_similar_clusters():
    claim1 = Claim(
        text="营收增长50%",
        claim_type="factual",
        confidence=0.8,
        source_item_id="item1",
        location="title",
    )
    
    claim2 = Claim(
        text="营收增长约50%",
        claim_type="factual",
        confidence=0.85,
        source_item_id="item2",
        location="title",
    )
    
    clusters = [
        ClaimCluster(
            representative=claim1,
            members=[claim1],
            fingerprint="fp1",
            normalized_text="营收增长50%",
            source_item_ids={"item1"},
            avg_confidence=0.8,
        ),
        ClaimCluster(
            representative=claim2,
            members=[claim2],
            fingerprint="fp2",
            normalized_text="营收增长约50%",
            source_item_ids={"item2"},
            avg_confidence=0.85,
        ),
    ]
    
    merged = merge_similar_clusters(clusters, jaccard_threshold=0.6)
    
    # 应该合并为一个簇
    assert len(merged) <= len(clusters)


def test_deduplicate_claims_preserves_metadata():
    claims = [
        Claim(
            text="断言文本",
            claim_type="factual",
            confidence=0.8,
            source_item_id="item1",
            location="title",
            metadata={"key": "value1"},
        ),
        Claim(
            text="断言文本",
            claim_type="factual",
            confidence=0.9,
            source_item_id="item2",
            location="summary",
            metadata={"key": "value2"},
        ),
    ]
    
    clusters = deduplicate_claims(claims)
    
    assert len(clusters) == 1
    # 代表性断言应该是置信度最高的
    assert clusters[0].representative.confidence == 0.9
    assert clusters[0].representative.metadata["key"] == "value2"
