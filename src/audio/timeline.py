"""
Audio Timeline Module

管理音频段落的时间轴，用于章节标记和字幕同步。

功能：
- 记录每个音频片段的时间戳
- 生成章节标记
- 支持字幕时间轴
- 导出时间轴数据

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class TimelineSegment:
    """时间轴片段"""
    segment_id: str
    start_time: float  # 秒
    end_time: float  # 秒
    text: str
    segment_type: str = "voice"  # voice / bgm / silence / chapter_marker
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def duration(self) -> float:
        """片段时长（秒）"""
        return self.end_time - self.start_time
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "segment_id": self.segment_id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration": self.duration(),
            "text": self.text,
            "segment_type": self.segment_type,
            "metadata": self.metadata,
        }


@dataclass
class ChapterMarker:
    """章节标记"""
    title: str
    start_time: float  # 秒
    end_time: Optional[float] = None  # 秒
    description: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "description": self.description,
            "metadata": self.metadata,
        }


@dataclass
class AudioTimeline:
    """音频时间轴"""
    segments: List[TimelineSegment] = field(default_factory=list)
    chapters: List[ChapterMarker] = field(default_factory=list)
    total_duration: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def add_segment(self, segment: TimelineSegment) -> None:
        """添加片段"""
        self.segments.append(segment)
        # 更新总时长
        if segment.end_time > self.total_duration:
            self.total_duration = segment.end_time
    
    def add_chapter(self, chapter: ChapterMarker) -> None:
        """添加章节"""
        self.chapters.append(chapter)
    
    def get_segment_at_time(self, time: float) -> Optional[TimelineSegment]:
        """获取指定时间的片段"""
        for segment in self.segments:
            if segment.start_time <= time < segment.end_time:
                return segment
        return None
    
    def get_chapter_at_time(self, time: float) -> Optional[ChapterMarker]:
        """获取指定时间的章节"""
        for chapter in self.chapters:
            if chapter.start_time <= time:
                if chapter.end_time is None or time < chapter.end_time:
                    return chapter
        return None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "segments": [s.to_dict() for s in self.segments],
            "chapters": [c.to_dict() for c in self.chapters],
            "total_duration": self.total_duration,
            "segment_count": len(self.segments),
            "chapter_count": len(self.chapters),
            "metadata": self.metadata,
        }


def create_timeline_from_segments(
    text_segments: List[Dict[str, Any]],
    audio_durations: List[float],
    *,
    intro_duration: float = 0.0,
) -> AudioTimeline:
    """
    从文本片段和音频时长创建时间轴
    
    Args:
        text_segments: 文本片段列表（包含text和metadata）
        audio_durations: 对应的音频时长列表（秒）
        intro_duration: 开场时长（秒）
        
    Returns:
        音频时间轴
    """
    timeline = AudioTimeline()
    current_time = intro_duration
    
    # 添加intro标记（如果有）
    if intro_duration > 0:
        timeline.add_segment(TimelineSegment(
            segment_id="intro",
            start_time=0.0,
            end_time=intro_duration,
            text="[开场音乐]",
            segment_type="bgm",
        ))
    
    # 添加主要内容片段
    for i, (text_seg, duration) in enumerate(zip(text_segments, audio_durations)):
        segment = TimelineSegment(
            segment_id=f"seg_{i}",
            start_time=current_time,
            end_time=current_time + duration,
            text=text_seg.get("text", ""),
            segment_type="voice",
            metadata=text_seg.get("metadata", {}),
        )
        timeline.add_segment(segment)
        current_time += duration
    
    return timeline


def add_chapters_to_timeline(
    timeline: AudioTimeline,
    editorial_chapters: List[Dict[str, Any]],
) -> None:
    """
    将编辑章节添加到时间轴
    
    Args:
        timeline: 音频时间轴
        editorial_chapters: 编辑章节列表（来自editorial plan）
    """
    for chapter_data in editorial_chapters:
        start_time = chapter_data.get("start_time", 0.0)
        end_time = chapter_data.get("end_time")
        
        chapter = ChapterMarker(
            title=chapter_data.get("title", "未命名章节"),
            start_time=start_time,
            end_time=end_time,
            description=chapter_data.get("summary", ""),
            metadata={
                "section_type": chapter_data.get("section_type"),
                "confidence": chapter_data.get("confidence"),
            },
        )
        timeline.add_chapter(chapter)


def export_chapters_json(
    timeline: AudioTimeline,
    *,
    podcast_title: str = "Untitled Podcast",
    author: str = "Auto-Podcast",
) -> Dict[str, Any]:
    """
    导出章节信息为JSON格式（播客平台标准）
    
    Args:
        timeline: 音频时间轴
        podcast_title: 播客标题
        author: 作者
        
    Returns:
        章节JSON数据
    """
    return {
        "version": "1.2.0",
        "title": podcast_title,
        "author": author,
        "chapters": [
            {
                "startTime": chapter.start_time,
                "title": chapter.title,
                "img": None,
                "url": None,
                "toc": True,
                "endTime": chapter.end_time,
            }
            for chapter in timeline.chapters
        ],
    }


def format_timestamp(seconds: float, include_hours: bool = True) -> str:
    """
    格式化时间戳
    
    Args:
        seconds: 秒数
        include_hours: 是否包含小时
        
    Returns:
        格式化的时间戳（HH:MM:SS.mmm 或 MM:SS.mmm）
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    
    if include_hours or hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"
    else:
        return f"{minutes:02d}:{secs:06.3f}"


def export_timeline_text(timeline: AudioTimeline) -> str:
    """
    导出时间轴为文本格式（便于查看）
    
    Args:
        timeline: 音频时间轴
        
    Returns:
        格式化的文本
    """
    lines = []
    lines.append("# 音频时间轴\n")
    lines.append(f"总时长: {format_timestamp(timeline.total_duration)}\n")
    lines.append(f"片段数: {len(timeline.segments)}")
    lines.append(f"章节数: {len(timeline.chapters)}\n")
    
    if timeline.chapters:
        lines.append("## 章节列表\n")
        for i, chapter in enumerate(timeline.chapters, 1):
            timestamp = format_timestamp(chapter.start_time, include_hours=False)
            lines.append(f"{i}. [{timestamp}] {chapter.title}")
            if chapter.description:
                lines.append(f"   {chapter.description}\n")
    
    if timeline.segments:
        lines.append("\n## 片段列表\n")
        for segment in timeline.segments[:10]:  # 只显示前10个
            timestamp = format_timestamp(segment.start_time, include_hours=False)
            duration = segment.duration()
            text_preview = segment.text[:50] + "..." if len(segment.text) > 50 else segment.text
            lines.append(f"[{timestamp}] ({duration:.1f}s) {text_preview}")
        
        if len(timeline.segments) > 10:
            lines.append(f"\n... 还有 {len(timeline.segments) - 10} 个片段")
    
    return "\n".join(lines)


__all__ = [
    "TimelineSegment",
    "ChapterMarker",
    "AudioTimeline",
    "create_timeline_from_segments",
    "add_chapters_to_timeline",
    "export_chapters_json",
    "format_timestamp",
]
