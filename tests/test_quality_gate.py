"""
Unit tests for src/llm/quality_gate.py
"""

from __future__ import annotations

from src.llm.quality_gate import (
    QualityIssue,
    QualityAssessment,
    assess_script_quality,
    assess_content_quality,
    assess_evidence_support,
)
from src.llm.editorial import EditorialPlan, EditorialSection


def create_mock_editorial_plan(
    evidence_quality: str = "strong",
    requires_disclaimer: bool = False,
) -> EditorialPlan:
    """创建模拟编辑计划"""
    sections = [
        EditorialSection(
            section_type="what",
            title="核心事实",
            content="这是核心事实内容",
            evidence_support="strong",
            confidence=0.8,
        ),
        EditorialSection(
            section_type="so_what",
            title="为什么重要",
            content="这是重要性分析",
            evidence_support="moderate",
            confidence=0.7,
        ),
        EditorialSection(
            section_type="takeaway",
            title="关键要点",
            content="这是关键要点",
            evidence_support="strong",
            confidence=0.8,
        ),
    ]
    
    return EditorialPlan(
        story_title="测试故事",
        story_angle="测试角度",
        target_audience="测试听众",
        sections=sections,
        overall_confidence=0.75,
        evidence_quality=evidence_quality,
        requires_disclaimer=requires_disclaimer,
        disclaimer_text="这是免责声明" if requires_disclaimer else None,
    )


def test_quality_issue_to_dict():
    issue = QualityIssue(
        issue_type="content",
        severity="major",
        description="测试问题",
        suggestion="测试建议",
        location="第一段",
    )
    
    data = issue.to_dict()
    
    assert data["issue_type"] == "content"
    assert data["severity"] == "major"
    assert data["description"] == "测试问题"
    assert data["suggestion"] == "测试建议"


def test_assess_content_quality_good():
    script = """
    这是一个完整的脚本内容，包含了丰富的信息。
    因此，我们可以得出结论。
    此外，还有更多的分析。
    总之，这是一个高质量的内容。
    """ * 3  # 确保长度足够
    
    plan = create_mock_editorial_plan()
    score, issues = assess_content_quality(script, plan)
    
    assert score >= 0.7
    assert len([i for i in issues if i.severity == "critical"]) == 0


def test_assess_content_quality_too_short():
    script = "太短了"
    plan = create_mock_editorial_plan()
    
    score, issues = assess_content_quality(script, plan)
    
    assert score < 0.7
    critical_issues = [i for i in issues if i.severity == "critical"]
    assert len(critical_issues) > 0
    assert any("过短" in i.description for i in critical_issues)


def test_assess_evidence_support_strong():
    script = "这是一个基于充分证据的脚本内容。"
    plan = create_mock_editorial_plan(evidence_quality="strong")
    
    score, issues = assess_evidence_support(script, plan)
    
    assert score >= 0.8
    assert len([i for i in issues if i.severity == "critical"]) == 0


def test_assess_evidence_support_insufficient():
    script = "这是一个没有证据支持的结论性语句，一定会发生。"
    plan = create_mock_editorial_plan(evidence_quality="insufficient")
    
    score, issues = assess_evidence_support(script, plan)
    
    assert score < 0.6
    critical_issues = [i for i in issues if i.severity == "critical"]
    assert len(critical_issues) > 0


def test_assess_evidence_support_requires_disclaimer():
    script = "这是脚本内容，但是没有免责声明。"
    plan = create_mock_editorial_plan(
        evidence_quality="contradicted",
        requires_disclaimer=True,
    )
    
    score, issues = assess_evidence_support(script, plan)
    
    assert score < 0.6
    critical_issues = [i for i in issues if i.severity == "critical"]
    assert any("免责声明" in i.description for i in critical_issues)


