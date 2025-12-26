"""
Subtitles Generator Module

生成播客字幕文件（VTT/SRT格式）。

功能：
- 基于时间轴生成字幕
- 支持WebVTT (.vtt) 格式
- 支持SubRip (.srt) 格式
- 自动分行和时长控制

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from src.audio.timeline import AudioTimeline, TimelineSegment, format_timestamp


@dataclass
class SubtitleEntry:
    """字幕条目"""
    index: int
    start_time: float  # 秒
    end_time: float  # 秒
    text: str
    
    def to_srt(self) -> str:
        """转换为SRT格式"""
        # SRT时间格式: HH:MM:SS,mmm
        start = format_timestamp(self.start_time).replace('.', ',')
        end = format_timestamp(self.end_time).replace('.', ',')
        
        return f"{self.index}\n{start} --> {end}\n{self.text}\n"
    
    def to_vtt(self) -> str:
        """转换为VTT格式"""
        # VTT时间格式: HH:MM:SS.mmm
        start = format_timestamp(self.start_time)
        end = format_timestamp(self.end_time)
        
        return f"{start} --> {end}\n{self.text}\n"


def split_text_for_subtitle(
    text: str,
    max_chars_per_line: int = 42,
    max_lines: int = 2,
) -> List[str]:
    """
    分割文本为适合字幕显示的行
    
    Args:
        text: 原始文本
        max_chars_per_line: 每行最大字符数
        max_lines: 最大行数
        
    Returns:
        分割后的行列表
    """
    if len(text) <= max_chars_per_line:
        return [text]
    
    lines = []
    current_line = ""
    
    # 按标点或空格分割
    words = text.replace('，', '， ').replace('。', '。 ').split()
    
    for word in words:
        word = word.strip()
        if not word:
            continue
        
        # 检查是否需要换行
        test_line = current_line + word
        if len(test_line) <= max_chars_per_line:
            current_line = test_line
        else:
            # 保存当前行，开始新行
            if current_line:
                lines.append(current_line.strip())
            current_line = word
            
            # 检查行数限制
            if len(lines) >= max_lines:
                break
    
    # 添加最后一行
    if current_line and len(lines) < max_lines:
        lines.append(current_line.strip())
    
    return lines


def create_subtitle_entries(
    timeline: AudioTimeline,
    *,
    max_chars_per_line: int = 42,
    max_lines: int = 2,
    min_duration: float = 1.0,
    max_duration: float = 7.0,
) -> List[SubtitleEntry]:
    """
    从时间轴创建字幕条目
    
    Args:
        timeline: 音频时间轴
        max_chars_per_line: 每行最大字符数
        max_lines: 最大行数
        min_duration: 最小显示时长（秒）
        max_duration: 最大显示时长（秒）
        
    Returns:
        字幕条目列表
    """
    entries: List[SubtitleEntry] = []
    index = 1
    
    # 只处理voice类型的片段
    voice_segments = [s for s in timeline.segments if s.segment_type == "voice"]
    
    for segment in voice_segments:
        text = segment.text.strip()
        if not text or text.startswith('['):  # 跳过标记文本
            continue
        
        # 分割文本
        lines = split_text_for_subtitle(text, max_chars_per_line, max_lines)
        subtitle_text = '\n'.join(lines)
        
        # 计算时长
        duration = segment.duration()
        
        # 调整时长
        if duration < min_duration:
            # 延长显示时间
            end_time = segment.start_time + min_duration
        elif duration > max_duration:
            # 缩短显示时间
            end_time = segment.start_time + max_duration
        else:
            end_time = segment.end_time
        
        entry = SubtitleEntry(
            index=index,
            start_time=segment.start_time,
            end_time=end_time,
            text=subtitle_text,
        )
        entries.append(entry)
        index += 1
    
    return entries


def export_srt(
    entries: List[SubtitleEntry],
    output_path: Path,
) -> Path:
    """
    导出SRT格式字幕
    
    Args:
        entries: 字幕条目列表
        output_path: 输出路径
        
    Returns:
        输出文件路径
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    lines = []
    for entry in entries:
        lines.append(entry.to_srt())
    
    content = '\n'.join(lines)
    output_path.write_text(content, encoding='utf-8')
    
    return output_path


def export_vtt(
    entries: List[SubtitleEntry],
    output_path: Path,
    *,
    title: Optional[str] = None,
    language: str = "zh-CN",
) -> Path:
    """
    导出WebVTT格式字幕
    
    Args:
        entries: 字幕条目列表
        output_path: 输出路径
        title: 字幕标题
        language: 语言代码
        
    Returns:
        输出文件路径
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    lines = ["WEBVTT"]
    
    if title:
        lines.append(f"Title: {title}")
    
    lines.append(f"Language: {language}")
    lines.append("")  # 空行
    
    for entry in entries:
        lines.append(entry.to_vtt())
    
    content = '\n'.join(lines)
    output_path.write_text(content, encoding='utf-8')
    
    return output_path


def generate_subtitles_from_timeline(
    timeline: AudioTimeline,
    output_dir: Path,
    *,
    episode_name: str = "episode",
    formats: Optional[List[str]] = None,
    title: Optional[str] = None,
) -> List[Path]:
    """
    从时间轴生成字幕文件
    
    Args:
        timeline: 音频时间轴
        output_dir: 输出目录
        episode_name: 节目名称
        formats: 格式列表 ['srt', 'vtt']
        title: 字幕标题
        
    Returns:
        生成的文件路径列表
    """
    if formats is None:
        formats = ['srt', 'vtt']
    
    # 创建字幕条目
    entries = create_subtitle_entries(timeline)
    
    output_files: List[Path] = []
    
    # 导出各种格式
    if 'srt' in formats:
        srt_path = output_dir / f"{episode_name}.srt"
        export_srt(entries, srt_path)
        output_files.append(srt_path)
    
    if 'vtt' in formats:
        vtt_path = output_dir / f"{episode_name}.vtt"
        export_vtt(entries, vtt_path, title=title)
        output_files.append(vtt_path)
    
    return output_files


def create_chapter_vtt(
    timeline: AudioTimeline,
    output_path: Path,
    *,
    title: Optional[str] = None,
) -> Path:
    """
    创建章节标记的VTT文件
    
    Args:
        timeline: 音频时间轴
        output_path: 输出路径
        title: 标题
        
    Returns:
        输出文件路径
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    lines = ["WEBVTT"]
    
    if title:
        lines.append(f"Title: {title}")
    
    lines.append("")
    
    # 添加章节标记
    for chapter in timeline.chapters:
        start = format_timestamp(chapter.start_time)
        
        # 章节标记使用NOTE
        lines.append("NOTE")
        lines.append(f"Chapter: {chapter.title}")
        lines.append("")
        
        # 添加章节提示字幕
        if chapter.end_time:
            end = format_timestamp(chapter.end_time)
        else:
            # 使用下一个章节的开始时间或总时长
            next_chapter_time = timeline.total_duration
            for next_chapter in timeline.chapters:
                if next_chapter.start_time > chapter.start_time:
                    next_chapter_time = next_chapter.start_time
                    break
            end = format_timestamp(next_chapter_time)
        
        lines.append(f"{start} --> {end}")
        lines.append(f"【{chapter.title}】")
        lines.append("")
    
    content = '\n'.join(lines)
    output_path.write_text(content, encoding='utf-8')
    
    return output_path


__all__ = [
    "SubtitleEntry",
    "create_subtitle_entries",
    "export_srt",
    "export_vtt",
    "generate_subtitles_from_timeline",
    "create_chapter_vtt",
]
