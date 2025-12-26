"""
Unit tests for src/llm/editorial.py
"""

from __future__ import annotations

from src.llm.editorial import (
    EditorialSection,
    EditorialPlan,
    create_editorial_plan,
    assess_evidence_quality,
    generate_disclaimer,
    create_what_section,
)
from src.research.evidence import EvidencePack, Evidence
from src.research.claims import Claim
from src.research.query_builder import ResearchQuery


def create_mock_evidence_pack(verdict: str = "supported", confidence: float = 0.8) -> EvidencePack:
    """创建模拟证据包"""
    claim = Claim(
        text="测试断言内容",
        claim_type="factual",
        confidence=0.8,
        source_item_id="test_item",
        location="title",
    )
    
    query = ResearchQuery(
        query_text="测试查询",
        query_type="main",
        claim_id="test_claim",
    )
    
    evidence = Evidence(
        source_title="测试来源",
        content="测试证据内容",
        relevance_score=0.8,
        credibility_score=0.7,
        timeliness_score=0.9,
    )
    
    pack = EvidencePack(
        claim=claim,
        main_query=query,
        main_evidence=[evidence],
        verdict=verdict,
        confidence=confidence,
    )
    
    return pack


def test_assess_evidence_quality_strong():
    packs = [
        create_mock_evidence_pack("supported", 0.9),
        create_mock_evidence_pack("supported", 0.8),
        create_mock_evidence_pack("supported", 0.85),
    ]
    
    quality, confidence, has_contradiction = assess_evidence_quality(packs)
    
    assert quality == "strong"
    assert confidence > 0.8
    assert has_contradiction is False


def test_assess_evidence_quality_contradicted():
    packs = [
        create_mock_evidence_pack("supported", 0.8),
        create_mock_evidence_pack("refuted", 0.7),
    ]
    
    quality, confidence, has_contradiction = assess_evidence_quality(packs)
    
    assert quality == "contradicted"
    assert has_contradiction is True


def test_assess_evidence_quality_insufficient():
    packs = [
        create_mock_evidence_pack("insufficient", 0.3),
        create_mock_evidence_pack("insufficient", 0.2),
    ]
    
    quality, confidence, has_contradiction = assess_evidence_quality(packs)
    
    assert quality == "insufficient"
    assert confidence < 0.5


def test_generate_disclaimer_contradicted():
    disclaimer = generate_disclaimer("contradicted", True)
    
    assert disclaimer is not None
    assert "不同的说法" in disclaimer or "不同" in disclaimer


def test_generate_disclaimer_insufficient():
    disclaimer = generate_disclaimer("insufficient", False)
    
    assert disclaimer is not None
    assert "信息有限" in disclaimer or "有限" in disclaimer


def test_generate_disclaimer_strong():
    disclaimer = generate_disclaimer("strong", False)
    
    assert disclaimer is None


def test_create_what_section():
    packs = [
        create_mock_evidence_pack("supported", 0.9),
        create_mock_evidence_pack("supported", 0.8),
    ]
    
    section = create_what_section(packs, max_facts=5)
    
    assert section.section_type == "what"
    assert section.title == "核心事实"
    assert section.evidence_support in ("strong", "moderate")
    assert len(section.content) > 0


def test_create_editorial_plan():
    packs = [
        create_mock_evidence_pack("supported", 0.8),
        create_mock_evidence_pack("supported", 0.75),
        create_mock_evidence_pack("uncertain", 0.5),
    ]
    
    plan = create_editorial_plan(
        story_title="测试故事",
        story_angle="科技发展",
        target_audience="普通听众",
        evidence_packs=packs,
    )
    
    assert plan.story_title == "测试故事"
    assert plan.story_angle == "科技发展"
    assert plan.target_audience == "普通听众"
    assert len(plan.sections) == 5  # what, so_what, impact, uncertainty, takeaway
    assert plan.overall_confidence > 0.0


def test_editorial_section_to_dict():
    section = EditorialSection(
        section_type="what",
        title="测试章节",
        content="测试内容",
        evidence_support="strong",
        confidence=0.8,
        sources=["来源1", "来源2"],
    )
    
    data = section.to_dict()
    
    assert data["section_type"] == "what"
    assert data["title"] == "测试章节"
    assert data["evidence_support"] == "strong"
    assert data["confidence"] == 0.8
    assert len(data["sources"]) == 2


def test_editorial_plan_requires_disclaimer():
    packs = [
        create_mock_evidence_pack("supported", 0.8),
        create_mock_evidence_pack("refuted", 0.7),
    ]
    
    plan = create_editorial_plan(
        story_title="有争议的话题",
        story_angle="社会热点",
        target_audience="关注者",
        evidence_packs=packs,
    )
    
    assert plan.requires_disclaimer is True
    assert plan.disclaimer_text is not None
    assert plan.evidence_quality == "contradicted"


def test_editorial_plan_to_dict():
    packs = [create_mock_evidence_pack("supported", 0.8)]
    
    plan = create_editorial_plan(
        story_title="测试",
        story_angle="测试角度",
        target_audience="测试听众",
        evidence_packs=packs,
    )
    
    data = plan.to_dict()
    
    assert "story_title" in data
    assert "sections" in data
    assert "overall_confidence" in data
    assert "evidence_quality" in data
    assert isinstance(data["sections"], list)


def test_create_editorial_plan_empty_packs():
    plan = create_editorial_plan(
        story_title="无证据故事",
        story_angle="测试",
        target_audience="测试",
        evidence_packs=[],
    )
    
    assert plan.evidence_quality == "insufficient"
    assert plan.overall_confidence == 0.0
    assert len(plan.sections) == 5
