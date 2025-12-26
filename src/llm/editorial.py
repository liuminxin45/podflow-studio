"""
Editorial Planner Module

构建播客节目的编辑主线，确保内容有价值、有深度、值得听。

编辑框架（5W框架）：
- What: 发生了什么？核心事实
- So what: 为什么重要？意义何在
- Impact: 影响是什么？谁受影响
- Uncertainty: 不确定性在哪？争议点
- Takeaway: 听众应该知道什么？行动建议

强制规则：
- 无证据 → 不得输出结论性语句
- 证据矛盾 → 必须口播免责声明
- 证据不足 → 标注"待确认"

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from src.research.evidence import EvidencePack


@dataclass
class EditorialSection:
    """编辑章节"""
    section_type: str  # what / so_what / impact / uncertainty / takeaway
    title: str
    content: str
    evidence_support: str  # strong / moderate / weak / none / contradicted
    confidence: float  # 0.0-1.0
    sources: List[str] = field(default_factory=list)
    caveats: List[str] = field(default_factory=list)  # 免责声明/注意事项
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "section_type": self.section_type,
            "title": self.title,
            "content": self.content,
            "evidence_support": self.evidence_support,
            "confidence": self.confidence,
            "sources": self.sources,
            "caveats": self.caveats,
            "metadata": self.metadata,
        }


@dataclass
class EditorialPlan:
    """编辑计划"""
    story_title: str
    story_angle: str  # 报道角度
    target_audience: str  # 目标听众
    sections: List[EditorialSection] = field(default_factory=list)
    overall_confidence: float = 0.0
    evidence_quality: str = "unknown"  # strong / moderate / weak / insufficient
    requires_disclaimer: bool = False
    disclaimer_text: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "story_title": self.story_title,
            "story_angle": self.story_angle,
            "target_audience": self.target_audience,
            "sections": [s.to_dict() for s in self.sections],
            "overall_confidence": self.overall_confidence,
            "evidence_quality": self.evidence_quality,
            "requires_disclaimer": self.requires_disclaimer,
            "disclaimer_text": self.disclaimer_text,
            "metadata": self.metadata,
        }


def assess_evidence_quality(evidence_packs: List[EvidencePack]) -> tuple[str, float, bool]:
    """
    评估证据质量
    
    Args:
        evidence_packs: 证据包列表
        
    Returns:
        (quality_level, avg_confidence, has_contradiction)
    """
    if not evidence_packs:
        return "insufficient", 0.0, False
    
    # 统计各种判断
    verdicts = [pack.verdict for pack in evidence_packs]
    supported_count = sum(1 for v in verdicts if v == "supported")
    refuted_count = sum(1 for v in verdicts if v == "refuted")
    uncertain_count = sum(1 for v in verdicts if v == "uncertain")
    insufficient_count = sum(1 for v in verdicts if v == "insufficient")
    
    # 计算平均置信度
    confidences = [pack.confidence for pack in evidence_packs]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    
    # 检测矛盾
    has_contradiction = supported_count > 0 and refuted_count > 0
    
    # 判断质量等级
    total = len(evidence_packs)
    supported_ratio = supported_count / total if total > 0 else 0.0
    
    if has_contradiction:
        quality = "contradicted"
    elif insufficient_count >= total * 0.5:
        quality = "insufficient"
    elif supported_ratio >= 0.7 and avg_confidence >= 0.7:
        quality = "strong"
    elif supported_ratio >= 0.5 and avg_confidence >= 0.5:
        quality = "moderate"
    else:
        quality = "weak"
    
    return quality, avg_confidence, has_contradiction


def generate_disclaimer(evidence_quality: str, has_contradiction: bool) -> Optional[str]:
    """
    生成免责声明
    
    Args:
        evidence_quality: 证据质量等级
        has_contradiction: 是否有矛盾证据
        
    Returns:
        免责声明文本，如果不需要则返回None
    """
    if evidence_quality == "contradicted" or has_contradiction:
        return (
            "需要注意的是，关于这个话题，目前存在不同的说法和观点。"
            "我们呈现的信息基于现有公开资料，但可能不够全面。"
            "建议听众保持独立思考，参考多方信息来源。"
        )
    
    if evidence_quality == "insufficient":
        return (
            "关于这个话题，目前可获取的信息有限。"
            "我们的分析基于现有资料，但可能存在信息不完整的情况。"
            "请听众理性看待，等待更多信息披露。"
        )
    
    if evidence_quality == "weak":
        return (
            "需要说明的是，关于这个话题的部分信息尚未得到充分验证。"
            "我们会持续关注后续进展。"
        )
    
    return None


def create_what_section(
    evidence_packs: List[EvidencePack],
    *,
    max_facts: int = 5,
) -> EditorialSection:
    """
    创建What章节：核心事实
    
    Args:
        evidence_packs: 证据包列表
        max_facts: 最多包含的事实数量
        
    Returns:
        What章节
    """
    # 选择最有力的证据
    supported_packs = [p for p in evidence_packs if p.verdict == "supported"]
    supported_packs.sort(key=lambda x: x.confidence, reverse=True)
    
    top_packs = supported_packs[:max_facts]
    
    # 构建内容
    facts = []
    sources = []
    for pack in top_packs:
        claim_text = pack.claim.text
        facts.append(claim_text)
        
        # 收集来源
        for evidence in pack.main_evidence[:2]:  # 最多2个来源
            if evidence.source_title:
                sources.append(evidence.source_title)
    
    content = "。".join(facts) if facts else "暂无确认的核心事实。"
    
    # 评估支持度
    if len(top_packs) >= 3:
        support = "strong"
        confidence = sum(p.confidence for p in top_packs) / len(top_packs)
    elif len(top_packs) >= 1:
        support = "moderate"
        confidence = sum(p.confidence for p in top_packs) / len(top_packs)
    else:
        support = "weak"
        confidence = 0.3
    
    return EditorialSection(
        section_type="what",
        title="核心事实",
        content=content,
        evidence_support=support,
        confidence=confidence,
        sources=list(set(sources))[:5],
        metadata={"fact_count": len(facts)},
    )


def create_so_what_section(
    evidence_packs: List[EvidencePack],
    story_angle: str,
) -> EditorialSection:
    """
    创建So What章节：为什么重要
    
    Args:
        evidence_packs: 证据包列表
        story_angle: 报道角度
        
    Returns:
        So What章节
    """
    # 分析因果关系和预测性断言
    causal_packs = [p for p in evidence_packs if p.claim.claim_type == "causal"]
    predictive_packs = [p for p in evidence_packs if p.claim.claim_type == "predictive"]
    
    relevant_packs = causal_packs + predictive_packs
    relevant_packs.sort(key=lambda x: x.confidence, reverse=True)
    
    if not relevant_packs:
        content = f"从{story_angle}的角度来看，这个事件值得关注。"
        support = "weak"
        confidence = 0.4
    else:
        # 提取关键洞察
        insights = []
        for pack in relevant_packs[:3]:
            if pack.verdict == "supported":
                insights.append(pack.claim.text)
        
        content = "。".join(insights) if insights else f"这个事件与{story_angle}密切相关。"
        support = "moderate" if len(insights) >= 2 else "weak"
        confidence = sum(p.confidence for p in relevant_packs[:3]) / min(3, len(relevant_packs))
    
    return EditorialSection(
        section_type="so_what",
        title="为什么重要",
        content=content,
        evidence_support=support,
        confidence=confidence,
        metadata={"insight_count": len(relevant_packs)},
    )


def create_impact_section(
    evidence_packs: List[EvidencePack],
    target_audience: str,
) -> EditorialSection:
    """
    创建Impact章节：影响分析
    
    Args:
        evidence_packs: 证据包列表
        target_audience: 目标听众
        
    Returns:
        Impact章节
    """
    # 寻找影响相关的证据
    impact_keywords = ["影响", "导致", "造成", "带来", "改变", "提升", "下降"]
    impact_packs = [
        p for p in evidence_packs
        if any(kw in p.claim.text for kw in impact_keywords)
        and p.verdict == "supported"
    ]
    
    impact_packs.sort(key=lambda x: x.confidence, reverse=True)
    
    if not impact_packs:
        content = f"对于{target_audience}而言，这个事件的具体影响还有待观察。"
        support = "weak"
        confidence = 0.3
        caveats = ["影响尚不明确"]
    else:
        impacts = [p.claim.text for p in impact_packs[:3]]
        content = "。".join(impacts)
        support = "moderate" if len(impacts) >= 2 else "weak"
        confidence = sum(p.confidence for p in impact_packs[:3]) / len(impact_packs[:3])
        caveats = []
    
    return EditorialSection(
        section_type="impact",
        title="影响分析",
        content=content,
        evidence_support=support,
        confidence=confidence,
        caveats=caveats,
        metadata={"impact_count": len(impact_packs)},
    )


def create_uncertainty_section(
    evidence_packs: List[EvidencePack],
) -> EditorialSection:
    """
    创建Uncertainty章节：不确定性和争议
    
    Args:
        evidence_packs: 证据包列表
        
    Returns:
        Uncertainty章节
    """
    # 收集不确定和矛盾的证据
    uncertain_packs = [p for p in evidence_packs if p.verdict in ("uncertain", "refuted")]
    
    if not uncertain_packs:
        content = "目前关于这个话题的信息相对一致。"
        support = "none"
        confidence = 0.5
        caveats = []
    else:
        uncertainties = []
        for pack in uncertain_packs[:3]:
            if pack.verdict == "refuted":
                uncertainties.append(f"关于「{pack.claim.text}」存在反驳证据")
            else:
                uncertainties.append(f"关于「{pack.claim.text}」尚不确定")
        
        content = "。".join(uncertainties)
        support = "moderate"
        confidence = 0.6
        caveats = ["存在不同观点", "信息有待进一步确认"]
    
    return EditorialSection(
        section_type="uncertainty",
        title="不确定性",
        content=content,
        evidence_support=support,
        confidence=confidence,
        caveats=caveats,
        metadata={"uncertainty_count": len(uncertain_packs)},
    )


def create_takeaway_section(
    evidence_packs: List[EvidencePack],
    target_audience: str,
    overall_confidence: float,
) -> EditorialSection:
    """
    创建Takeaway章节：关键要点和建议
    
    Args:
        evidence_packs: 证据包列表
        target_audience: 目标听众
        overall_confidence: 整体置信度
        
    Returns:
        Takeaway章节
    """
    # 基于整体置信度给出建议
    if overall_confidence >= 0.7:
        content = f"对于{target_audience}来说，建议关注这个话题的后续发展，并根据自身情况做出相应调整。"
        support = "strong"
    elif overall_confidence >= 0.5:
        content = f"对于{target_audience}来说，这个话题值得关注，但建议保持理性判断，参考多方信息。"
        support = "moderate"
    else:
        content = f"对于{target_audience}来说，这个话题的信息还不够充分，建议持续关注，暂不急于做出判断。"
        support = "weak"
    
    # 添加行动建议
    action_items = []
    if overall_confidence >= 0.6:
        action_items.append("持续关注相关信息")
    action_items.append("保持独立思考")
    action_items.append("参考多方来源")
    
    return EditorialSection(
        section_type="takeaway",
        title="关键要点",
        content=content,
        evidence_support=support,
        confidence=overall_confidence,
        metadata={"action_items": action_items},
    )


def create_editorial_plan(
    story_title: str,
    story_angle: str,
    target_audience: str,
    evidence_packs: List[EvidencePack],
) -> EditorialPlan:
    """
    创建完整的编辑计划
    
    Args:
        story_title: 故事标题
        story_angle: 报道角度
        target_audience: 目标听众
        evidence_packs: 证据包列表
        
    Returns:
        编辑计划
    """
    logger = logging.getLogger("llm.editorial")
    logger.info(f"创建编辑计划: {story_title}")
    
    # 评估证据质量
    evidence_quality, avg_confidence, has_contradiction = assess_evidence_quality(evidence_packs)
    
    # 生成免责声明
    disclaimer = generate_disclaimer(evidence_quality, has_contradiction)
    requires_disclaimer = disclaimer is not None
    
    # 创建各个章节
    sections = []
    
    # What: 核心事实
    what_section = create_what_section(evidence_packs)
    sections.append(what_section)
    
    # So What: 为什么重要
    so_what_section = create_so_what_section(evidence_packs, story_angle)
    sections.append(so_what_section)
    
    # Impact: 影响分析
    impact_section = create_impact_section(evidence_packs, target_audience)
    sections.append(impact_section)
    
    # Uncertainty: 不确定性
    uncertainty_section = create_uncertainty_section(evidence_packs)
    sections.append(uncertainty_section)
    
    # Takeaway: 关键要点
    takeaway_section = create_takeaway_section(evidence_packs, target_audience, avg_confidence)
    sections.append(takeaway_section)
    
    # 创建编辑计划
    plan = EditorialPlan(
        story_title=story_title,
        story_angle=story_angle,
        target_audience=target_audience,
        sections=sections,
        overall_confidence=avg_confidence,
        evidence_quality=evidence_quality,
        requires_disclaimer=requires_disclaimer,
        disclaimer_text=disclaimer,
        metadata={
            "evidence_pack_count": len(evidence_packs),
            "has_contradiction": has_contradiction,
        },
    )
    
    logger.info(
        f"编辑计划创建完成: 质量={evidence_quality}, "
        f"置信度={avg_confidence:.2f}, "
        f"需要免责={requires_disclaimer}"
    )
    
    return plan


__all__ = [
    "EditorialSection",
    "EditorialPlan",
    "create_editorial_plan",
    "assess_evidence_quality",
    "generate_disclaimer",
]
