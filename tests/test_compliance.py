"""
Unit tests for src/fetch/compliance.py
"""

from __future__ import annotations

from src.fetch.compliance import (
    validate_compliance,
    filter_compliant_items,
    assess_compliance,
    Issue,
    ComplianceResult,
)


def test_compliance_result_add_issue():
    result = ComplianceResult(score=1.0)
    
    issue = Issue(
        type="sensitive_word",
        severity="medium",
        message="Test issue",
    )
    
    result.add_issue(issue, penalty=0.3)
    
    assert len(result.issues) == 1
    assert result.score == 0.7


def test_compliance_result_finalize():
    result = ComplianceResult(score=0.8)
    result.finalize(min_score=0.6)
    assert result.passed is True
    
    result2 = ComplianceResult(score=0.5)
    result2.finalize(min_score=0.6)
    assert result2.passed is False


def test_validate_compliance_clean_item():
    item = {
        "title": "Clean News Title",
        "summary": "This is a clean news summary.",
        "content": "This is clean news content without any issues.",
        "url": "https://example.com/news/1",
    }
    
    result = validate_compliance(item, min_score=0.6)
    
    assert result["passed"] is True
    assert result["score"] >= 0.6


def test_validate_compliance_with_pii():
    item = {
        "title": "Contact Information",
        "summary": "Please contact us",
        "content": "Email: test@example.com, Phone: 13800138000",
        "url": "https://example.com/contact",
    }
    
    result = validate_compliance(
        item,
        rules=["pii"],
        min_score=0.6,
        rule_overrides={
            "pii": {
                "enabled": True,
                "params": {"scope": "full", "max_hits_per_type": 5},
            }
        },
    )
    
    assert "issues" in result
    pii_issues = [i for i in result["issues"] if i["type"] == "pii"]
    assert len(pii_issues) > 0


def test_validate_compliance_with_external_links():
    item = {
        "title": "Article with Links",
        "summary": "Check out these links",
        "content": "Visit https://external1.com and https://external2.com and https://external3.com and https://external4.com for more info.",
        "url": "https://example.com/article",
    }
    
    result = validate_compliance(
        item,
        rules=["external_links"],
        min_score=0.6,
        rule_overrides={
            "external_links": {
                "enabled": True,
                "params": {"max_urls": 2},
            }
        },
    )
    
    assert "issues" in result
    link_issues = [i for i in result["issues"] if i["type"] == "external_links"]
    assert len(link_issues) > 0


def test_validate_compliance_with_copyright_keywords():
    item = {
        "title": "Protected Content",
        "summary": "版权所有，未经授权禁止转载",
        "content": "This content is copyrighted. All Rights Reserved. 违者必究。",
        "url": "https://example.com/protected",
    }
    
    result = validate_compliance(
        item,
        rules=["copyright"],
        min_score=0.6,
    )
    
    assert "issues" in result
    copyright_issues = [i for i in result["issues"] if i["type"] == "copyright"]
    assert len(copyright_issues) > 0


def test_filter_compliant_items():
    items = [
        {
            "title": "Clean Item 1",
            "summary": "Clean summary",
            "content": "Clean content",
            "url": "https://example.com/1",
        },
        {
            "title": "Item with PII",
            "summary": "Contact: test@example.com",
            "content": "Phone: 13800138000",
            "url": "https://example.com/2",
        },
        {
            "title": "Clean Item 2",
            "summary": "Another clean summary",
            "content": "Another clean content",
            "url": "https://example.com/3",
        },
    ]
    
    compliant, non_compliant = filter_compliant_items(
        items,
        rules=["pii"],
        min_score=0.7,
        rule_overrides={
            "pii": {
                "enabled": True,
                "params": {"scope": "full"},
            }
        },
    )
    
    assert len(compliant) >= 1
    assert all("_compliance" in item for item in compliant)
    assert all(item["_compliance"]["passed"] for item in compliant)
    
    if non_compliant:
        assert all("_compliance" in item for item in non_compliant)
        assert all(not item["_compliance"]["passed"] for item in non_compliant)


def test_assess_compliance():
    items = [
        {
            "title": "Item 1",
            "_compliance": {
                "passed": True,
                "score": 0.9,
                "issues": [],
            },
        },
        {
            "title": "Item 2",
            "_compliance": {
                "passed": False,
                "score": 0.5,
                "issues": [
                    {"type": "pii", "severity": "medium"},
                    {"type": "external_link", "severity": "low"},
                ],
            },
        },
        {
            "title": "Item 3",
            "_compliance": {
                "passed": True,
                "score": 0.8,
                "issues": [],
            },
        },
    ]
    
    report = assess_compliance(items)
    
    assert report["total_items"] == 3
    assert report["compliant_count"] == 2
    assert report["compliance_rate"] == 2 / 3
    assert "average_score" in report
    assert "issue_counts" in report
    assert report["issue_counts"]["pii"] == 1
    assert report["issue_counts"]["external_link"] == 1
    assert "summary" in report


def test_validate_compliance_policy_levels():
    item = {
        "title": "Test Item",
        "summary": "Test summary with 版权所有",
        "content": "Test content",
        "url": "https://example.com/test",
    }
    
    result_standard = validate_compliance(
        item,
        rules=["copyright"],
        min_score=0.6,
        policy_level="standard",
    )
    
    result_strict = validate_compliance(
        item,
        rules=["copyright"],
        min_score=0.6,
        policy_level="strict",
    )
    
    result_loose = validate_compliance(
        item,
        rules=["copyright"],
        min_score=0.6,
        policy_level="loose",
    )
    
    assert result_strict["score"] <= result_standard["score"]
    assert result_loose["score"] >= result_standard["score"]


def test_compliance_result_to_dict():
    result = ComplianceResult(passed=True, score=0.85)
    
    issue = Issue(
        type="test_issue",
        severity="low",
        message="Test message",
        confidence=0.9,
        location="title",
        match_text="test",
    )
    result.add_issue(issue, penalty=0.1)
    
    data = result.to_dict()
    
    assert data["passed"] is True
    assert data["score"] == 0.75
    assert data["issues_count"] == 1
    assert len(data["issues"]) == 1
    assert data["issues"][0]["type"] == "test_issue"
    assert data["issues"][0]["severity"] == "low"


def test_filter_compliant_items_with_custom_rules():
    items = [
        {
            "title": "Item 1",
            "summary": "Summary 1",
            "content": "Content 1",
            "url": "https://example.com/1",
        },
    ]
    
    compliant, non_compliant = filter_compliant_items(
        items,
        rules=["sensitive_words", "illegal_content"],
        min_score=0.5,
        policy_level="loose",
    )
    
    assert len(compliant) + len(non_compliant) == len(items)
