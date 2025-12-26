"""
Rewrite Module

根据质量评估结果对脚本进行修订和优化。

修订策略：
- 基于QualityIssue的建议进行针对性修改
- 保持原有结构和核心信息
- 优化语言表达和逻辑流畅度
- 确保符合证据支持要求

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional

from src.llm.quality_gate import QualityAssessment, QualityIssue
from src.llm.editorial import EditorialPlan


def apply_evidence_fixes(script: str, issues: List[QualityIssue]) -> str:
    """
    应用证据相关的修复
    
    Args:
        script: 原始脚本
        issues: 质量问题列表
        
    Returns:
        修复后的脚本
    """
    result = script
    
    # 处理证据相关问题
    evidence_issues = [i for i in issues if i.issue_type == "evidence"]
    
    for issue in evidence_issues:
        if "结论性语句" in issue.description:
            # 弱化结论性表述
            conclusive_patterns = [
                (r'一定会', '可能会'),
                (r'必然', '很可能'),
                (r'肯定', '应该'),
                (r'毫无疑问', '据了解'),
                (r'显而易见', '从现有信息看'),
            ]
            
            for pattern, replacement in conclusive_patterns:
                result = re.sub(pattern, replacement, result)
        
        if issue.suggestion and "限定词" in issue.suggestion:
            # 添加限定词
            # 在句子开头添加限定性表述
            sentences = result.split("。")
            modified_sentences = []
            
            for i, sentence in enumerate(sentences):
                if sentence.strip() and i > 0 and i < len(sentences) - 1:
                    # 随机在一些句子前添加限定词
                    if i % 3 == 0:
                        sentence = "据初步了解，" + sentence.strip()
                modified_sentences.append(sentence)
            
            result = "。".join(modified_sentences)
    
    return result


def apply_compliance_fixes(script: str, issues: List[QualityIssue], editorial_plan: EditorialPlan) -> str:
    """
    应用合规性修复
    
    Args:
        script: 原始脚本
        issues: 质量问题列表
        editorial_plan: 编辑计划
        
    Returns:
        修复后的脚本
    """
    result = script
    
    # 处理合规问题
    compliance_issues = [i for i in issues if i.issue_type == "compliance"]
    
    for issue in compliance_issues:
        if "免责声明" in issue.description and editorial_plan.disclaimer_text:
            # 添加免责声明
            # 在适当位置插入免责声明
            if "总之" in result or "综上" in result:
                # 在总结前插入
                result = re.sub(
                    r'(总之|综上)',
                    f'\n\n{editorial_plan.disclaimer_text}\n\n\\1',
                    result,
                    count=1
                )
            else:
                # 在末尾添加
                result = result.rstrip() + f"\n\n{editorial_plan.disclaimer_text}"
    
    return result


def apply_content_fixes(script: str, issues: List[QualityIssue]) -> str:
    """
    应用内容质量修复
    
    Args:
        script: 原始脚本
        issues: 质量问题列表
        
    Returns:
        修复后的脚本
    """
    result = script
    
    content_issues = [i for i in issues if i.issue_type == "content"]
    
    for issue in content_issues:
        if "过渡" in issue.description:
            # 添加过渡词
            # 在段落之间添加过渡句
            paragraphs = result.split("\n\n")
            if len(paragraphs) > 1:
                transition_words = ["此外", "另外", "同时", "然而", "因此"]
                modified_paragraphs = [paragraphs[0]]
                
                for i, para in enumerate(paragraphs[1:], 1):
                    if para.strip() and i < len(transition_words):
                        para = transition_words[i - 1] + "，" + para.strip()
                    modified_paragraphs.append(para)
                
                result = "\n\n".join(modified_paragraphs)
    
    return result


def apply_language_fixes(script: str, issues: List[QualityIssue]) -> str:
    """
    应用语言质量修复
    
    Args:
        script: 原始脚本
        issues: 质量问题列表
        
    Returns:
        修复后的脚本
    """
    result = script
    
    language_issues = [i for i in issues if i.issue_type == "language"]
    
    for issue in language_issues:
        if "重复词" in issue.description:
            # 简单的同义词替换（示例）
            synonyms = {
                "增长": ["提升", "上升", "增加"],
                "下降": ["降低", "减少", "下滑"],
                "重要": ["关键", "核心", "主要"],
                "影响": ["作用", "效果", "冲击"],
            }
            
            for word, alternatives in synonyms.items():
                # 简单替换：每3次出现替换一次
                count = result.count(word)
                if count > 3:
                    parts = result.split(word)
                    rebuilt = [parts[0]]
                    for i, part in enumerate(parts[1:], 1):
                        if i % 3 == 0 and alternatives:
                            rebuilt.append(alternatives[i % len(alternatives)])
                        else:
                            rebuilt.append(word)
                        rebuilt.append(part)
                    result = "".join(rebuilt)
        
        if "长句" in issue.description:
            # 拆分长句（简化版）
            sentences = result.split("。")
            modified_sentences = []
            
            for sentence in sentences:
                if len(sentence) > 100 and "，" in sentence:
                    # 在逗号处拆分
                    parts = sentence.split("，", 1)
                    modified_sentences.append(parts[0] + "。")
                    if len(parts) > 1:
                        modified_sentences.append(parts[1])
                else:
                    modified_sentences.append(sentence)
            
            result = "。".join(modified_sentences)
    
    return result


def rewrite_script(
    script: str,
    quality_assessment: QualityAssessment,
    editorial_plan: EditorialPlan,
) -> str:
    """
    根据质量评估重写脚本
    
    Args:
        script: 原始脚本
        quality_assessment: 质量评估结果
        editorial_plan: 编辑计划
        
    Returns:
        重写后的脚本
    """
    if quality_assessment.decision == "pass":
        # 已通过，不需要修改
        return script
    
    result = script
    issues = quality_assessment.issues
    
    # 按严重程度排序，优先处理严重问题
    critical_issues = [i for i in issues if i.severity == "critical"]
    major_issues = [i for i in issues if i.severity == "major"]
    minor_issues = [i for i in issues if i.severity == "minor"]
    
    # 依次应用修复
    # 1. 合规性修复（最重要）
    result = apply_compliance_fixes(result, critical_issues + major_issues, editorial_plan)
    
    # 2. 证据修复
    result = apply_evidence_fixes(result, critical_issues + major_issues)
    
    # 3. 内容修复
    result = apply_content_fixes(result, major_issues + minor_issues)
    
    # 4. 语言修复
    result = apply_language_fixes(result, minor_issues)
    
    return result


def iterative_rewrite(
    script: str,
    editorial_plan: EditorialPlan,
    *,
    max_iterations: int = 3,
    target_score: float = 0.7,
) -> tuple[str, QualityAssessment, int]:
    """
    迭代重写直到达到目标质量
    
    Args:
        script: 原始脚本
        editorial_plan: 编辑计划
        max_iterations: 最大迭代次数
        target_score: 目标分数
        
    Returns:
        (最终脚本, 最终评估, 迭代次数)
    """
    from src.llm.quality_gate import assess_script_quality
    
    current_script = script
    current_assessment = assess_script_quality(current_script, editorial_plan)
    iteration = 0
    
    while (current_assessment.overall_score < target_score and 
           current_assessment.decision != "pass" and 
           iteration < max_iterations):
        
        iteration += 1
        
        # 重写
        current_script = rewrite_script(current_script, current_assessment, editorial_plan)
        
        # 重新评估
        current_assessment = assess_script_quality(current_script, editorial_plan)
        
        # 如果分数没有提升，停止迭代
        if iteration > 1 and current_assessment.overall_score <= target_score:
            break
    
    return current_script, current_assessment, iteration


__all__ = [
    "rewrite_script",
    "iterative_rewrite",
    "apply_evidence_fixes",
    "apply_compliance_fixes",
    "apply_content_fixes",
    "apply_language_fixes",
]
