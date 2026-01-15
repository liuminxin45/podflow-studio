"""
Audio Stage Implementation

音频生成阶段：TTS + 渲染
"""

from __future__ import annotations

import os
from pathlib import Path

from src.stages.base import BaseStage
from src.stages.registry import StageRegistry
from src.stages.schemas.audio import (
    AudioInput,
    AudioOutput,
    AudioSegmentOutput,
    AudioStats,
)
from src.stages.schemas.common import AudioPathsSchema


@StageRegistry.register
class AudioStage(BaseStage[AudioInput, AudioOutput]):
    """音频生成 Stage"""
    
    @property
    def name(self) -> str:
        return "audio"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    @property
    def input_schema(self) -> type[AudioInput]:
        return AudioInput
    
    @property
    def output_schema(self) -> type[AudioOutput]:
        return AudioOutput
    
    def execute(self, input_data: AudioInput) -> AudioOutput:
        """执行音频生成"""
        run_dir = Path(input_data.run_dir)
        tts_dir = run_dir / "5_tts"
        render_dir = run_dir / "5_render"
        tts_dir.mkdir(parents=True, exist_ok=True)
        render_dir.mkdir(parents=True, exist_ok=True)
        
        if not input_data.ssml:
            self.logger.warning("没有脚本内容，跳过音频生成")
            return AudioOutput(
                run_id=input_data.run_id,
                episode_date=input_data.episode_date,
                artifacts_dir=str(tts_dir),
                audio_paths=AudioPathsSchema(),
                segments=[],
                stats=AudioStats(
                    run_id=input_data.run_id,
                    episode_date=input_data.episode_date,
                    run_dir=input_data.run_dir,
                ),
            )
        
        tts_cfg = input_data.audio_config.tts
        
        self.logger.info(f"开始 TTS: {len(input_data.ssml)} chars")
        
        # TTS 生成
        tts_path = tts_dir / f"{input_data.episode_date}.tts.mp3"
        
        if tts_path.exists():
            self.logger.info(f"TTS 音频已存在，跳过: {tts_path}")
        else:
            audio_bytes = self._generate_tts(
                ssml=input_data.ssml,
                mode=tts_cfg.mode,
                timeout_s=tts_cfg.timeout_seconds,
            )
            tts_path.write_bytes(audio_bytes)
            self.logger.info(f"TTS 完成: {len(audio_bytes)} bytes")
        
        # 音频渲染
        render_cfg = input_data.audio_config.render
        rendered_path = render_dir / f"{input_data.episode_date}.rendered.mp3"
        
        if rendered_path.exists():
            self.logger.info(f"渲染音频已存在，跳过: {rendered_path}")
        else:
            from src.audio.render import render_episode_audio
            
            rendered_path = render_episode_audio(
                tts_path=tts_path,
                output_path=rendered_path,
                add_bgm=render_cfg.add_bgm,
                add_intro=render_cfg.add_intro,
                add_outro=render_cfg.add_outro,
            )
            self.logger.info(f"渲染完成: {rendered_path}")
        
        return AudioOutput(
            run_id=input_data.run_id,
            episode_date=input_data.episode_date,
            artifacts_dir=str(tts_dir),
            audio_paths=AudioPathsSchema(
                tts=str(tts_path),
                rendered=str(rendered_path),
            ),
            segments=[],
            stats=AudioStats(
                run_id=input_data.run_id,
                episode_date=input_data.episode_date,
                run_dir=input_data.run_dir,
                tts_chars_processed=len(input_data.ssml),
            ),
        )
    
    def _generate_tts(self, ssml: str, mode: str, timeout_s: int) -> bytes:
        """生成 TTS 音频"""
        from src.tts.tts_client import TTSClientFactory
        from src.stages.impl.audio_config import load_audio_stage_config
        
        # 使用 audio config，环境变量优先级更高
        audio_cfg = load_audio_stage_config()
        doubao_mode = os.environ.get("DOUBAO_MODE", audio_cfg.tts.mode).strip().lower()
        
        if doubao_mode == "podcast":
            return self._tts_podcast(ssml, timeout_s)
        elif doubao_mode == "voiceclone_http":
            return self._tts_voiceclone(ssml, timeout_s)
        elif doubao_mode in {"tts", "tts_v3_http"}:
            return self._tts_v3_http(ssml, timeout_s)
        else:
            raise RuntimeError(f"未知的 DOUBAO_MODE={doubao_mode}")
    
    def _tts_podcast(self, ssml: str, timeout_s: int) -> bytes:
        """Podcast TTS"""
        from src.tts.doubao_podcast_client import DoubaoPodcastClient
        
        client = DoubaoPodcastClient()
        return client.synthesize(ssml)
    
    def _tts_voiceclone(self, ssml: str, timeout_s: int) -> bytes:
        """Voice Clone TTS"""
        from src.tts.doubao_voiceclone_client import DoubaoVoiceCloneClient
        
        client = DoubaoVoiceCloneClient()
        return client.synthesize(ssml)
    
    def _tts_v3_http(self, ssml: str, timeout_s: int) -> bytes:
        """TTS V3 HTTP"""
        from src.tts.doubao_tts_v3_client import DoubaoTTSV3Client
        
        client = DoubaoTTSV3Client()
        return client.synthesize(ssml)
