"""
Unified TTS Client

这个文件提供了统一的TTS（文本转语音）客户端接口，采用类似api_client.py的架构设计。

功能概述：
- 统一多种TTS服务提供商接口（豆包TTS、VoiceClone等）
- 支持多种合成模式（播客、语音克隆、HTTP、WebSocket等）
- 提供完整的配置管理和错误处理
- 支持音频输出管理和元数据操作

主要类：
- UnifiedTTSClient: 统一TTS客户端
- TTSConfig: TTS配置管理类
- TTSOutput: TTS输出结果类
- TTSClientFactory: 客户端工厂类

支持的TTS模式：
- default: 默认TTS模式
- podcast: 播客合成模式
- voiceclone_http: VoiceClone HTTP模式
- tts_v3_http: TTS V3 HTTP模式
- tts_v3_ws: TTS V3 WebSocket模式

使用示例：
    client = TTSClientFactory.create_doubao_client(voice_type="BV001_streaming")
    result = client.synthesize("你好世界", mode="default")
    result.save_to_file("output.mp3")

架构特点：
- 协议层（doubao.py）和业务层（tts_client.py）分离
- 统一的接口设计，易于扩展
- 完整的类型注解和错误处理

作者：Auto-Podcast Team
版本：2.0.0
更新：2025-12-25
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Union

from src.tts.doubao import DoubaoTTSClient, DoubaoPodcastClient


class TTSConfig:
    """TTS配置类"""
    def __init__(
        self,
        provider: str,
        voice_type: str = "default",
        speed: float = 1.0,
        volume: float = 1.0,
        sample_rate: int = 24000,
        **kwargs
    ):
        self.provider = provider.lower()
        self.voice_type = voice_type
        self.speed = speed
        self.volume = volume
        self.sample_rate = sample_rate
        self.extra_params = kwargs


class TTSOutput:
    """TTS输出结果类"""
    def __init__(
        self,
        audio_data: bytes,
        format: str = "mp3",
        duration_ms: Optional[int] = None,
        sample_rate: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.audio_data = audio_data
        self.format = format
        self.duration_ms = duration_ms
        self.sample_rate = sample_rate
        self.metadata = metadata or {}

    def save_to_file(self, output_path: Union[str, Path]) -> Path:
        """保存音频到文件"""
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'wb') as f:
            f.write(self.audio_data)
        
        return output_path

    @property
    def size_bytes(self) -> int:
        """音频数据大小（字节）"""
        return len(self.audio_data)

    @property
    def size_mb(self) -> float:
        """音频数据大小（MB）"""
        return self.size_bytes / (1024 * 1024)


class UnifiedTTSClient:
    """
    统一TTS客户端
    支持多种TTS服务提供商
    """
    
    def __init__(self, config: TTSConfig, timeout_seconds: int = 60):
        self.config = config
        self.timeout_seconds = timeout_seconds
        self.provider = config.provider.lower()
        self.log = logging.getLogger(f"tts.{self.provider}")
        
        # 初始化对应的客户端
        self._init_client()
    
    def _init_client(self):
        """初始化对应提供商的客户端"""
        if self.provider == "doubao":
            self._init_doubao_client()
        elif self.provider == "doubao_podcast":
            self._init_doubao_podcast_client()
        else:
            raise ValueError(f"Unsupported TTS provider: {self.provider}")
    
    def _init_doubao_client(self):
        """初始化豆包TTS客户端"""
        self._client = DoubaoTTSClient(timeout_seconds=self.timeout_seconds)
    
    def _init_doubao_podcast_client(self):
        """初始化豆包播客客户端"""
        self._client = DoubaoPodcastClient(timeout_seconds=self.timeout_seconds)
    
    def synthesize(self, text_or_ssml: str, mode: str = "default", **kwargs) -> TTSOutput:
        """
        合成语音
        
        Args:
            text_or_ssml: 文本或SSML内容
            mode: 合成模式 (default, podcast, voiceclone_http, tts_v3_http, tts_v3_ws)
            **kwargs: 额外参数
        
        Returns:
            TTSOutput: 合成结果
        """
        try:
            if self.provider == "doubao":
                return self._synthesize_doubao(text_or_ssml, mode=mode, **kwargs)
            elif self.provider == "doubao_podcast":
                return self._synthesize_doubao_podcast(text_or_ssml, mode=mode, **kwargs)
            else:
                raise ValueError(f"Unsupported provider: {self.provider}")
        
        except Exception as e:
            self.log.error("TTS synthesis failed: %s", e)
            raise RuntimeError(f"{self.provider.title()} TTS synthesis failed") from e
    
    def _synthesize_doubao(self, text_or_ssml: str, mode: str = "default", **kwargs) -> TTSOutput:
        """豆包TTS合成"""
        voice_type = kwargs.get("voice_type", self.config.voice_type)
        
        if mode == "tts_v3_ws":
            # WebSocket V3模式
            task_id = self._client.submit_v3_ws(ssml=text_or_ssml, voice=voice_type)
            audio_data = self._client.poll(task_id=task_id)
        else:
            # 默认模式
            audio_data = self._client.synthesize(
                ssml=text_or_ssml,
                voice=voice_type
            )
        
        return TTSOutput(
            audio_data=audio_data,
            format="mp3",
            sample_rate=self.config.sample_rate,
            metadata={
                "provider": "doubao",
                "mode": mode,
                "voice_type": voice_type,
                "text_length": len(text_or_ssml)
            }
        )
    
    def _synthesize_doubao_podcast(self, text_or_ssml: str, mode: str = "default", **kwargs) -> TTSOutput:
        """豆包播客TTS合成"""
        if mode == "voiceclone_http":
            # VoiceClone HTTP模式
            speaker_id = kwargs.get("speaker_id", "")
            audio_data = self._client.generate_mp3_voiceclone_http(
                input_text=text_or_ssml, 
                speaker_id=speaker_id
            )
            provider_name = "doubao_voiceclone_http"
        elif mode in {"tts", "tts_v3_http"}:
            # TTS V3 HTTP模式
            speaker = kwargs.get("speaker", "")
            audio_data = self._client.generate_mp3_v3_unidirectional_http(
                input_text=text_or_ssml, 
                speaker=speaker
            )
            provider_name = "doubao_tts_v3_http"
        else:
            # 默认播客模式
            audio_data = self._client.generate_mp3(input_text=text_or_ssml)
            provider_name = "doubao_podcast"
        
        return TTSOutput(
            audio_data=audio_data,
            format="mp3",
            sample_rate=self.config.sample_rate,
            metadata={
                "provider": provider_name,
                "mode": mode,
                "text_length": len(text_or_ssml)
            }
        )
    
    def synthesize_to_file(
        self, 
        text_or_ssml: str, 
        output_path: Union[str, Path],
        **kwargs
    ) -> Path:
        """
        合成语音并保存到文件
        
        Args:
            text_or_ssml: 文本或SSML内容
            output_path: 输出文件路径
            **kwargs: 额外参数
        
        Returns:
            Path: 保存的文件路径
        """
        result = self.synthesize(text_or_ssml, **kwargs)
        return result.save_to_file(output_path)


class TTSClientFactory:
    """TTS客户端工厂类"""
    
    @staticmethod
    def create_doubao_client(
        voice_type: str = "BV001_streaming",
        speed: float = 1.0,
        volume: float = 1.0,
        timeout_seconds: int = 60,
        **kwargs
    ) -> UnifiedTTSClient:
        """创建豆包TTS客户端"""
        config = TTSConfig(
            provider="doubao",
            voice_type=voice_type,
            speed=speed,
            volume=volume,
            **kwargs
        )
        return UnifiedTTSClient(config, timeout_seconds)
    
    @staticmethod
    def create_doubao_podcast_client(
        timeout_seconds: int = 60,
        **kwargs
    ) -> UnifiedTTSClient:
        """创建豆包播客客户端"""
        config = TTSConfig(
            provider="doubao_podcast",
            **kwargs
        )
        return UnifiedTTSClient(config, timeout_seconds)
    
    @staticmethod
    def create_client(
        provider: str,
        timeout_seconds: int = 60,
        **config_kwargs
    ) -> UnifiedTTSClient:
        """
        通用客户端创建方法
        
        Args:
            provider: 提供商名称
            timeout_seconds: 超时时间
            **config_kwargs: 配置参数
        
        Returns:
            UnifiedTTSClient: 客户端实例
        """
        config = TTSConfig(provider=provider, **config_kwargs)
        return UnifiedTTSClient(config, timeout_seconds)


# 向后兼容的便捷函数
def create_doubao_tts_client(timeout_seconds: int = 60) -> DoubaoTTSClient:
    """创建豆包TTS客户端（向后兼容）"""
    return DoubaoTTSClient(timeout_seconds=timeout_seconds)


def create_doubao_podcast_client(timeout_seconds: int = 60) -> DoubaoPodcastClient:
    """创建豆包播客客户端（向后兼容）"""
    return DoubaoPodcastClient(timeout_seconds=timeout_seconds)


# 环境变量检查函数
def check_doubao_env() -> bool:
    """检查豆包TTS环境变量"""
    required_vars = ["DOUBAO_APP_ID", "DOUBAO_ACCESS_KEY", "DOUBAO_SECRET_KEY", "DOUBAO_REGION"]
    return all(os.environ.get(var) for var in required_vars)


def get_doubao_env_status() -> Dict[str, bool]:
    """获取豆包TTS环境变量状态"""
    required_vars = ["DOUBAO_APP_ID", "DOUBAO_ACCESS_KEY", "DOUBAO_SECRET_KEY", "DOUBAO_REGION"]
    return {var: bool(os.environ.get(var)) for var in required_vars}
