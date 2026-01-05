"""
Unified Audio Workflow

统一音频生成工作流：将所有段落脚本合并后一次性生成TTS
"""

from __future__ import annotations

import os
import time
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

from .base import AudioWorkflow, AudioManifest
from .script_merger import ScriptMerger
from src.audio.segment_merger import AudioMerger

if TYPE_CHECKING:
    from src.app.core.context import EpisodeContext


class UnifiedWorkflow(AudioWorkflow):
    """统一音频生成工作流"""
    
    def execute(self, ctx: EpisodeContext) -> AudioManifest:
        """
        执行统一音频生成
        
        流程：
        1. 合并所有段落脚本
        2. 检查缓存
        3. 一次性生成完整音频
        4. 创建manifest
        """
        self.logger.info(f"开始统一音频生成：{len(ctx.script_segments)} 个段落")
        
        # 获取配置
        unified_cfg = self.config.get("unified", {})
        enable_cache = unified_cfg.get("enable_cache", True)
        
        # 1. 合并所有段落脚本
        merger = ScriptMerger(unified_cfg)
        merged_script = merger.merge(ctx.script_segments)
        cache_key = merger.compute_cache_key(ctx.script_segments)
        
        self.logger.info(f"脚本合并完成，总长度: {len(merged_script)} 字符")
        
        # 创建输出目录
        output_dir = self._get_output_dir(ctx, "unified")
        
        # 2. 检查缓存
        cache_path = output_dir / f"{cache_key}.mp3"
        if enable_cache and cache_path.exists():
            self.logger.info("使用缓存的统一音频")
            final_path = self._copy_to_final(ctx, cache_path)
            
            # 获取音频时长
            audio_merger = AudioMerger()
            duration_ms = audio_merger.get_audio_duration(final_path)
            
            manifest = AudioManifest(
                episode_id=ctx.episode_id,
                final_path=str(final_path),
                workflow_mode="unified",
                merged_script=merged_script,
                cache_key=cache_key,
                total_duration_ms=duration_ms,
                created_at=datetime.now().isoformat(),
            )
            
            # 保存manifest
            manifest_path = ctx.run_dir / "4_tts" / "manifest.json"
            manifest.save(str(manifest_path))
            
            self.logger.info(f"使用缓存音频: 总时长 {duration_ms/1000:.1f}秒")
            ctx.add_event(
                "audio_unified_generated",
                cached=True,
                total_duration_ms=duration_ms
            )
            
            return manifest
        
        # 3. 一次性生成完整音频
        from src.utils.logging_config import log_api_call
        
        log_api_call(
            self.logger,
            api_type="TTS",
            operation="synthesize_unified",
            char_count=len(merged_script)
        )
        
        start_time = time.time()
        
        try:
            audio_bytes = self._call_tts(ctx, merged_script)
            cache_path.write_bytes(audio_bytes)
            
            gen_ms = int((time.time() - start_time) * 1000)
            
            # 复制到最终位置
            final_path = self._copy_to_final(ctx, cache_path)
            
            # 获取音频时长
            audio_merger = AudioMerger()
            duration_ms = audio_merger.get_audio_duration(final_path)
            
            self.logger.info(
                f"✓ 统一TTS完成: {duration_ms/1000:.1f}秒, 耗时 {gen_ms}ms"
            )
            
            # 4. 创建manifest
            manifest = AudioManifest(
                episode_id=ctx.episode_id,
                final_path=str(final_path),
                workflow_mode="unified",
                merged_script=merged_script,
                cache_key=cache_key,
                total_duration_ms=duration_ms,
                created_at=datetime.now().isoformat(),
            )
            
            # 保存manifest
            manifest_path = ctx.run_dir / "4_tts" / "manifest.json"
            manifest.save(str(manifest_path))
            
            self.logger.info(f"音频生成完成: 总时长 {duration_ms/1000:.1f}秒")
            ctx.add_event(
                "audio_unified_generated",
                cached=False,
                total_duration_ms=duration_ms,
                gen_ms=gen_ms
            )
            
            return manifest
            
        except Exception as e:
            self.logger.error(f"✗ 统一TTS失败: {e}")
            raise
    
    def _call_tts(self, ctx: EpisodeContext, text: str) -> bytes:
        """调用TTS服务"""
        timeout_s = self._get_tts_timeout(ctx)
        
        # 获取 Doubao 模式
        doubao_mode_env = os.environ.get("DOUBAO_MODE")
        if doubao_mode_env is not None and doubao_mode_env.strip():
            doubao_mode = doubao_mode_env.strip().lower()
        else:
            rid = (os.environ.get("DOUBAO_RESOURCE_ID") or "").strip()
            ws_url = (os.environ.get("DOUBAO_WS_URL") or "").strip()
            if rid == "volc.service_type.10050" or ("podcasttts" in ws_url):
                doubao_mode = "podcast"
            else:
                doubao_mode = "tts"
        
        # 根据模式调用TTS
        if doubao_mode == "podcast":
            return self._tts_podcast(text, timeout_s)
        elif doubao_mode == "voiceclone_http":
            return self._tts_voiceclone(text, timeout_s)
        elif doubao_mode in {"tts", "tts_v3_http"}:
            return self._tts_v3_http(ctx, text, timeout_s)
        elif doubao_mode == "tts_v3_ws":
            return self._tts_v3_ws(ctx, text, timeout_s)
        else:
            raise RuntimeError(f"未知的 DOUBAO_MODE={doubao_mode}")
    
    def _tts_podcast(self, text: str, timeout_s: int) -> bytes:
        """Podcast 模式 TTS"""
        from src.tts.tts_client import TTSClientFactory
        import re
        
        client = TTSClientFactory.create_doubao_podcast_client(timeout_seconds=timeout_s)
        text = re.sub(r"<[^>]+>", "", text)  # 移除SSML标签
        result = client.synthesize(text, mode="podcast")
        return result.audio_data
    
    def _tts_voiceclone(self, text: str, timeout_s: int) -> bytes:
        """VoiceClone 模式 TTS"""
        from src.tts.tts_client import TTSClientFactory
        
        client = TTSClientFactory.create_doubao_podcast_client(timeout_seconds=timeout_s)
        speaker_id = (os.environ.get("DOUBAO_VOICECLONE_SPEAKER_ID") or "").strip()
        result = client.synthesize(text, mode="voiceclone_http", speaker_id=speaker_id)
        return result.audio_data
    
    def _tts_v3_http(self, ctx: EpisodeContext, text: str, timeout_s: int) -> bytes:
        """TTS V3 HTTP 模式"""
        from src.tts.tts_client import TTSClientFactory
        
        client = TTSClientFactory.create_doubao_podcast_client(timeout_seconds=timeout_s)
        voice_cfg = (ctx.config.get("tts") or {}).get("voice") or ""
        voice = voice_cfg.get("default", "") if isinstance(voice_cfg, dict) else str(voice_cfg).strip()
        result = client.synthesize(text, mode="tts_v3_http", speaker=voice)
        return result.audio_data
    
    def _tts_v3_ws(self, ctx: EpisodeContext, text: str, timeout_s: int) -> bytes:
        """TTS V3 WebSocket 模式"""
        from src.tts.tts_client import TTSClientFactory
        
        voice_cfg = (ctx.config.get("tts") or {}).get("voice") or ""
        voice = voice_cfg.get("default", "") if isinstance(voice_cfg, dict) else str(voice_cfg).strip()
        client = TTSClientFactory.create_doubao_client(voice_type=voice, timeout_seconds=timeout_s)
        
        try:
            result = client.synthesize(text, mode="tts_v3_ws")
            return result.audio_data
        except Exception as e:
            if "text too long" in str(e):
                self.logger.warning("文本过长，使用分块模式")
                result = client.synthesize(text, mode="default")
                return result.audio_data
            raise
    
    def _copy_to_final(self, ctx: EpisodeContext, source_path: Path) -> Path:
        """复制音频到最终位置"""
        import shutil
        
        final_dir = ctx.run_dir / "5_render"
        final_dir.mkdir(parents=True, exist_ok=True)
        final_path = final_dir / f"{ctx.episode_date}.final.mp3"
        
        shutil.copy2(source_path, final_path)
        
        return final_path
