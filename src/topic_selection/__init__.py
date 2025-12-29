"""
Topic Selection Module

自动选题模块：从大量RSS items中自动产出当天应播的主题
"""

from src.topic_selection.models import (
    TopicArchetype,
    SignalScores,
    ProxySignals,
    TopicCandidate,
    TopicDecision,
    TopicScoreBreakdown,
)
from src.topic_selection.signal_tagging import ItemSignalTagger
from src.topic_selection.topic_mining import TopicMiner
from src.topic_selection.proxy_signals import ProxySignalComputer
from src.topic_selection.topic_scoring import TopicScorer, TopicScorerConfig
from src.topic_selection.topic_gate import TopicGate
from src.topic_selection.pipeline import AutoTopicPipeline, AutoTopicPipelineConfig

__all__ = [
    "TopicArchetype",
    "SignalScores",
    "ProxySignals",
    "TopicCandidate",
    "TopicDecision",
    "TopicScoreBreakdown",
    "ItemSignalTagger",
    "TopicMiner",
    "ProxySignalComputer",
    "TopicScorer",
    "TopicScorerConfig",
    "TopicGate",
    "AutoTopicPipeline",
    "AutoTopicPipelineConfig",
]
