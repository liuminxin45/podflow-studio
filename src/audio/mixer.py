"""
Audio Mixer Module

混音处理：BGM、ducking、响度标准化，打造专业播客音质。

功能：
- Intro/Mid/Outro BGM混合
- Ducking（背景音乐自动降低）
- Loudness normalization（-16 LUFS标准）
- 淡入淡出效果

依赖：pydub（需要ffmpeg）

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from pydub import AudioSegment
    from pydub.effects import normalize
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False
    AudioSegment = None


@dataclass
class AudioTrack:
    """音频轨道"""
    audio: Any  # AudioSegment
    start_time: float  # 秒
    duration: float  # 秒
    volume_db: float = 0.0  # 音量调整（dB）
    fade_in: float = 0.0  # 淡入时长（秒）
    fade_out: float = 0.0  # 淡出时长（秒）
    track_type: str = "voice"  # voice / bgm / sfx
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MixConfig:
    """混音配置"""
    target_loudness: float = -16.0  # LUFS
    bgm_volume_db: float = -20.0  # BGM音量（相对主音轨）
    ducking_amount_db: float = -12.0  # Ducking降低量
    ducking_fade_ms: int = 500  # Ducking淡入淡出时长（毫秒）
    intro_bgm_duration: float = 5.0  # 开场BGM时长（秒）
    outro_bgm_duration: float = 3.0  # 结尾BGM时长（秒）
    crossfade_duration: float = 1.0  # 交叉淡化时长（秒）


def check_pydub_available():
    """检查pydub是否可用"""
    if not PYDUB_AVAILABLE:
        raise ImportError(
            "pydub is not available. Please install it with: pip install pydub\n"
            "Also ensure ffmpeg is installed and in PATH."
        )


def load_audio_file(file_path: Path) -> AudioSegment:
    """
    加载音频文件
    
    Args:
        file_path: 音频文件路径
        
    Returns:
        AudioSegment对象
    """
    check_pydub_available()
    
    if not file_path.exists():
        raise FileNotFoundError(f"Audio file not found: {file_path}")
    
    # 根据文件扩展名加载
    ext = file_path.suffix.lower()
    
    if ext == '.mp3':
        return AudioSegment.from_mp3(str(file_path))
    elif ext == '.wav':
        return AudioSegment.from_wav(str(file_path))
    elif ext == '.ogg':
        return AudioSegment.from_ogg(str(file_path))
    else:
        # 尝试自动检测
        return AudioSegment.from_file(str(file_path))


def apply_fade(audio: AudioSegment, fade_in_ms: int = 0, fade_out_ms: int = 0) -> AudioSegment:
    """
    应用淡入淡出效果
    
    Args:
        audio: 音频片段
        fade_in_ms: 淡入时长（毫秒）
        fade_out_ms: 淡出时长（毫秒）
        
    Returns:
        处理后的音频
    """
    result = audio
    
    if fade_in_ms > 0:
        result = result.fade_in(fade_in_ms)
    
    if fade_out_ms > 0:
        result = result.fade_out(fade_out_ms)
    
    return result


def apply_ducking(
    voice: AudioSegment,
    bgm: AudioSegment,
    ducking_db: float = -12.0,
    fade_ms: int = 500,
) -> AudioSegment:
    """
    应用Ducking效果（背景音乐在有人声时自动降低）
    
    Args:
        voice: 人声音频
        bgm: 背景音乐
        ducking_db: 降低量（dB）
        fade_ms: 淡入淡出时长（毫秒）
        
    Returns:
        处理后的BGM
    """
    # 简化实现：在整个人声期间降低BGM音量
    # 更复杂的实现需要检测人声的实际存在
    
    # 确保BGM足够长
    if len(bgm) < len(voice):
        # 循环BGM
        repeats = (len(voice) // len(bgm)) + 1
        bgm = bgm * repeats
    
    # 截取与人声等长的BGM
    bgm = bgm[:len(voice)]
    
    # 降低音量
    ducked_bgm = bgm + ducking_db
    
    # 在开头和结尾添加淡入淡出
    ducked_bgm = apply_fade(ducked_bgm, fade_in_ms=fade_ms, fade_out_ms=fade_ms)
    
    return ducked_bgm


def mix_audio_tracks(
    tracks: List[AudioTrack],
    output_duration_ms: Optional[int] = None,
) -> AudioSegment:
    """
    混合多个音频轨道
    
    Args:
        tracks: 音频轨道列表
        output_duration_ms: 输出时长（毫秒），None表示自动计算
        
    Returns:
        混合后的音频
    """
    check_pydub_available()
    
    if not tracks:
        # 返回静音
        return AudioSegment.silent(duration=1000)
    
    # 计算总时长
    if output_duration_ms is None:
        max_end_time = max((t.start_time + t.duration) for t in tracks)
        output_duration_ms = int(max_end_time * 1000)
    
    # 创建静音基础轨道
    mixed = AudioSegment.silent(duration=output_duration_ms)
    
    # 逐个叠加轨道
    for track in tracks:
        audio = track.audio
        
        # 应用音量调整
        if track.volume_db != 0:
            audio = audio + track.volume_db
        
        # 应用淡入淡出
        fade_in_ms = int(track.fade_in * 1000)
        fade_out_ms = int(track.fade_out * 1000)
        if fade_in_ms > 0 or fade_out_ms > 0:
            audio = apply_fade(audio, fade_in_ms, fade_out_ms)
        
        # 叠加到混合轨道
        start_ms = int(track.start_time * 1000)
        mixed = mixed.overlay(audio, position=start_ms)
    
    return mixed


def normalize_loudness(
    audio: AudioSegment,
    target_lufs: float = -16.0,
) -> AudioSegment:
    """
    响度标准化（简化版）
    
    注意：这是简化实现，真正的LUFS标准化需要pyloudnorm库
    这里使用峰值标准化作为近似
    
    Args:
        audio: 音频片段
        target_lufs: 目标响度（LUFS）
        
    Returns:
        标准化后的音频
    """
    # 使用pydub的normalize（峰值标准化）
    normalized = normalize(audio)
    
    # 根据目标LUFS调整音量（简化映射）
    # -16 LUFS 大约对应 -3dB 的峰值
    target_db = target_lufs + 16  # 简化映射
    normalized = normalized + target_db
    
    return normalized


def create_podcast_mix(
    voice_segments: List[AudioSegment],
    *,
    intro_bgm: Optional[AudioSegment] = None,
    mid_bgm: Optional[AudioSegment] = None,
    outro_bgm: Optional[AudioSegment] = None,
    config: Optional[MixConfig] = None,
) -> AudioSegment:
    """
    创建完整的播客混音
    
    Args:
        voice_segments: 人声片段列表
        intro_bgm: 开场BGM
        mid_bgm: 中间BGM
        outro_bgm: 结尾BGM
        config: 混音配置
        
    Returns:
        混合后的音频
    """
    check_pydub_available()
    
    if config is None:
        config = MixConfig()
    
    logger = logging.getLogger("audio.mixer")
    logger.info("开始创建播客混音")
    
    tracks: List[AudioTrack] = []
    current_time = 0.0
    
    # 1. Intro BGM
    if intro_bgm:
        intro_duration = min(config.intro_bgm_duration, len(intro_bgm) / 1000.0)
        intro_audio = intro_bgm[:int(intro_duration * 1000)]
        
        tracks.append(AudioTrack(
            audio=intro_audio,
            start_time=current_time,
            duration=intro_duration,
            volume_db=config.bgm_volume_db,
            fade_in=0.5,
            fade_out=1.0,
            track_type="bgm",
            metadata={"position": "intro"},
        ))
        
        current_time += intro_duration
        logger.info(f"添加Intro BGM: {intro_duration:.1f}s")
    
    # 2. 主要内容（人声 + Mid BGM with ducking）
    voice_start_time = current_time
    
    for i, voice_seg in enumerate(voice_segments):
        voice_duration = len(voice_seg) / 1000.0
        
        tracks.append(AudioTrack(
            audio=voice_seg,
            start_time=current_time,
            duration=voice_duration,
            volume_db=0.0,
            track_type="voice",
            metadata={"segment_index": i},
        ))
        
        current_time += voice_duration
    
    voice_total_duration = current_time - voice_start_time
    logger.info(f"添加人声: {len(voice_segments)}段, 总时长{voice_total_duration:.1f}s")
    
    # 添加Mid BGM with ducking
    if mid_bgm and voice_total_duration > 0:
        # 创建ducked BGM
        voice_combined = sum(voice_segments)
        ducked_bgm = apply_ducking(
            voice_combined,
            mid_bgm,
            ducking_db=config.ducking_amount_db,
            fade_ms=config.ducking_fade_ms,
        )
        
        tracks.append(AudioTrack(
            audio=ducked_bgm,
            start_time=voice_start_time,
            duration=voice_total_duration,
            volume_db=config.bgm_volume_db,
            track_type="bgm",
            metadata={"position": "mid", "ducked": True},
        ))
        
        logger.info(f"添加Mid BGM with ducking: {voice_total_duration:.1f}s")
    
    # 3. Outro BGM
    if outro_bgm:
        outro_duration = min(config.outro_bgm_duration, len(outro_bgm) / 1000.0)
        outro_audio = outro_bgm[:int(outro_duration * 1000)]
        
        tracks.append(AudioTrack(
            audio=outro_audio,
            start_time=current_time,
            duration=outro_duration,
            volume_db=config.bgm_volume_db,
            fade_in=0.5,
            fade_out=1.0,
            track_type="bgm",
            metadata={"position": "outro"},
        ))
        
        current_time += outro_duration
        logger.info(f"添加Outro BGM: {outro_duration:.1f}s")
    
    # 混合所有轨道
    logger.info("混合音频轨道...")
    mixed = mix_audio_tracks(tracks)
    
    # 响度标准化
    logger.info(f"应用响度标准化: {config.target_loudness} LUFS")
    normalized = normalize_loudness(mixed, config.target_loudness)
    
    logger.info(f"混音完成，总时长: {len(normalized) / 1000.0:.1f}s")
    
    return normalized


def export_audio(
    audio: AudioSegment,
    output_path: Path,
    *,
    format: str = "mp3",
    bitrate: str = "192k",
    tags: Optional[Dict[str, str]] = None,
) -> Path:
    """
    导出音频文件
    
    Args:
        audio: 音频片段
        output_path: 输出路径
        format: 格式（mp3/wav/ogg）
        bitrate: 比特率
        tags: ID3标签
        
    Returns:
        输出文件路径
    """
    check_pydub_available()
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    export_params = {
        "format": format,
        "bitrate": bitrate,
    }
    
    if tags:
        export_params["tags"] = tags
    
    audio.export(str(output_path), **export_params)
    
    logger = logging.getLogger("audio.mixer")
    logger.info(f"音频已导出: {output_path}")
    
    return output_path


__all__ = [
    "AudioTrack",
    "MixConfig",
    "load_audio_file",
    "create_podcast_mix",
    "normalize_loudness",
    "export_audio",
]
