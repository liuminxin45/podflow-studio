"""
Evidence Pack Assembly Module

组装证据包：将调查结果与断言关联，评估证据质量。

证据包结构：
- 断言信息
- 主查询结果
- 对照查询结果
- 证据评分（相关性、可信度、时效性）
- 综合判断（支持/反驳/不确定）

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from src.research.claims import Claim
from src.research.query_builder import ResearchQuery


@dataclass
class Evidence:
    """单条证据"""
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    content: str = ""
    relevance_score: float = 0.0  # 相关性评分 0.0-1.0
    credibility_score: float = 0.0  # 可信度评分 0.0-1.0
    timeliness_score: float = 0.0  # 时效性评分 0.0-1.0
    published_at: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def overall_score(self) -> float:
        """综合评分"""
        return (self.relevance_score * 0.5 + 
                self.credibility_score * 0.3 + 
                self.timeliness_score * 0.2)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_url": self.source_url,
            "source_title": self.source_title,
            "content": self.content[:500],  # 截断长内容
            "relevance_score": self.relevance_score,
            "credibility_score": self.credibility_score,
            "timeliness_score": self.timeliness_score,
            "overall_score": self.overall_score(),
            "published_at": self.published_at,
            "metadata": self.metadata,
        }


@dataclass
class EvidencePack:
    """证据包"""
    claim: Claim
    main_query: ResearchQuery
    main_evidence: List[Evidence] = field(default_factory=list)
    contrast_query: Optional[ResearchQuery] = None
    contrast_evidence: List[Evidence] = field(default_factory=list)
    verdict: str = "uncertain"  # supported / refuted / uncertain / insufficient
    confidence: float = 0.0  # 判断置信度 0.0-1.0
    summary: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "claim": self.claim.to_dict(),
            "main_query": self.main_query.to_dict(),
            "main_evidence_count": len(self.main_evidence),
            "main_evidence": [e.to_dict() for e in self.main_evidence[:5]],  # 最多5条
            "contrast_query": self.contrast_query.to_dict() if self.contrast_query else None,
            "contrast_evidence_count": len(self.contrast_evidence),
            "contrast_evidence": [e.to_dict() for e in self.contrast_evidence[:3]],  # 最多3条
            "verdict": self.verdict,
            "confidence": self.confidence,
            "summary": self.summary,
            "metadata": self.metadata,
        }


def parse_metaso_result(result: Dict[str, Any]) -> List[Evidence]:
    """
    解析MetaSo调查结果为证据列表
    
    Args:
        result: MetaSo返回的结果字典
        
    Returns:
        证据列表
    """
    evidence_list: List[Evidence] = []
    
    # 提取引用
    citations = result.get("citations", [])
    if not citations:
        # 如果没有引用，尝试从content提取
        content = result.get("content", "")
        if content:
            evidence = Evidence(
                content=content,
                relevance_score=0.7,
                credibility_score=0.6,
                timeliness_score=0.5,
                metadata={"source": "metaso_content"},
            )
            evidence_list.append(evidence)
        return evidence_list
    
    # 解析每条引用
    for citation in citations:
        if not isinstance(citation, dict):
            continue
        
        url = citation.get("url") or citation.get("link")
        title = citation.get("title") or citation.get("name")
        snippet = citation.get("snippet") or citation.get("content") or citation.get("text", "")
        
        # 评分（简化版）
        relevance = float(citation.get("relevance", 0.7))
        credibility = float(citation.get("credibility", 0.6))
        
        # 时效性评分
        published_at = citation.get("published_at") or citation.get("date")
        timeliness = _calculate_timeliness(published_at)
        
        evidence = Evidence(
            source_url=url,
            source_title=title,
            content=snippet,
            relevance_score=relevance,
            credibility_score=credibility,
            timeliness_score=timeliness,
            published_at=published_at,
            metadata={"citation": citation},
        )
        evidence_list.append(evidence)
    
    return evidence_list


def _calculate_timeliness(published_at: Optional[str], max_age_days: int = 30) -> float:
    """
    计算时效性评分
    
    Args:
        published_at: 发布时间字符串
        max_age_days: 最大天数
        
    Returns:
        时效性评分 0.0-1.0
    """
    if not published_at:
        return 0.5  # 未知时间，中等评分
    
    try:
        # 尝试解析时间
        if "T" in published_at:
            pub_time = dt.datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        else:
            pub_time = dt.datetime.strptime(published_at[:10], "%Y-%m-%d")
        
        now = dt.datetime.now(dt.timezone.utc)
        age_days = (now - pub_time.replace(tzinfo=dt.timezone.utc)).days
        
        if age_days < 0:
            return 1.0  # 未来时间（可能是错误），给高分
        elif age_days <= 7:
            return 1.0
        elif age_days <= max_age_days:
            return 1.0 - (age_days - 7) / (max_age_days - 7) * 0.5
        else:
            return max(0.0, 0.5 - (age_days - max_age_days) / max_age_days * 0.5)
    
    except (ValueError, AttributeError):
        return 0.5


def assess_evidence_pack(pack: EvidencePack) -> None:
    """
    评估证据包，更新verdict和confidence
    
    Args:
        pack: 证据包（会被原地修改）
    """
    # 计算主证据平均分
    main_scores = [e.overall_score() for e in pack.main_evidence]
    avg_main_score = sum(main_scores) / len(main_scores) if main_scores else 0.0
    
    # 计算对照证据平均分
    contrast_scores = [e.overall_score() for e in pack.contrast_evidence]
    avg_contrast_score = sum(contrast_scores) / len(contrast_scores) if contrast_scores else 0.0
    
    # 判断逻辑
    if not pack.main_evidence:
        pack.verdict = "insufficient"
        pack.confidence = 0.0
        pack.summary = "未找到足够证据"
        return
    
    # 主证据强，对照证据弱 -> 支持
    if avg_main_score >= 0.7 and (not pack.contrast_evidence or avg_contrast_score < 0.5):
        pack.verdict = "supported"
        pack.confidence = min(0.9, avg_main_score)
        pack.summary = f"找到 {len(pack.main_evidence)} 条支持证据，平均评分 {avg_main_score:.2f}"
    
    # 对照证据强，主证据弱 -> 反驳
    elif pack.contrast_evidence and avg_contrast_score >= 0.7 and avg_main_score < 0.5:
        pack.verdict = "refuted"
        pack.confidence = min(0.9, avg_contrast_score)
        pack.summary = f"找到 {len(pack.contrast_evidence)} 条反驳证据，平均评分 {avg_contrast_score:.2f}"
    
    # 主证据中等 -> 不确定
    elif 0.5 <= avg_main_score < 0.7:
        pack.verdict = "uncertain"
        pack.confidence = 0.5
        pack.summary = f"证据不足以明确判断，主证据评分 {avg_main_score:.2f}"
    
    # 主证据弱 -> 证据不足
    else:
        pack.verdict = "insufficient"
        pack.confidence = 0.3
        pack.summary = f"证据质量较低，主证据评分 {avg_main_score:.2f}"
    
    # 记录元数据
    pack.metadata.update({
        "main_evidence_count": len(pack.main_evidence),
        "contrast_evidence_count": len(pack.contrast_evidence),
        "avg_main_score": avg_main_score,
        "avg_contrast_score": avg_contrast_score,
    })


def create_evidence_pack(
    claim: Claim,
    main_query: ResearchQuery,
    main_result: Dict[str, Any],
    contrast_query: Optional[ResearchQuery] = None,
    contrast_result: Optional[Dict[str, Any]] = None,
) -> EvidencePack:
    """
    创建证据包
    
    Args:
        claim: 断言
        main_query: 主查询
        main_result: 主查询结果
        contrast_query: 对照查询（可选）
        contrast_result: 对照查询结果（可选）
        
    Returns:
        证据包
    """
    # 解析主证据
    main_evidence = parse_metaso_result(main_result)
    
    # 解析对照证据
    contrast_evidence: List[Evidence] = []
    if contrast_result:
        contrast_evidence = parse_metaso_result(contrast_result)
    
    # 创建证据包
    pack = EvidencePack(
        claim=claim,
        main_query=main_query,
        main_evidence=main_evidence,
        contrast_query=contrast_query,
        contrast_evidence=contrast_evidence,
    )
    
    # 评估证据包
    assess_evidence_pack(pack)
    
    return pack


def create_evidence_packs_batch(
    claims: List[Claim],
    queries: List[ResearchQuery],
    results: Dict[str, Dict[str, Any]],
) -> List[EvidencePack]:
    """
    批量创建证据包
    
    Args:
        claims: 断言列表
        queries: 查询列表
        results: 查询结果字典 {claim_id: result}
        
    Returns:
        证据包列表
    """
    packs: List[EvidencePack] = []
    
    # 按claim_id分组查询
    queries_by_claim: Dict[str, List[ResearchQuery]] = {}
    for query in queries:
        claim_id = query.claim_id
        if claim_id not in queries_by_claim:
            queries_by_claim[claim_id] = []
        queries_by_claim[claim_id].append(query)
    
    # 为每个断言创建证据包
    for claim in claims:
        claim_id = f"{claim.source_item_id}:{claim.text[:50]}"
        claim_queries = queries_by_claim.get(claim_id, [])
        
        if not claim_queries:
            continue
        
        # 找到主查询和对照查询
        main_query = next((q for q in claim_queries if q.query_type == "main"), None)
        contrast_query = next((q for q in claim_queries if q.query_type == "contrast"), None)
        
        if not main_query:
            continue
        
        # 获取结果
        main_result = results.get(claim_id, {})
        contrast_result = results.get(f"{claim_id}:contrast") if contrast_query else None
        
        # 创建证据包
        pack = create_evidence_pack(
            claim=claim,
            main_query=main_query,
            main_result=main_result,
            contrast_query=contrast_query,
            contrast_result=contrast_result,
        )
        packs.append(pack)
    
    return packs


__all__ = [
    "Evidence",
    "EvidencePack",
    "create_evidence_pack",
    "create_evidence_packs_batch",
    "assess_evidence_pack",
]
