"""
Claim Deduplication Module

跨新闻合并相似断言，避免重复调查。

去重策略：
- 指纹匹配：完全相同的规范化文本
- 文本相似度：编辑距离、Jaccard相似度
- 语义相似度：关键词重叠（可选：embedding相似度）

合并策略：
- 保留最高置信度的断言
- 聚合来源信息
- 记录合并历史

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Set, Tuple

from src.research.claims import Claim
from src.research.claim_normalize import (
    create_claim_fingerprint,
    normalize_claim_text,
    extract_key_terms,
)


@dataclass
class ClaimCluster:
    """断言簇（去重后的断言组）"""
    representative: Claim  # 代表性断言（最高置信度）
    members: List[Claim] = field(default_factory=list)  # 所有成员
    fingerprint: str = ""
    normalized_text: str = ""
    source_item_ids: Set[str] = field(default_factory=set)
    avg_confidence: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "representative": self.representative.to_dict(),
            "member_count": len(self.members),
            "fingerprint": self.fingerprint,
            "normalized_text": self.normalized_text,
            "source_item_ids": list(self.source_item_ids),
            "avg_confidence": self.avg_confidence,
            "claim_types": list(set(m.claim_type for m in self.members)),
        }


def _calculate_jaccard_similarity(text1: str, text2: str) -> float:
    """计算两个文本的Jaccard相似度"""
    # 对中文按字符分割，对英文按空格分割
    def tokenize(text: str) -> set:
        # 如果主要是中文，按字符分割
        if any('\u4e00' <= c <= '\u9fff' for c in text):
            return set(c for c in text if c.strip())
        # 否则按空格分割
        return set(text.lower().split())
    
    words1 = tokenize(text1)
    words2 = tokenize(text2)
    
    if not words1 or not words2:
        return 0.0
    
    intersection = len(words1 & words2)
    union = len(words1 | words2)
    
    return intersection / union if union > 0 else 0.0


def _calculate_edit_distance(s1: str, s2: str) -> int:
    """计算编辑距离（Levenshtein距离）"""
    if len(s1) > len(s2):
        s1, s2 = s2, s1
    
    distances = range(len(s1) + 1)
    for i2, c2 in enumerate(s2):
        new_distances = [i2 + 1]
        for i1, c1 in enumerate(s1):
            if c1 == c2:
                new_distances.append(distances[i1])
            else:
                new_distances.append(1 + min(distances[i1], distances[i1 + 1], new_distances[-1]))
        distances = new_distances
    
    return distances[-1]


def _are_claims_similar(
    claim1: Claim,
    claim2: Claim,
    *,
    jaccard_threshold: float = 0.6,
    edit_distance_threshold: int = 20,
) -> bool:
    """
    判断两个断言是否相似
    
    Args:
        claim1: 第一个断言
        claim2: 第二个断言
        jaccard_threshold: Jaccard相似度阈值
        edit_distance_threshold: 编辑距离阈值
        
    Returns:
        是否相似
    """
    # 类型必须相同
    if claim1.claim_type != claim2.claim_type:
        return False
    
    # 规范化文本
    text1 = normalize_claim_text(claim1.text)
    text2 = normalize_claim_text(claim2.text)
    
    # 完全相同
    if text1 == text2:
        return True
    
    # 长度差异过大
    len_ratio = min(len(text1), len(text2)) / max(len(text1), len(text2))
    if len_ratio < 0.5:
        return False
    
    # Jaccard相似度
    jaccard = _calculate_jaccard_similarity(text1, text2)
    if jaccard >= jaccard_threshold:
        return True
    
    # 编辑距离（仅对较短文本）
    if len(text1) < 200 and len(text2) < 200:
        edit_dist = _calculate_edit_distance(text1, text2)
        max_len = max(len(text1), len(text2))
        if edit_dist <= edit_distance_threshold or edit_dist / max_len < 0.3:
            return True
    
    return False


def deduplicate_claims(
    claims: List[Claim],
    *,
    jaccard_threshold: float = 0.6,
    edit_distance_threshold: int = 20,
) -> List[ClaimCluster]:
    """
    对断言进行去重，返回断言簇列表
    
    Args:
        claims: 断言列表
        jaccard_threshold: Jaccard相似度阈值
        edit_distance_threshold: 编辑距离阈值
        
    Returns:
        断言簇列表
    """
    if not claims:
        return []
    
    # 按指纹分组（快速去重）
    fingerprint_groups: Dict[str, List[Claim]] = defaultdict(list)
    for claim in claims:
        fp = create_claim_fingerprint(claim)
        fingerprint_groups[fp].append(claim)
    
    # 对每个指纹组进行进一步去重
    clusters: List[ClaimCluster] = []
    
    for fp, group_claims in fingerprint_groups.items():
        # 按置信度排序
        group_claims.sort(key=lambda x: x.confidence, reverse=True)
        
        # 如果指纹相同，直接合并
        if len(group_claims) == 1:
            representative = group_claims[0]
            cluster = ClaimCluster(
                representative=representative,
                members=group_claims,
                fingerprint=fp,
                normalized_text=normalize_claim_text(representative.text),
                source_item_ids={representative.source_item_id},
                avg_confidence=representative.confidence,
            )
            clusters.append(cluster)
        else:
            # 多个断言有相同指纹，选择最高置信度的作为代表
            representative = group_claims[0]
            source_ids = {c.source_item_id for c in group_claims}
            avg_conf = sum(c.confidence for c in group_claims) / len(group_claims)
            
            cluster = ClaimCluster(
                representative=representative,
                members=group_claims,
                fingerprint=fp,
                normalized_text=normalize_claim_text(representative.text),
                source_item_ids=source_ids,
                avg_confidence=avg_conf,
            )
            clusters.append(cluster)
    
    # 跨指纹的相似度合并（可选，较慢）
    # 这里暂时跳过，因为指纹已经做了较好的规范化
    
    return clusters


def merge_similar_clusters(
    clusters: List[ClaimCluster],
    *,
    jaccard_threshold: float = 0.7,
) -> List[ClaimCluster]:
    """
    合并相似的断言簇（可选的二次去重）
    
    Args:
        clusters: 断言簇列表
        jaccard_threshold: Jaccard相似度阈值
        
    Returns:
        合并后的断言簇列表
    """
    if len(clusters) <= 1:
        return clusters
    
    merged: List[ClaimCluster] = []
    used: Set[int] = set()
    
    for i, cluster1 in enumerate(clusters):
        if i in used:
            continue
        
        # 收集与cluster1相似的簇
        similar_indices = [i]
        for j in range(i + 1, len(clusters)):
            if j in used:
                continue
            
            cluster2 = clusters[j]
            
            # 检查代表性断言是否相似
            if _are_claims_similar(
                cluster1.representative,
                cluster2.representative,
                jaccard_threshold=jaccard_threshold,
            ):
                similar_indices.append(j)
                used.add(j)
        
        # 合并相似簇
        if len(similar_indices) == 1:
            merged.append(cluster1)
        else:
            all_members: List[Claim] = []
            all_source_ids: Set[str] = set()
            
            for idx in similar_indices:
                cluster = clusters[idx]
                all_members.extend(cluster.members)
                all_source_ids.update(cluster.source_item_ids)
            
            # 选择最高置信度的作为代表
            all_members.sort(key=lambda x: x.confidence, reverse=True)
            representative = all_members[0]
            avg_conf = sum(c.confidence for c in all_members) / len(all_members)
            
            merged_cluster = ClaimCluster(
                representative=representative,
                members=all_members,
                fingerprint=create_claim_fingerprint(representative),
                normalized_text=normalize_claim_text(representative.text),
                source_item_ids=all_source_ids,
                avg_confidence=avg_conf,
            )
            merged.append(merged_cluster)
        
        used.add(i)
    
    return merged


def select_top_claims(
    clusters: List[ClaimCluster],
    *,
    max_claims: int = 20,
    min_confidence: float = 0.6,
    prefer_multi_source: bool = True,
) -> List[ClaimCluster]:
    """
    选择Top-N断言簇
    
    Args:
        clusters: 断言簇列表
        max_claims: 最多选择的断言数
        min_confidence: 最低置信度阈值
        prefer_multi_source: 是否优先选择多来源断言
        
    Returns:
        选中的断言簇列表
    """
    # 过滤低置信度
    filtered = [c for c in clusters if c.avg_confidence >= min_confidence]
    
    # 计算排序分数
    def score_cluster(cluster: ClaimCluster) -> float:
        score = cluster.avg_confidence
        
        # 多来源加分
        if prefer_multi_source:
            source_bonus = min(0.2, len(cluster.source_item_ids) * 0.05)
            score += source_bonus
        
        # 成员数量加分（表示重要性）
        member_bonus = min(0.1, len(cluster.members) * 0.02)
        score += member_bonus
        
        return score
    
    # 排序并选择Top-N
    filtered.sort(key=score_cluster, reverse=True)
    
    return filtered[:max_claims]


__all__ = [
    "ClaimCluster",
    "deduplicate_claims",
    "merge_similar_clusters",
    "select_top_claims",
]
