"""
Research processing components
"""

from .claims import Claim, extract_claims_from_item, extract_claims_batch
from .claim_dedup import ClaimCluster, deduplicate_claims, merge_similar_clusters, select_top_claims
from .claim_normalize import normalize_claim_text, create_claim_fingerprint, normalize_claim, normalize_claims_batch
from .news_splitter import NewsTopic, NewsSplitter, split_news_for_research

__all__ = [
    "Claim",
    "extract_claims_from_item",
    "extract_claims_batch",
    "ClaimCluster",
    "deduplicate_claims",
    "merge_similar_clusters",
    "select_top_claims",
    "normalize_claim_text",
    "create_claim_fingerprint",
    "normalize_claim",
    "normalize_claims_batch",
    "NewsTopic",
    "NewsSplitter",
    "split_news_for_research",
]
