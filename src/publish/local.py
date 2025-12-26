"""
Local Publisher Module

这个文件实现了本地发布功能，用于将播客内容发布到本地文件系统。

功能概述：
- 本地文件系统发布
- 目录结构自动创建
- 元数据文件生成
- 发布状态管理

主要函数：
- publish_to_local(): 本地发布主函数
- create_directory_structure(): 创建目录结构
- generate_metadata(): 生成元数据文件

发布特性：
- 自动目录创建
- 文件组织优化
- 元数据管理
- 发布日志记录

使用示例：
    result = publish_to_local(
        audio_file="episode.mp3",
        metadata=episode_data,
        output_dir="output/2025-12-25"
    )

应用场景：
- 本地播客发布
- 文件归档管理
- 开发环境测试
- 备份和存储

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

from __future__ import annotations

import json
from pathlib import Path


def publish_local(
    rendered_audio_path: Path,
    episodes_dir: Path,
    episode_date: str,
    title: str,
    shownotes: str,
    tags: list[str],
) -> Path:
    episodes_dir.mkdir(parents=True, exist_ok=True)

    final_path = episodes_dir / f"{episode_date}.published.mp3"
    if not final_path.exists():
        final_path.write_bytes(rendered_audio_path.read_bytes())

    meta_path = episodes_dir / f"{episode_date}.metadata.json"
    if not meta_path.exists():
        meta = {
            "episode_date": episode_date,
            "title": title,
            "tags": tags,
            "audio": str(final_path),
        }
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    notes_path = episodes_dir / f"{episode_date}.shownotes.md"
    if not notes_path.exists():
        notes_path.write_text(shownotes, encoding="utf-8")

    return final_path
