"""
Chapters Module

将播客内容组织成章节，便于听众导航和理解。

章节策略：
- 基于编辑计划的5W框架自动分章
- 每个章节包含标题、时间戳、摘要
- 支持自定义章节划分

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from src.llm.editorial import EditorialPlan, EditorialSection


@dataclass
class Chapter:
    """播客章节"""
    title: str
    start_time: float  # 秒
    end_time: Optional[float] = None  # 秒
    summary: str = ""
    section_type: Optional[str] = None  # what / so_what / impact / uncertainty / takeaway
    content: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def duration(self) -> Optional[float]:
        """章节时长（秒）"""
        if self.end_time is not None:
            return self.end_time - self.start_time
        return None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration": self.duration(),
            "summary": self.summary,
            "section_type": self.section_type,
            "content": self.content[:200],  # 截断长内容
            "metadata": self.metadata,
        }


@dataclass
class ChapterPlan:
    """章节规划"""
    chapters: List[Chapter] = field(default_factory=list)
    total_duration: float = 0.0  # 秒
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "chapters": [c.to_dict() for c in self.chapters],
            "chapter_count": len(self.chapters),
            "total_duration": self.total_duration,
            "metadata": self.metadata,
        }


def estimate_reading_time(text: str, words_per_minute: int = 150) -> float:
    """
    估算朗读时间
    
    Args:
        text: 文本内容
        words_per_minute: 每分钟字数（中文）
        
    Returns:
        时间（秒）
    """
    # 简单估算：中文按字数，英文按单词数
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    english_words = len([w for w in text.split() if any(c.isalpha() for c in w)])
    
    # 中文：150字/分钟，英文：150词/分钟
    chinese_time = (chinese_chars / words_per_minute) * 60
    english_time = (english_words / words_per_minute) * 60
    
    # 加上停顿时间（10%）
    total_time = (chinese_time + english_time) * 1.1
    
    return total_time


def create_chapters_from_editorial(
    editorial_plan: EditorialPlan,
    script: str,
    *,
    include_intro: bool = True,
    include_outro: bool = True,
    intro_duration: float = 10.0,
    outro_duration: float = 5.0,
) -> ChapterPlan:
    """
    从编辑计划创建章节
    
    Args:
        editorial_plan: 编辑计划
        script: 完整脚本
        include_intro: 是否包含开场
        include_outro: 是否包含结尾
        intro_duration: 开场时长（秒）
        outro_duration: 结尾时长（秒）
        
    Returns:
        章节规划
    """
    chapters: List[Chapter] = []
    current_time = 0.0
    
    # 开场
    if include_intro:
        intro_chapter = Chapter(
            title="开场",
            start_time=current_time,
            end_time=current_time + intro_duration,
            summary=f"欢迎收听本期播客：{editorial_plan.story_title}",
            section_type=None,
            metadata={"is_intro": True},
        )
        chapters.append(intro_chapter)
        current_time += intro_duration
    
    # 主要内容章节
    section_titles = {
        "what": "核心事实",
        "so_what": "为什么重要",
        "impact": "影响分析",
        "uncertainty": "不确定性",
        "takeaway": "关键要点",
    }
    
    for section in editorial_plan.sections:
        # 估算该章节的时长
        section_duration = estimate_reading_time(section.content)
        
        chapter = Chapter(
            title=section_titles.get(section.section_type, section.title),
            start_time=current_time,
            end_time=current_time + section_duration,
            summary=section.content[:100] + "..." if len(section.content) > 100 else section.content,
            section_type=section.section_type,
            content=section.content,
            metadata={
                "evidence_support": section.evidence_support,
                "confidence": section.confidence,
            },
        )
        chapters.append(chapter)
        current_time += section_duration
    
    # 免责声明（如果需要）
    if editorial_plan.requires_disclaimer and editorial_plan.disclaimer_text:
        disclaimer_duration = estimate_reading_time(editorial_plan.disclaimer_text)
        disclaimer_chapter = Chapter(
            title="重要提示",
            start_time=current_time,
            end_time=current_time + disclaimer_duration,
            summary="关于本期内容的重要说明",
            section_type=None,
            content=editorial_plan.disclaimer_text,
            metadata={"is_disclaimer": True},
        )
        chapters.append(disclaimer_chapter)
        current_time += disclaimer_duration
    
    # 结尾
    if include_outro:
        outro_chapter = Chapter(
            title="结尾",
            start_time=current_time,
            end_time=current_time + outro_duration,
            summary="感谢收听，我们下期再见",
            section_type=None,
            metadata={"is_outro": True},
        )
        chapters.append(outro_chapter)
        current_time += outro_duration
    
    chapter_plan = ChapterPlan(
        chapters=chapters,
        total_duration=current_time,
        metadata={
            "story_title": editorial_plan.story_title,
            "chapter_count": len(chapters),
            "has_disclaimer": editorial_plan.requires_disclaimer,
        },
    )
    
    return chapter_plan


def create_simple_chapters(
    script: str,
    *,
    max_chapter_duration: float = 120.0,
    min_chapter_duration: float = 30.0,
) -> ChapterPlan:
    """
    简单章节划分（基于时长）
    
    Args:
        script: 脚本文本
        max_chapter_duration: 最大章节时长（秒）
        min_chapter_duration: 最小章节时长（秒）
        
    Returns:
        章节规划
    """
    # 按段落分割
    paragraphs = [p.strip() for p in script.split("\n\n") if p.strip()]
    
    chapters: List[Chapter] = []
    current_time = 0.0
    current_content = []
    current_duration = 0.0
    chapter_index = 1
    
    for para in paragraphs:
        para_duration = estimate_reading_time(para)
        
        # 如果当前章节已经足够长，或者加上这段会超过最大时长
        if current_duration >= min_chapter_duration and (current_duration + para_duration > max_chapter_duration):
            # 创建章节
            chapter_content = "\n\n".join(current_content)
            chapter = Chapter(
                title=f"第{chapter_index}部分",
                start_time=current_time,
                end_time=current_time + current_duration,
                summary=chapter_content[:100] + "..." if len(chapter_content) > 100 else chapter_content,
                content=chapter_content,
            )
            chapters.append(chapter)
            
            # 重置
            current_time += current_duration
            current_content = [para]
            current_duration = para_duration
            chapter_index += 1
        else:
            current_content.append(para)
            current_duration += para_duration
    
    # 处理最后一个章节
    if current_content:
        chapter_content = "\n\n".join(current_content)
        chapter = Chapter(
            title=f"第{chapter_index}部分",
            start_time=current_time,
            end_time=current_time + current_duration,
            summary=chapter_content[:100] + "..." if len(chapter_content) > 100 else chapter_content,
            content=chapter_content,
        )
        chapters.append(chapter)
        current_time += current_duration
    
    chapter_plan = ChapterPlan(
        chapters=chapters,
        total_duration=current_time,
        metadata={
            "chapter_count": len(chapters),
            "avg_chapter_duration": current_time / len(chapters) if chapters else 0,
        },
    )
    
    return chapter_plan


def format_chapters_for_podcast(chapter_plan: ChapterPlan) -> str:
    """
    格式化章节信息用于播客平台
    
    Args:
        chapter_plan: 章节规划
        
    Returns:
        格式化的章节文本
    """
    lines = []
    lines.append("# 章节列表\n")
    
    for i, chapter in enumerate(chapter_plan.chapters, 1):
        start_min = int(chapter.start_time // 60)
        start_sec = int(chapter.start_time % 60)
        
        lines.append(f"{i}. {chapter.title} ({start_min:02d}:{start_sec:02d})")
        if chapter.summary:
            lines.append(f"   {chapter.summary}\n")
    
    lines.append(f"\n总时长: {int(chapter_plan.total_duration // 60)}分{int(chapter_plan.total_duration % 60)}秒")
    
    return "\n".join(lines)


def export_chapters_json(chapter_plan: ChapterPlan) -> Dict[str, Any]:
    """
    导出章节信息为JSON格式（用于播客平台）
    
    Args:
        chapter_plan: 章节规划
        
    Returns:
        JSON格式的章节信息
    """
    return {
        "version": "1.0",
        "chapters": [
            {
                "title": chapter.title,
                "startTime": chapter.start_time,
                "endTime": chapter.end_time,
                "img": None,  # 可选：章节封面图
            }
            for chapter in chapter_plan.chapters
        ],
        "author": "Auto-Podcast",
        "title": chapter_plan.metadata.get("story_title", "Untitled"),
        "podcastName": "Auto-Podcast",
    }


__all__ = [
    "Chapter",
    "ChapterPlan",
    "create_chapters_from_editorial",
    "create_simple_chapters",
    "format_chapters_for_podcast",
    "export_chapters_json",
]
