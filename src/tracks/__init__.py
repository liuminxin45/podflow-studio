"""
Tracks Module

赛道模块：支持不同内容赛道的可插拔架构
"""

from src.tracks.base import Track, TrackRegistry
from src.tracks.life_consumer.track import LifeConsumerTrack
from src.tracks.ai_apps.track import AIAppsTrack
from src.tracks.headline.track import HeadlineTrack

# 注册所有 Track
TrackRegistry.register("life_consumer", LifeConsumerTrack)
TrackRegistry.register("ai_apps", AIAppsTrack)
TrackRegistry.register("headline", HeadlineTrack)

__all__ = [
    "Track",
    "TrackRegistry",
    "LifeConsumerTrack",
    "AIAppsTrack",
    "HeadlineTrack",
]
