"""
Core topic selection components
"""

from .models import (
    TopicArchetype,
    SignalScores,
    ProxySignals,
    TopicCandidate,
    TopicDecision,
    TopicScoreBreakdown,
    ItemSignalTagging,
)
from .pipeline import AutoTopicPipeline, AutoTopicPipelineConfig

__all__ = [
    "TopicArchetype",
    "SignalScores",
    "ProxySignals",
    "TopicCandidate",
    "TopicDecision",
    "TopicScoreBreakdown",
    "ItemSignalTagging",
    "AutoTopicPipeline",
    "AutoTopicPipelineConfig",
]
