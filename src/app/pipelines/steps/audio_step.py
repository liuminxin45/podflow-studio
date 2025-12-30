"""
Audio Step

音频生成步骤（TTS + Render）
"""

from __future__ import annotations

import os
import re
import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from src.app.pipelines.base_step import BaseStep
from src.audio.render import render_episode_audio

if TYPE_CHECKING:
    from src.app.core.context import EpisodeContext


class AudioStep(BaseStep):
    """音频生成步骤（TTS + Render）"""
    
    def execute(self, ctx: EpisodeContext) -> None:
        """执行 Audio 步骤"""
        if not ctx.script_text:
            self.logger.warning("没有脚本内容，跳过音频生成")
            ctx.audio_paths = {}
            return
        
        # 步骤1: TTS 语音合成
        tts_path = self._generate_tts(ctx)
        
        # 步骤2: Render 音频渲染
        rendered_path = self._render_audio(ctx, tts_path)
        
        ctx.audio_paths = {
            "tts": str(tts_path),
            "rendered": str(rendered_path),
        }
        
        self.logger.info(f"音频生成完成: TTS={tts_path.name}, Rendered={rendered_path.name}")
        ctx.add_event("audio_generated",
                     tts_path=str(tts_path),
                     rendered_path=str(rendered_path))
    
    def _generate_tts(self, ctx: EpisodeContext) -> Path:
        """生成 TTS 音频"""
        cfg = ctx.config
        timeout_s = int(cfg.get("llm", {}).get("timeout_seconds", 120))
        
        tts_dir = ctx.run_dir / "3_tts"
        tts_dir.mkdir(parents=True, exist_ok=True)
        tts_path = tts_dir / f"{ctx.episode_date}.tts.mp3"
        
        # 检查是否已存在
        if tts_path.exists():
            self.logger.info(f"TTS 音频已存在，跳过生成: {tts_path}")
            return tts_path
        
        self.logger.info("开始 TTS 语音合成...")
        
        from src.tts.tts_client import TTSClientFactory
        
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
        
        try:
            # 根据模式选择 TTS 方法
            if doubao_mode == "podcast":
                audio_bytes = self._tts_podcast(ctx, timeout_s)
            elif doubao_mode == "voiceclone_http":
                audio_bytes = self._tts_voiceclone(ctx, timeout_s)
            elif doubao_mode in {"tts", "tts_v3_http"}:
                audio_bytes = self._tts_v3_http(ctx, cfg, timeout_s)
            elif doubao_mode == "tts_v3_ws":
                audio_bytes = self._tts_v3_ws(ctx, cfg, timeout_s)
            else:
                raise RuntimeError(f"未知的 DOUBAO_MODE={doubao_mode}")
            
            tts_path.write_bytes(audio_bytes)
            self.logger.info(f"TTS 完成: {len(audio_bytes)} bytes")
            
        except Exception as e:
            self.logger.error(f"TTS 失败: {e}，使用降级方案")
            # 降级：使用本地 TTS（如果有的话）
            raise RuntimeError(f"TTS 生成失败: {e}")
        
        return tts_path
    
    def _tts_podcast(self, ctx: EpisodeContext, timeout_s: int) -> bytes:
        """Podcast 模式 TTS"""
        from src.tts.tts_client import TTSClientFactory
        
        client = TTSClientFactory.create_doubao_podcast_client(timeout_seconds=timeout_s)
        text = self._strip_angle_tags(ctx.script_text)
        result = client.synthesize(text, mode="podcast")
        return result.audio_data
    
    def _tts_voiceclone(self, ctx: EpisodeContext, timeout_s: int) -> bytes:
        """VoiceClone 模式 TTS"""
        from src.tts.tts_client import TTSClientFactory
        
        client = TTSClientFactory.create_doubao_podcast_client(timeout_seconds=timeout_s)
        speaker_id = (os.environ.get("DOUBAO_VOICECLONE_SPEAKER_ID") or "").strip()
        result = client.synthesize(ctx.script_text, mode="voiceclone_http", speaker_id=speaker_id)
        return result.audio_data
    
    def _tts_v3_http(self, ctx: EpisodeContext, cfg: dict, timeout_s: int) -> bytes:
        """TTS V3 HTTP 模式"""
        from src.tts.tts_client import TTSClientFactory
        
        client = TTSClientFactory.create_doubao_podcast_client(timeout_seconds=timeout_s)
        voice = ((cfg.get("tts") or {}).get("voice") or "").strip()
        result = client.synthesize(ctx.script_text, mode="tts_v3_http", speaker=voice)
        return result.audio_data
    
    def _tts_v3_ws(self, ctx: EpisodeContext, cfg: dict, timeout_s: int) -> bytes:
        """TTS V3 WebSocket 模式"""
        from src.tts.tts_client import TTSClientFactory
        
        voice = ((cfg.get("tts") or {}).get("voice") or "").strip()
        client = TTSClientFactory.create_doubao_client(voice_type=voice, timeout_seconds=timeout_s)
        
        try:
            result = client.synthesize(ctx.script_text, mode="tts_v3_ws")
            return result.audio_data
        except Exception as e:
            if "text too long" in str(e):
                self.logger.warning("文本过长，使用分块模式")
                result = client.synthesize(ctx.script_text, mode="default")
                return result.audio_data
            raise
    
    def _render_audio(self, ctx: EpisodeContext, tts_path: Path) -> Path:
        """渲染音频（添加片头片尾背景音乐）"""
        cfg = ctx.config
        timeout_s = int(cfg.get("llm", {}).get("timeout_seconds", 120))
        
        render_dir = ctx.run_dir / "4_render"
        render_dir.mkdir(parents=True, exist_ok=True)
        rendered_path = render_dir / f"{ctx.episode_date}.final.mp3"
        
        # 检查是否已存在
        if rendered_path.exists():
            self.logger.info(f"渲染音频已存在，跳过渲染: {rendered_path}")
            return rendered_path
        
        self.logger.info("开始音频渲染...")
        
        # 检查 ffmpeg
        if shutil.which("ffmpeg") is None:
            self.logger.warning("ffmpeg 未找到，直接复制 TTS 音频")
            rendered_path.write_bytes(tts_path.read_bytes())
            return rendered_path
        
        # 获取音频资源
        audio_cfg = cfg.get("audio", {})
        assets_dir = Path(audio_cfg.get("assets_dir", "./assets"))
        
        # 处理 intro/outro/bgm 配置（可能是字符串或字典）
        intro_cfg = audio_cfg.get("intro", "intro.mp3")
        outro_cfg = audio_cfg.get("outro", "outro.mp3")
        bgm_cfg = audio_cfg.get("bgm", "bgm.mp3")
        
        intro = assets_dir / (intro_cfg if isinstance(intro_cfg, str) else intro_cfg.get("file", "intro.mp3"))
        outro = assets_dir / (outro_cfg if isinstance(outro_cfg, str) else outro_cfg.get("file", "outro.mp3"))
        bgm = assets_dir / (bgm_cfg if isinstance(bgm_cfg, str) else bgm_cfg.get("file", "bgm.mp3"))
        bgm_volume = float(audio_cfg.get("bgm_volume", 0.18))
        
        # 检查资源是否存在
        if not (intro.exists() and outro.exists() and bgm.exists()):
            self.logger.warning(f"音频资源缺失，使用简单渲染")
            self._render_simple(tts_path, rendered_path, timeout_s)
            return rendered_path
        
        # 完整渲染
        render_episode_audio(
            intro_path=intro,
            main_path=tts_path,
            outro_path=outro,
            bgm_path=bgm,
            bgm_volume=bgm_volume,
            out_path=rendered_path,
            timeout_seconds=timeout_s,
        )
        
        self.logger.info(f"渲染完成: {rendered_path}")
        return rendered_path
    
    def _render_simple(self, main_path: Path, out_path: Path, timeout_s: int) -> None:
        """简单渲染（仅复制）"""
        # 如果音频资源缺失，直接复制 TTS 音频作为最终输出
        out_path.write_bytes(main_path.read_bytes())
    
    @staticmethod
    def _strip_angle_tags(text: str) -> str:
        """移除 SSML 标签"""
        return re.sub(r"<[^>]+>", "", text)