def test_assess_evidence_support_with_disclaimer():
    script = "这是脚本内容。需要注意的是，存在不同说法，请保持独立思考。"
    plan = create_mock_editorial_plan(
        evidence_quality="contradicted",
        requires_disclaimer=True,
    )
    
    score, issues = assess_evidence_support(script, plan)
    
    # 证据矛盾时会有critical问题，但如果包含免责关键词，不应该有"缺少免责声明"的问题
    missing_disclaimer_issues = [
        i for i in issues 
        if i.severity == "critical" and "缺少必要的免责声明" in i.description
    ]
    assert len(missing_disclaimer_issues) == 0


def test_assess_script_quality_pass():
    script = """
    这是一个完整且高质量的脚本。
    
    首先，让我们了解核心事实。数据显示，市场增长了30%。
    
    因此，这个趋势值得我们关注。
    
    此外，对于普通消费者来说，建议保持关注。
    
    总之，这是一个值得了解的话题。
    """ * 2
    
    plan = create_mock_editorial_plan(evidence_quality="strong")
    assessment = assess_script_quality(script, plan)
    
    assert assessment.decision == "pass"
    assert assessment.overall_score >= 0.7


def test_assess_script_quality_revise():
    script = """
    这是一个需要修订的脚本，内容相对完整但还有改进空间。
    
    首先，我们来看核心事实。数据显示市场有所增长。
    
    因此，这个趋势值得关注。
    
    此外，对于听众来说，建议保持关注。
    
    总之，这是一个需要进一步完善的内容。
    """ * 2
    
    plan = create_mock_editorial_plan(evidence_quality="moderate")
    assessment = assess_script_quality(script, plan)
    
    # 应该是revise或pass，不应该是drop
    assert assessment.decision in ("revise", "pass")
    assert assessment.overall_score >= 0.4


def test_assess_script_quality_drop():
    script = "太短"
    plan = create_mock_editorial_plan(evidence_quality="insufficient")
    
    assessment = assess_script_quality(script, plan)
    
    assert assessment.decision == "drop"
    # 由于有critical问题，应该被drop
    critical_issues = [i for i in assessment.issues if i.severity == "critical"]
    assert len(critical_issues) > 0
    # 验证有严重的内容或证据问题
    assert any(i.issue_type in ("content", "evidence") for i in critical_issues)


def test_quality_assessment_to_dict():
    assessment = QualityAssessment(
        decision="pass",
        overall_score=0.85,
        dimension_scores={"content": 0.9, "evidence": 0.8},
        issues=[],
        strengths=["内容完整", "证据充分"],
        revision_suggestions=[],
    )
    
    data = assessment.to_dict()
    
    assert data["decision"] == "pass"
    assert data["overall_score"] == 0.85
    assert "dimension_scores" in data
    assert len(data["strengths"]) == 2


def test_assess_script_quality_with_conclusive_language():
    script = """
    这个趋势一定会持续下去，毫无疑问。
    市场必然会增长，这是显而易见的。
    """ * 3
    
    plan = create_mock_editorial_plan(evidence_quality="weak")
    assessment = assess_script_quality(script, plan)
    
    # 应该检测到过于肯定的表述
    evidence_issues = [i for i in assessment.issues if i.issue_type == "evidence"]
    assert len(evidence_issues) > 0


def test_assess_script_quality_missing_sections():
    script = "只有一个简单的内容，没有完整的结构。" * 10
    
    # 创建一个缺少必要章节的计划
    plan = EditorialPlan(
        story_title="测试",
        story_angle="测试",
        target_audience="测试",
        sections=[
            EditorialSection(
                section_type="what",
                title="核心事实",
                content="内容",
                evidence_support="strong",
                confidence=0.8,
            ),
        ],
        overall_confidence=0.7,
        evidence_quality="strong",
    )
    
    assessment = assess_script_quality(script, plan)
    
    # 应该检测到缺少章节
    content_issues = [i for i in assessment.issues if "章节" in i.description]
    assert len(content_issues) > 0
