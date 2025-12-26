"""
Quality Gate Module

对生成的脚本进行质量评估，决定是否通过、修订或丢弃。

评估维度：
- 内容质量：信息密度、逻辑连贯性、语言流畅度
- 证据支持：是否有充分证据支持
- 听众价值：是否对目标听众有价值
- 合规性：是否符合免责声明要求

决策：
- pass: 通过，可以直接使用
- revise: 需要修订，给出具体建议
- drop: 丢弃，质量不达标

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from src.llm.editorial import EditorialPlan


@dataclass
class QualityIssue:
    """质量问题"""
    issue_type: str  # content / evidence / value / compliance / language
    severity: str  # critical / major / minor
    description: str
    suggestion: Optional[str] = None
    location: Optional[str] = None  # 问题位置
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "issue_type": self.issue_type,
            "severity": self.severity,
            "description": self.description,
            "suggestion": self.suggestion,
            "location": self.location,
        }


@dataclass
class QualityAssessment:
    """质量评估结果"""
    decision: str  # pass / revise / drop
    overall_score: float  # 0.0-1.0
    dimension_scores: Dict[str, float] = field(default_factory=dict)
    issues: List[QualityIssue] = field(default_factory=list)
    strengths: List[str] = field(default_factory=list)
    revision_suggestions: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "decision": self.decision,
            "overall_score": self.overall_score,
            "dimension_scores": self.dimension_scores,
            "issues": [i.to_dict() for i in self.issues],
            "strengths": self.strengths,
            "revision_suggestions": self.revision_suggestions,
            "metadata": self.metadata,
        }


def assess_content_quality(script: str, editorial_plan: EditorialPlan) -> tuple[float, List[QualityIssue]]:
    """
    评估内容质量
    
    Args:
        script: 脚本文本
        editorial_plan: 编辑计划
        
    Returns:
        (score, issues)
    """
    issues: List[QualityIssue] = []
    score = 1.0
    
    # 检查长度
    script_length = len(script)
    if script_length < 200:
        issues.append(QualityIssue(
            issue_type="content",
            severity="critical",
            description="脚本过短，信息量不足",
            suggestion="扩充内容，增加更多细节和分析",
        ))
        score -= 0.4
    elif script_length > 5000:
        issues.append(QualityIssue(
            issue_type="content",
            severity="minor",
            description="脚本过长，可能影响听众注意力",
            suggestion="精简内容，突出重点",
        ))
        score -= 0.1
    
    # 检查结构完整性
    section_types = {s.section_type for s in editorial_plan.sections}
    required_sections = {"what", "so_what", "takeaway"}
    missing_sections = required_sections - section_types
    
    if missing_sections:
        issues.append(QualityIssue(
            issue_type="content",
            severity="major",
            description=f"缺少必要章节: {', '.join(missing_sections)}",
            suggestion="补充缺失的章节内容",
        ))
        score -= 0.2
    
    # 检查逻辑连贯性（简化版：检查是否有过渡词）
    transition_words = ["因此", "所以", "然而", "但是", "此外", "另外", "总之", "综上"]
    has_transitions = any(word in script for word in transition_words)
    
    if not has_transitions and script_length > 500:
        issues.append(QualityIssue(
            issue_type="content",
            severity="minor",
            description="缺少逻辑过渡，可能影响连贯性",
            suggestion="添加过渡词和连接句，增强逻辑流畅度",
        ))
        score -= 0.1
    
    return max(0.0, score), issues


def assess_evidence_support(script: str, editorial_plan: EditorialPlan) -> tuple[float, List[QualityIssue]]:
    """
    评估证据支持度
    
    Args:
        script: 脚本文本
        editorial_plan: 编辑计划
        
    Returns:
        (score, issues)
    """
    issues: List[QualityIssue] = []
    score = 1.0
    
    # 检查证据质量
    evidence_quality = editorial_plan.evidence_quality
    
    if evidence_quality == "insufficient":
        issues.append(QualityIssue(
            issue_type="evidence",
            severity="critical",
            description="证据不足，不应输出结论性语句",
            suggestion="删除或弱化结论性表述，改为描述性语言",
        ))
        score -= 0.5
    elif evidence_quality == "weak":
        issues.append(QualityIssue(
            issue_type="evidence",
            severity="major",
            description="证据较弱，需要谨慎表述",
            suggestion="添加限定词，如'据初步了解'、'根据部分信息'",
        ))
        score -= 0.3
    elif evidence_quality == "contradicted":
        issues.append(QualityIssue(
            issue_type="evidence",
            severity="critical",
            description="证据存在矛盾，必须添加免责声明",
            suggestion="在脚本中明确指出不同观点，并提醒听众独立判断",
        ))
        score -= 0.4
    
    # 检查是否包含免责声明（如果需要）
    if editorial_plan.requires_disclaimer:
        disclaimer_keywords = ["需要注意", "不同说法", "保持独立思考", "信息有限", "尚未确认"]
        has_disclaimer = any(kw in script for kw in disclaimer_keywords)
        
        if not has_disclaimer:
            issues.append(QualityIssue(
                issue_type="compliance",
                severity="critical",
                description="缺少必要的免责声明",
                suggestion=f"添加免责声明: {editorial_plan.disclaimer_text}",
            ))
            score -= 0.5
    
    # 检查结论性语句（如果证据不足）
    conclusive_patterns = ["一定", "必然", "肯定", "毫无疑问", "显而易见"]
    has_conclusive = any(pattern in script for pattern in conclusive_patterns)
    
    if has_conclusive and evidence_quality in ("insufficient", "weak"):
        issues.append(QualityIssue(
            issue_type="evidence",
            severity="major",
            description="证据不足时使用了过于肯定的表述",
            suggestion="将肯定性表述改为可能性表述，如'可能'、'或许'、'据了解'",
        ))
        score -= 0.2
    
    return max(0.0, score), issues


def assess_audience_value(script: str, editorial_plan: EditorialPlan) -> tuple[float, List[QualityIssue]]:
    """
    评估听众价值
    
    Args:
        script: 脚本文本
        editorial_plan: 编辑计划
        
    Returns:
        (score, issues)
    """
    issues: List[QualityIssue] = []
    score = 1.0
    
    # 检查是否有实用信息
    practical_keywords = ["建议", "注意", "关注", "了解", "如何", "什么", "为什么"]
    has_practical = any(kw in script for kw in practical_keywords)
    
    if not has_practical:
        issues.append(QualityIssue(
            issue_type="value",
            severity="minor",
            description="缺少实用建议或行动指引",
            suggestion="添加对听众有实际价值的建议或要点",
        ))
        score -= 0.15
    
    # 检查是否有takeaway章节
    has_takeaway = any(s.section_type == "takeaway" for s in editorial_plan.sections)
    
    if not has_takeaway:
        issues.append(QualityIssue(
            issue_type="value",
            severity="major",
            description="缺少关键要点总结",
            suggestion="添加takeaway章节，总结听众应该知道的要点",
        ))
        score -= 0.3
    
    # 检查整体置信度
    if editorial_plan.overall_confidence < 0.4:
        issues.append(QualityIssue(
            issue_type="value",
            severity="major",
            description="整体置信度过低，可能对听众价值有限",
            suggestion="考虑是否值得制作这期内容，或等待更多信息",
        ))
        score -= 0.3
    
    return max(0.0, score), issues


def assess_language_quality(script: str) -> tuple[float, List[QualityIssue]]:
    """
    评估语言质量
    
    Args:
        script: 脚本文本
        
    Returns:
        (score, issues)
    """
    issues: List[QualityIssue] = []
    score = 1.0
    
    # 检查重复词（简化版）
    words = script.split()
    if len(words) > 50:
        word_freq: Dict[str, int] = {}
        for word in words:
            if len(word) >= 2:
                word_freq[word] = word_freq.get(word, 0) + 1
        
        # 找出高频词
        high_freq_words = [w for w, count in word_freq.items() if count > len(words) * 0.05]
        
        if high_freq_words:
            issues.append(QualityIssue(
                issue_type="language",
                severity="minor",
                description=f"存在高频重复词: {', '.join(high_freq_words[:3])}",
                suggestion="使用同义词替换，增加语言多样性",
            ))
            score -= 0.1
    
    # 检查句子长度（简化版）
    sentences = script.split("。")
    long_sentences = [s for s in sentences if len(s) > 100]
    
    if len(long_sentences) > len(sentences) * 0.3:
        issues.append(QualityIssue(
            issue_type="language",
            severity="minor",
            description="存在较多长句，可能影响理解",
            suggestion="将长句拆分为短句，提高可读性",
        ))
        score -= 0.1
    
    return max(0.0, score), issues


def assess_script_quality(
    script: str,
    editorial_plan: EditorialPlan,
    *,
    pass_threshold: float = 0.7,
    drop_threshold: float = 0.4,
) -> QualityAssessment:
    """
    评估脚本质量
    
    Args:
        script: 脚本文本
        editorial_plan: 编辑计划
        pass_threshold: 通过阈值
        drop_threshold: 丢弃阈值
        
    Returns:
        质量评估结果
    """
    logger = logging.getLogger("llm.quality_gate")
    logger.info("开始质量评估")
    
    # 各维度评估
    content_score, content_issues = assess_content_quality(script, editorial_plan)
    evidence_score, evidence_issues = assess_evidence_support(script, editorial_plan)
    value_score, value_issues = assess_audience_value(script, editorial_plan)
    language_score, language_issues = assess_language_quality(script)
    
    # 收集所有问题
    all_issues = content_issues + evidence_issues + value_issues + language_issues
    
    # 计算综合分数（加权）
    dimension_scores = {
        "content": content_score,
        "evidence": evidence_score,
        "value": value_score,
        "language": language_score,
    }
    
    weights = {
        "content": 0.3,
        "evidence": 0.4,  # 证据最重要
        "value": 0.2,
        "language": 0.1,
    }
    
    overall_score = sum(dimension_scores[dim] * weights[dim] for dim in dimension_scores)
    
    # 决策逻辑
    critical_issues = [i for i in all_issues if i.severity == "critical"]
    major_issues = [i for i in all_issues if i.severity == "major"]
    
    if critical_issues or overall_score < drop_threshold:
        decision = "drop"
        logger.warning(f"质量评估: DROP (分数={overall_score:.2f}, 严重问题={len(critical_issues)})")
    elif major_issues or overall_score < pass_threshold:
        decision = "revise"
        logger.info(f"质量评估: REVISE (分数={overall_score:.2f}, 主要问题={len(major_issues)})")
    else:
        decision = "pass"
        logger.info(f"质量评估: PASS (分数={overall_score:.2f})")
    
    # 生成修订建议
    revision_suggestions = []
    for issue in all_issues:
        if issue.suggestion and issue.severity in ("critical", "major"):
            revision_suggestions.append(issue.suggestion)
    
    # 识别优点
    strengths = []
    if content_score >= 0.8:
        strengths.append("内容结构完整，信息丰富")
    if evidence_score >= 0.8:
        strengths.append("证据支持充分，表述准确")
    if value_score >= 0.8:
        strengths.append("对听众有实用价值")
    if language_score >= 0.8:
        strengths.append("语言流畅，表达清晰")
    
    assessment = QualityAssessment(
        decision=decision,
        overall_score=overall_score,
        dimension_scores=dimension_scores,
        issues=all_issues,
        strengths=strengths,
        revision_suggestions=revision_suggestions,
        metadata={
            "critical_issues": len(critical_issues),
            "major_issues": len(major_issues),
            "minor_issues": len([i for i in all_issues if i.severity == "minor"]),
            "script_length": len(script),
        },
    )
    
    return assessment


__all__ = [
    "QualityIssue",
    "QualityAssessment",
    "assess_script_quality",
]
