"""
Topic selection processing components
"""

from .signal_tagging import ItemSignalTagger
from .topic_mining import TopicMiner
from .proxy_signals import ProxySignalComputer
from .topic_scoring import TopicScorer, TopicScorerConfig
from .topic_gate import TopicGate

__all__ = [
    "ItemSignalTagger",
    "TopicMiner",
    "ProxySignalComputer",
    "TopicScorer",
    "TopicScorerConfig",
    "TopicGate",
]
