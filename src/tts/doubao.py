"""
Doubao TTS Protocol Implementation

这个文件实现了豆包TTS服务的协议层封装，包含各种API调用和WebSocket通信。

功能概述：
- 实现豆包TTS的HTTP和WebSocket协议
- 支持多种TTS模式和语音合成方法
- 提供VoiceClone语音克隆功能
- 完整的错误处理和重试机制

主要类：
- DoubaoTTSClient: 豆包TTS客户端（WebSocket模式）
- DoubaoPodcastClient: 豆包播客客户端（HTTP模式）
- DoubaoTTSConfig: TTS配置数据类

支持的API：
- submit_v3_ws(): WebSocket V3提交任务
- generate_mp3(): HTTP播客合成
- generate_mp3_voiceclone_http(): VoiceClone合成
- generate_mp3_v3_unidirectional_http(): V3单向HTTP合成

协议特性：
- 支持长文本分块处理
- WebSocket双向通信
- 音频数据压缩和编码
- 任务状态轮询机制

使用示例：
    client = DoubaoTTSClient(timeout_seconds=60)
    audio_data = client.synthesize(ssml="<speak>你好</speak>", voice="BV001_streaming")

注意事项：
- 需要有效的豆包API密钥配置
- 支持多种语音模型和音色
- 包含完整的SSML处理功能

作者：Auto-Podcast Team
版本：2.0.0
更新：2025-12-25
"""

from __future__ import annotations

import base64
import gzip
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import requests
import websocket

log = logging.getLogger(__name__)


class DoubaoTTSException(RuntimeError):
    pass


@dataclass
class DoubaoTTSConfig:
    app_id: str
    access_key: str
    secret_key: str
    region: str


class DoubaoTTSClient:
    def __init__(self, timeout_seconds: int, config: Optional[Dict[str, Any]] = None):
        self.timeout_seconds = timeout_seconds
        
        # 从配置加载器获取配置
        if config is None:
            from src.utils.config_helper import get_tts_config
            tts_config = get_tts_config()
            config = tts_config.get("doubao", {})
        
        self.config = config
        self.cfg = DoubaoTTSConfig(
            app_id=str(config.get("app_id", "")).strip(),
            access_key=config.get("access_key", "").strip(),
            secret_key=config.get("secret_key", "").strip(),
            region=config.get("region", "cn-north-1").strip(),
        )
        self._conns: Dict[str, websocket.WebSocket] = {}
        self._payloads: Dict[str, Dict[str, Any]] = {}

    def _ws_url(self) -> str:
        podcast_config = self.config.get("podcast", {})
        return podcast_config.get("ws_url", "wss://openspeech.bytedance.com/api/v3/sami/podcasttts").strip()

    def _ws_headers(self) -> Dict[str, str]:
        # From the doc: Podcast API websocket v3
        podcast_config = self.config.get("podcast", {})
        resource_id = podcast_config.get("resource_id", "volc.service_type.10050").strip()
        app_key = podcast_config.get("app_key", "aGjiRDfUWi").strip()
        sequence = str(podcast_config.get("sequence", "1")).strip() or "1"
        return {
            "X-Api-App-Id": self.cfg.app_id,
            "X-Api-Access-Key": self.cfg.access_key,
            "X-Api-Resource-Id": resource_id,
            "X-Api-App-Key": app_key,
            "X-Api-Request-Id": str(uuid.uuid4()),
            "X-Api-Sequence": sequence,
        }

    @staticmethod
    def _pick_voice(voice: str) -> str:
        v = (voice or "").strip()
        if not v:
            return ""
        if "," in v:
            return (v.split(",", 1)[0] or "").strip()
        return v

    @staticmethod
    def _split_text_utf8(text: str, max_bytes: int) -> list[str]:
        s = (text or "").strip()
        if not s:
            return []

        out: list[str] = []
        cur_chars: list[str] = []
        cur_bytes = 0
        for ch in s:
            b = len(ch.encode("utf-8"))
            if cur_chars and (cur_bytes + b) > max_bytes:
                out.append("".join(cur_chars).strip())
                cur_chars = [ch]
                cur_bytes = b
            else:
                cur_chars.append(ch)
                cur_bytes += b
        if cur_chars:
            out.append("".join(cur_chars).strip())
        return [x for x in out if x]

    @staticmethod
    def _strip_ssml(ssml: str) -> str:
        # Keep it simple: remove angle-bracket tags.
        out = []
        in_tag = False
        for ch in ssml:
            if ch == "<":
                in_tag = True
                continue
            if ch == ">":
                in_tag = False
                continue
            if not in_tag:
                out.append(ch)
        return "".join(out).strip()

    @staticmethod
    def _unwrap_speak(ssml: str) -> str:
        import re

        s = (ssml or "").strip()
        m = re.match(r"^\s*<\s*speak\b[^>]*>(.*)<\s*/\s*speak\s*>\s*$", s, flags=re.IGNORECASE | re.DOTALL)
        if m:
            return (m.group(1) or "").strip()
        return s

    @staticmethod
    def _split_ssml_chunks(ssml: str, max_chars: int) -> list[str]:
        import re

        if max_chars <= 0:
            return [ssml]

        s = (ssml or "").strip()
        if not s:
            return []

        s = re.sub(r"<\s*breaktime\b", "<break", s, flags=re.IGNORECASE)
        s = re.sub(r"</\s*breaktime\s*>", "</break>", s, flags=re.IGNORECASE)
        inner = DoubaoTTSClient._unwrap_speak(s)

        tokens: list[str] = []
        i = 0
        n = len(inner)
        while i < n:
            if inner[i] != "<":
                j = inner.find("<", i)
                if j < 0:
                    j = n
                t = inner[i:j]
                if t:
                    tokens.append(t)
                i = j
                continue
            j = inner.find(">", i)
            if j < 0:
                tokens.append(inner[i:])
                break
            tag = inner[i : j + 1]
            low = tag.lower()
            if low.startswith("<break"):
                tokens.append(tag)
            i = j + 1

        overhead = len("<speak></speak>")
        budget = max(1, max_chars - overhead)

        def wrap(content: str) -> str:
            return f"<speak>{(content or '').strip()}</speak>"

        out: list[str] = []
        cur: list[str] = []
        cur_len = 0

        def flush() -> None:
            nonlocal cur, cur_len
            if not cur:
                return
            out.append(wrap("".join(cur)))
            cur = []
            cur_len = 0

        def add_piece(piece: str) -> None:
            nonlocal cur_len
            if not piece:
                return
            if cur and (cur_len + len(piece)) > budget:
                flush()
            if len(piece) > budget:
                k = 0
                while k < len(piece):
                    seg = piece[k : k + budget]
                    if seg.strip():
                        out.append(wrap(seg))
                    k += budget
                return
            cur.append(piece)
            cur_len += len(piece)

        for tok in tokens:
            if tok.lstrip().startswith("<"):
                add_piece(tok)
                continue
            parts = re.split(r"([。！？.!?；;\n])", tok)
            buf = ""
            for p in parts:
                if not p:
                    continue
                buf += p
                if p in {"。", "！", "？", ".", "!", "?", "；", ";", "\n"}:
                    add_piece(buf)
                    buf = ""
            if buf:
                add_piece(buf)
        flush()
        return [x for x in out if x and x.strip()]

    @staticmethod
    def _build_frame(message_type: int, flags: int, serialization: int, compression: int, payload: bytes) -> bytes:
        # Base header 4 bytes.
        # Byte0: version=1 (0b0001), header_size=1 (4 bytes)
        b0 = (0x1 << 4) | 0x1
        # Byte1: message type (4-bit) + flags (4-bit)
        b1 = ((message_type & 0xF) << 4) | (flags & 0xF)
        # Byte2: serialization (4-bit) + compression (4-bit)
        b2 = ((serialization & 0xF) << 4) | (compression & 0xF)
        b3 = 0

        # Payload size uses big-endian uint32.
        size = len(payload).to_bytes(4, byteorder="big", signed=False)
        return bytes([b0, b1, b2, b3]) + size + payload

    @staticmethod
    def _build_event_frame(
        message_type: int,
        flags: int,
        serialization: int,
        compression: int,
        event_code: int,
        session_id: Optional[str],
        payload: bytes,
    ) -> bytes:
        b0 = (0x1 << 4) | 0x1
        b1 = ((message_type & 0xF) << 4) | (flags & 0xF)
        b2 = ((serialization & 0xF) << 4) | (compression & 0xF)
        b3 = 0

        out = bytearray()
        out += bytes([b0, b1, b2, b3])
        out += int(event_code).to_bytes(4, byteorder="big", signed=False)

        if session_id is not None:
            sid_b = session_id.encode("utf-8")
            out += len(sid_b).to_bytes(4, byteorder="big", signed=False)
            out += sid_b

        out += len(payload).to_bytes(4, byteorder="big", signed=False)
        out += payload
        return bytes(out)

    @staticmethod
    def _parse_frame(raw: bytes) -> Tuple[int, int, int, int, Optional[int], bytes]:
        if len(raw) < 8:
            raise DoubaoTTSException("invalid websocket frame")

        b0, b1, b2, _b3 = raw[0], raw[1], raw[2], raw[3]
        _version = (b0 >> 4) & 0xF
        header_size_x4 = b0 & 0xF
        header_size_bytes = header_size_x4 * 4
        msg_type = (b1 >> 4) & 0xF
        flags = b1 & 0xF
        serialization = (b2 >> 4) & 0xF
        compression = b2 & 0xF

        if len(raw) < header_size_bytes + 4:
            raise DoubaoTTSException("invalid frame: header too short")

        idx = header_size_bytes
        event_code: Optional[int] = None

        if msg_type == 0xB:
            if flags & 0x4:
                if len(raw) < idx + 4:
                    raise DoubaoTTSException("invalid audio frame: missing event code")
                event_code = int.from_bytes(raw[idx : idx + 4], byteorder="big", signed=False)
                idx += 4

                if len(raw) < idx + 4:
                    raise DoubaoTTSException("invalid audio frame: missing session_id len")
                sid_len = int.from_bytes(raw[idx : idx + 4], byteorder="big", signed=False)
                idx += 4
                if sid_len < 0 or sid_len > 2048 or len(raw) < idx + sid_len:
                    raise DoubaoTTSException("invalid audio frame: bad session_id len")
                idx += sid_len

                if len(raw) < idx + 4:
                    raise DoubaoTTSException("invalid audio frame: missing payload size")
                payload_size = int.from_bytes(raw[idx : idx + 4], byteorder="big", signed=False)
                idx += 4
                payload = raw[idx : idx + payload_size]
                return msg_type, flags, serialization, compression, event_code, payload

            seq: Optional[int] = None
            if flags in {0x1, 0x2, 0x3}:
                if len(raw) < idx + 4:
                    raise DoubaoTTSException("invalid audio frame: missing sequence")
                seq = int.from_bytes(raw[idx : idx + 4], byteorder="big", signed=True)
                idx += 4

            if len(raw) < idx + 4:
                raise DoubaoTTSException("invalid audio frame: missing payload size")
            payload_size = int.from_bytes(raw[idx : idx + 4], byteorder="big", signed=False)
            idx += 4
            payload = raw[idx : idx + payload_size]
            return msg_type, flags, serialization, compression, seq, payload

        # Error frame: doc says byte1 is 0b11110000, and [4~7] is Error code.
        if msg_type == 0xF:
            if len(raw) < idx + 4:
                raise DoubaoTTSException("invalid error frame: missing error code")
            event_code = int.from_bytes(raw[idx : idx + 4], byteorder="big", signed=False)
            idx += 4

        if msg_type == 0xF:
            if len(raw) < idx + 4:
                raise DoubaoTTSException("invalid frame: missing payload size")
            payload_size = int.from_bytes(raw[idx : idx + 4], byteorder="big", signed=False)
            idx += 4
            payload = raw[idx : idx + payload_size]
            return msg_type, flags, serialization, compression, event_code, payload

        if flags & 0x4:
            if len(raw) < idx + 4:
                raise DoubaoTTSException("invalid frame: missing event code")
            event_code = int.from_bytes(raw[idx : idx + 4], byteorder="big", signed=False)
            idx += 4

            if len(raw) < idx + 4:
                raise DoubaoTTSException("invalid frame: missing session_id len")
            maybe_sid_len = int.from_bytes(raw[idx : idx + 4], byteorder="big", signed=False)

            if len(raw) >= idx + 4 + maybe_sid_len + 4:
                sid_len = maybe_sid_len
                idx += 4
                if sid_len > 2048 or len(raw) < idx + sid_len + 4:
                    raise DoubaoTTSException("invalid frame: bad session_id len")
                idx += sid_len

            if len(raw) < idx + 4:
                raise DoubaoTTSException("invalid frame: missing payload size")
            payload_size = int.from_bytes(raw[idx : idx + 4], byteorder="big", signed=False)
            idx += 4
            payload = raw[idx : idx + payload_size]
            return msg_type, flags, serialization, compression, event_code, payload

        if len(raw) < idx + 4:
            raise DoubaoTTSException("invalid frame: missing payload size")
        payload_size = int.from_bytes(raw[idx : idx + 4], byteorder="big", signed=False)
        idx += 4
        payload = raw[idx : idx + payload_size]
        return msg_type, flags, serialization, compression, event_code, payload

    @staticmethod
    def _maybe_decompress(payload: bytes, compression: int) -> bytes:
        if not payload:
            return payload
        # 0b0000: none, 0b0001: gzip
        if compression == 0x1:
            try:
                return gzip.decompress(payload)
            except Exception as e:  # noqa: BLE001
                raise DoubaoTTSException("gzip decompress failed") from e
        return payload

    def submit(self, ssml: str, voice: str) -> str:
        # Doc uses Access Token (X-Api-Access-Key). secret_key is not required for this websocket API,
        # but we keep it for compatibility with other Volcengine auth styles.
        if not (self.cfg.app_id and self.cfg.access_key) or self.cfg.access_key in {"replace_me", "你的token"}:
            raise DoubaoTTSException(
                "Doubao TTS not configured: set DOUBAO_APP_ID and DOUBAO_ACCESS_KEY (access token)"
            )

        task_id = str(uuid.uuid4())
        text = self._strip_ssml(ssml)
        if not text:
            raise DoubaoTTSException("empty ssml/text")

        if len(text.encode("utf-8")) > 1024:
            raise DoubaoTTSException("text too long for single doubao websocket request; use synthesize()")

        chosen_voice = self._pick_voice(voice)
        cluster = (os.environ.get("DOUBAO_CLUSTER") or "volcano_tts_test").strip() or "volcano_tts_test"

        req: Dict[str, Any] = {
            "app": {"appid": self.cfg.app_id, "token": "access_token", "cluster": cluster},
            "user": {"uid": "auto-podcast"},
            "audio": {
                "voice": chosen_voice or "",
                "voice_type": chosen_voice or "",
                "encoding": "mp3",
                "rate": 24000,
                "bits": 16,
                "bitrate": 160,
            },
            "request": {
                "reqid": task_id,
                "text": text,
                "text_type": "plain",
                "operation": "submit",
            },
        }

        headers = self._ws_headers()
        header_list = [f"{k}: {v}" for k, v in headers.items()]

        trace = (os.environ.get("DOUBAO_WS_TRACE") or "").strip().lower()
        if trace in {"1", "true", "yes", "on"}:
            try:
                websocket.enableTrace(True)
            except Exception:
                pass

        try:
            ws = websocket.create_connection(self._ws_url(), header=header_list, timeout=self.timeout_seconds)
            ws.settimeout(self.timeout_seconds)
        except Exception as e:  # noqa: BLE001
            raise DoubaoTTSException("Doubao websocket connect failed") from e

        payload_bytes = json.dumps(req, ensure_ascii=False).encode("utf-8")
        ws.send(
            self._build_frame(
                message_type=0x1,
                flags=0x0,
                serialization=0x1,
                compression=0x0,
                payload=payload_bytes,
            ),
            opcode=websocket.ABNF.OPCODE_BINARY,
        )

        self._conns[task_id] = ws
        self._payloads[task_id] = req
        return task_id

    def poll(self, task_id: str, max_wait_seconds: int = 600, interval_seconds: int = 3) -> bytes:
        if not task_id:
            raise DoubaoTTSException("task_id is empty")

        ws = self._conns.get(task_id)
        if ws is None:
            raise DoubaoTTSException("unknown task_id in current process; submit() and poll() must run together")

        deadline = time.time() + max_wait_seconds
        audio_chunks: list[bytes] = []
        last_json: Optional[Dict[str, Any]] = None

        try:
            while time.time() < deadline:
                try:
                    raw = ws.recv()
                except websocket.WebSocketTimeoutException:
                    time.sleep(interval_seconds)
                    continue
                except websocket.WebSocketConnectionClosedException as e:
                    code = getattr(ws, "close_status_code", None)
                    reason = getattr(ws, "close_reason", None)
                    if audio_chunks:
                        return b"".join(audio_chunks)
                    raise DoubaoTTSException(f"Doubao websocket closed code={code} reason={reason}") from e

                if raw is None:
                    break
                if isinstance(raw, str):
                    raw = raw.encode("utf-8")

                msg_type, flags, serialization, _compression, event, payload = self._parse_frame(raw)

                if msg_type == 0xF:
                    err_code = event
                    payload2 = self._maybe_decompress(payload, _compression)
                    msg = payload2.decode("utf-8", errors="ignore") if payload2 else ""
                    raise DoubaoTTSException(f"Doubao error frame code={err_code} msg={msg}")

                if msg_type == 0xB and payload:
                    audio_chunks.append(payload)
                    if flags in {0x2, 0x3}:
                        return b"".join(audio_chunks)
                    if isinstance(event, int) and int(event) < 0:
                        return b"".join(audio_chunks)
                    continue

                if event == 361 and payload:
                    audio_chunks.append(payload)
                    continue

                if serialization == 0x0 and payload:
                    audio_chunks.append(payload)
                    continue

                if serialization == 0x1 and payload:
                    payload2 = self._maybe_decompress(payload, _compression)
                    try:
                        obj = json.loads(payload2.decode("utf-8"))
                    except Exception:
                        obj = {"raw": payload2.decode("utf-8", errors="ignore")}
                    last_json = obj if isinstance(obj, dict) else {"data": obj}

                    if isinstance(last_json, dict) and isinstance(last_json.get("data"), str):
                        try:
                            audio_chunks.append(base64.b64decode(last_json["data"]))
                        except Exception:
                            pass

                    if isinstance(last_json, dict) and isinstance(last_json.get("sequence"), int):
                        if int(last_json["sequence"]) < 0 and audio_chunks:
                            return b"".join(audio_chunks)

                    # PodcastEnd may contain meta_info.audio_url
                    if event == 363:
                        meta = (last_json.get("meta_info") or {}) if isinstance(last_json, dict) else {}
                        audio_url = (meta.get("audio_url") or "").strip() if isinstance(meta, dict) else ""
                        if audio_url:
                            a = requests.get(audio_url, timeout=self.timeout_seconds)
                            a.raise_for_status()
                            return a.content

                    continue

            if audio_chunks:
                return b"".join(audio_chunks)

            raise DoubaoTTSException(f"Doubao poll ended without audio (last={last_json})")
        finally:
            try:
                try:
                    ws.send(
                        self._build_frame(
                            message_type=0x1,
                            flags=0x0,
                            serialization=0x1,
                            compression=0x0,
                            payload=b"{}",
                        ),
                        opcode=websocket.ABNF.OPCODE_BINARY,
                    )
                except Exception:
                    pass

                try:
                    # Best-effort wait for ConnectionFinished (event=52)
                    end_deadline = time.time() + 2
                    while time.time() < end_deadline:
                        try:
                            raw2 = ws.recv()
                        except websocket.WebSocketTimeoutException:
                            break
                        if raw2 is None:
                            break
                        if isinstance(raw2, str):
                            raw2 = raw2.encode("utf-8")
                        try:
                            _mt, _fl, _ser, _cmp, ev2, _pl = self._parse_frame(raw2)
                        except Exception:
                            continue
                        if ev2 == 52:
                            break
                except Exception:
                    pass

                ws.close()
            except Exception:
                pass
            self._conns.pop(task_id, None)
            self._payloads.pop(task_id, None)

    def synthesize(self, ssml: str, voice: str) -> bytes:
        text = self._strip_ssml(ssml)
        parts = self._split_text_utf8(text, max_bytes=900)
        if not parts:
            raise DoubaoTTSException("empty ssml/text")

        out_chunks: list[bytes] = []
        for part in parts:
            task_id = self.submit(ssml=part, voice=voice)
            out_chunks.append(self.poll(task_id=task_id))
        return b"".join(out_chunks)

    def _tts_v3_ws_url(self) -> str:
        explicit = (os.environ.get("DOUBAO_TTS_V3_WS_URL") or "").strip()
        if explicit:
            return explicit

        ws_url = (os.environ.get("DOUBAO_WS_URL") or "").strip()
        if "/tts/unidirectional/stream" in ws_url:
            return ws_url

        return "wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream"

    def _tts_v3_ws_headers(self) -> Dict[str, str]:
        resource_id = (
            os.environ.get("DOUBAO_TTS_V3_RESOURCE_ID") or os.environ.get("DOUBAO_TTS_RESOURCE_ID") or ""
        ).strip()
        if not resource_id:
            fallback = (os.environ.get("DOUBAO_RESOURCE_ID") or "").strip()
            if fallback and fallback != "volc.service_type.10050":
                resource_id = fallback

        if not resource_id:
            raise DoubaoTTSException(
                "Doubao TTS V3 WS requires a TTS resource id: set DOUBAO_TTS_V3_RESOURCE_ID (e.g. volc.service_type.10029/10048)."
            )

        app_key = (
            os.environ.get("DOUBAO_TTS_V3_WS_APP_KEY")
            or os.environ.get("DOUBAO_WS_APP_KEY")
            or "aGjiRDfUWi"
        ).strip()

        headers = {
            "Authorization": f"Bearer; {self.cfg.access_key}",
            "X-Api-App-Key": app_key,
            "X-Api-Request-Id": str(uuid.uuid4()),
        }
        if self.cfg.app_id:
            headers["X-Api-App-Id"] = self.cfg.app_id
        if self.cfg.access_key:
            headers["X-Api-Access-Key"] = self.cfg.access_key
        headers["X-Api-Resource-Id"] = resource_id
        return headers

    def submit_v3_ws(self, ssml: str, voice: str) -> str:
        if not (self.cfg.app_id and self.cfg.access_key) or self.cfg.access_key in {"replace_me", "你的token"}:
            raise DoubaoTTSException(
                "Doubao TTS not configured: set DOUBAO_APP_ID and DOUBAO_ACCESS_KEY (access token)"
            )

        task_id = str(uuid.uuid4())
        text = self._strip_ssml(ssml)
        if not text:
            raise DoubaoTTSException("empty ssml/text")

        if len(text.encode("utf-8")) > 1024:
            raise DoubaoTTSException("text too long for single doubao websocket request; use synthesize()")

        chosen_voice = self._pick_voice(voice)
        if not chosen_voice:
            raise DoubaoTTSException("Doubao TTS voice_type is empty")

        cluster = (os.environ.get("DOUBAO_TTS_CLUSTER") or "volcano_tts").strip() or "volcano_tts"
        encoding = (os.environ.get("DOUBAO_TTS_ENCODING") or "mp3").strip() or "mp3"
        rate = int(os.environ.get("DOUBAO_TTS_RATE") or "24000")
        speed_ratio = float(os.environ.get("DOUBAO_TTS_SPEED_RATIO") or "1.0")

        req: Dict[str, Any] = {
            "app": {"appid": self.cfg.app_id, "token": "access_token", "cluster": cluster},
            "user": {"uid": "auto-podcast"},
            "audio": {
                "voice_type": chosen_voice,
                "encoding": encoding,
                "rate": rate,
                "speed_ratio": speed_ratio,
            },
            "request": {"reqid": task_id, "text": text, "operation": "submit"},
        }

        headers = self._tts_v3_ws_headers()
        header_list = [f"{k}: {v}" for k, v in headers.items()]

        trace = (os.environ.get("DOUBAO_WS_TRACE") or "").strip().lower()
        if trace in {"1", "true", "yes", "on"}:
            try:
                websocket.enableTrace(True)
            except Exception:
                pass

        try:
            ws = websocket.create_connection(self._tts_v3_ws_url(), header=header_list, timeout=self.timeout_seconds)
            ws.settimeout(self.timeout_seconds)
        except Exception as e:  # noqa: BLE001
            raise DoubaoTTSException("Doubao websocket connect failed") from e

        payload_bytes = json.dumps(req, ensure_ascii=False).encode("utf-8")
        ws.send(
            self._build_frame(
                message_type=0x1,
                flags=0x0,
                serialization=0x1,
                compression=0x0,
                payload=payload_bytes,
            ),
            opcode=websocket.ABNF.OPCODE_BINARY,
        )

        self._conns[task_id] = ws
        self._payloads[task_id] = req
        return task_id

    def synthesize_v3_ws(self, ssml: str, voice: str) -> bytes:
        text = self._strip_ssml(ssml)
        parts = self._split_text_utf8(text, max_bytes=900)
        if not parts:
            raise DoubaoTTSException("empty ssml/text")

        out_chunks: list[bytes] = []
        for part in parts:
            task_id = self.submit_v3_ws(ssml=part, voice=voice)
            out_chunks.append(self.poll(task_id=task_id))
        return b"".join(out_chunks)


class DoubaoPodcastClient:
    def __init__(self, timeout_seconds: int):
        self.timeout_seconds = timeout_seconds
        self.cfg = DoubaoTTSConfig(
            app_id=os.environ.get("DOUBAO_APP_ID", "").strip(),
            access_key=os.environ.get("DOUBAO_ACCESS_KEY", "").strip(),
            secret_key=os.environ.get("DOUBAO_SECRET_KEY", "").strip(),
            region=os.environ.get("DOUBAO_REGION", "").strip() or "cn-north-1",
        )

    @staticmethod
    def _truthy(v: str) -> bool:
        s = (v or "").strip().lower()
        return s in {"1", "true", "yes", "on"}

    def _voiceclone_http_url(self) -> str:
        return (os.environ.get("DOUBAO_VOICECLONE_URL") or "https://openspeech.bytedance.com/api/v1/tts").strip()

    def generate_mp3_voiceclone_http(self, *, input_text: str, speaker_id: str = "") -> bytes:
        api_key = (os.environ.get("DOUBAO_VOICECLONE_API_KEY") or "").strip()
        if not api_key or api_key in {"replace_me", "你的token"}:
            raise DoubaoTTSException("Voice clone not configured: set DOUBAO_VOICECLONE_API_KEY")

        sid = (speaker_id or "").strip() or (os.environ.get("DOUBAO_VOICECLONE_SPEAKER_ID") or "").strip()
        if not sid:
            raise DoubaoTTSException("Voice clone speaker_id is empty. Set DOUBAO_VOICECLONE_SPEAKER_ID or pass speaker_id.")

        txt = (input_text or "").strip()
        if not txt:
            raise DoubaoTTSException("empty input_text")

        cluster = (os.environ.get("DOUBAO_VOICECLONE_CLUSTER") or "volcano_icl").strip() or "volcano_icl"
        uid = (os.environ.get("DOUBAO_VOICECLONE_UID") or "auto_podcast").strip() or "auto_podcast"
        encoding = (os.environ.get("DOUBAO_VOICECLONE_ENCODING") or "mp3").strip() or "mp3"
        speed_ratio_raw = (os.environ.get("DOUBAO_VOICECLONE_SPEED_RATIO") or "1.0").strip() or "1.0"
        try:
            speed_ratio = float(speed_ratio_raw)
        except Exception:
            speed_ratio = 1.0

        strip_ssml_raw = os.environ.get("DOUBAO_VOICECLONE_STRIP_SSML")
        if strip_ssml_raw is None or not strip_ssml_raw.strip():
            strip_ssml = True
        else:
            strip_ssml = self._truthy(strip_ssml_raw)

        is_ssml = ("<" in txt and ">" in txt)
        if strip_ssml and is_ssml:
            txt_send = (DoubaoTTSClient._strip_ssml(txt) or "").strip()
        else:
            txt_send = txt

        rate_raw = (os.environ.get("DOUBAO_VOICECLONE_RATE") or "").strip()
        rate: int | None
        try:
            rate = int(rate_raw) if rate_raw else None
        except Exception:
            rate = None

        loudness_raw = (os.environ.get("DOUBAO_VOICECLONE_LOUDNESS_RATIO") or "").strip()
        loudness_ratio: float | None
        try:
            loudness_ratio = float(loudness_raw) if loudness_raw else None
        except Exception:
            loudness_ratio = None

        explicit_language = (os.environ.get("DOUBAO_VOICECLONE_EXPLICIT_LANGUAGE") or "").strip()
        context_language = (os.environ.get("DOUBAO_VOICECLONE_CONTEXT_LANGUAGE") or "").strip()

        split_sentence_raw = (os.environ.get("DOUBAO_VOICECLONE_SPLIT_SENTENCE") or "").strip()
        split_sentence = self._truthy(split_sentence_raw) if split_sentence_raw else False

        extra_param = (os.environ.get("DOUBAO_VOICECLONE_EXTRA_PARAM") or "").strip()

        url = self._voiceclone_http_url()
        headers = {
            "X-Api-Key": api_key,
            "x-api-key": api_key,
            "Content-Type": "application/json",
        }

        max_bytes_raw = (os.environ.get("DOUBAO_VOICECLONE_MAX_BYTES") or "").strip()
        try:
            max_bytes = int(max_bytes_raw) if max_bytes_raw else 600
        except Exception:
            max_bytes = 600
        if max_bytes < 80:
            max_bytes = 80

        min_bytes_raw = (os.environ.get("DOUBAO_VOICECLONE_MIN_BYTES") or "").strip()
        try:
            min_bytes = int(min_bytes_raw) if min_bytes_raw else 120
        except Exception:
            min_bytes = 120
        if min_bytes < 40:
            min_bytes = 40

        retries_raw = (os.environ.get("DOUBAO_VOICECLONE_RETRIES") or "").strip()
        try:
            retries = int(retries_raw) if retries_raw else 1
        except Exception:
            retries = 1
        if retries < 0:
            retries = 0
        if retries > 5:
            retries = 5

        backoff_raw = (os.environ.get("DOUBAO_VOICECLONE_RETRY_BACKOFF_SECONDS") or "").strip()
        try:
            backoff_s = float(backoff_raw) if backoff_raw else 1.0
        except Exception:
            backoff_s = 1.0
        if backoff_s < 0:
            backoff_s = 0
        if backoff_s > 30:
            backoff_s = 30

        def _post_once(text_part: str) -> bytes:
            app_obj: Dict[str, Any] = {"cluster": cluster}
            if self.cfg.app_id:
                app_obj["appid"] = self.cfg.app_id
                app_obj["token"] = "access_token"

            audio_obj: Dict[str, Any] = {
                "voice_type": sid,
                "encoding": encoding,
                "speed_ratio": speed_ratio,
            }
            if rate is not None:
                audio_obj["rate"] = rate
            if loudness_ratio is not None:
                audio_obj["loudness_ratio"] = loudness_ratio
            if explicit_language:
                audio_obj["explicit_language"] = explicit_language
            if context_language:
                audio_obj["context_language"] = context_language

            req_obj: Dict[str, Any] = {
                "reqid": uuid.uuid4().hex,
                "text": text_part,
                "operation": "query",
            }
            if split_sentence:
                req_obj["split_sentence"] = 1
            if extra_param:
                req_obj["extra_param"] = extra_param

            req_body: Dict[str, Any] = {
                "app": app_obj,
                "user": {"uid": uid},
                "audio": audio_obj,
                "request": req_obj,
            }

            if is_ssml and not strip_ssml:
                req_body["request"]["text_type"] = "ssml"

            r = requests.post(url, headers=headers, json=req_body, timeout=self.timeout_seconds)
            body = ""
            try:
                body = (r.text or "").strip()
            except Exception:
                body = ""
            if len(body) > 2000:
                body = body[:2000] + "..."

            obj: Any = None
            try:
                obj = r.json()
            except Exception:
                obj = None

            code: int | None = None
            msg: str | None = None
            if isinstance(obj, dict):
                v_code = obj.get("code")
                if isinstance(v_code, int):
                    code = v_code
                v_msg = obj.get("message")
                if isinstance(v_msg, str):
                    msg = v_msg

            if not r.ok:
                if code == 3031:
                    raise DoubaoTTSException(f"__VOICECLONE_TIMEOUT__ status={r.status_code} code={code} message={msg} url={url}")
                raise DoubaoTTSException(f"Voice clone HTTP failed status={r.status_code} url={url} body={body}")

            if not isinstance(obj, dict):
                raise DoubaoTTSException("Voice clone HTTP response is not a JSON object")

            if isinstance(code, int) and code not in {0, 3000}:
                if code == 3031:
                    raise DoubaoTTSException(f"__VOICECLONE_TIMEOUT__ status={r.status_code} code={code} message={msg} url={url}")
                raise DoubaoTTSException(f"Voice clone HTTP failed code={code} message={msg}")
            if code is None:
                base = obj.get("BaseResp")
                if isinstance(base, dict):
                    sc = base.get("StatusCode")
                    sm = base.get("StatusMessage")
                    if isinstance(sc, int) and sc != 0:
                        raise DoubaoTTSException(f"Voice clone HTTP failed status_code={sc} message={sm}")

            data_b64 = obj.get("data")
            if not isinstance(data_b64, str) or not data_b64.strip():
                raise DoubaoTTSException("Voice clone HTTP response missing base64 audio field 'data'")
            try:
                return base64.b64decode(data_b64)
            except Exception as e:  # noqa: BLE001
                raise DoubaoTTSException("Voice clone HTTP base64 decode failed") from e

        def _post_with_retry(text_part: str) -> bytes:
            last_err: Exception | None = None
            for i in range(retries + 1):
                try:
                    return _post_once(text_part)
                except Exception as e:  # noqa: BLE001
                    last_err = e
                    if "__VOICECLONE_TIMEOUT__" in str(e):
                        raise
                    if i >= retries:
                        raise
                    if backoff_s > 0:
                        time.sleep(backoff_s * (2**i))
            if last_err is not None:
                raise last_err
            raise DoubaoTTSException("Voice clone HTTP retry failed")

        def _synthesize_part(text_part: str, depth: int) -> bytes:
            b_len = len((text_part or "").encode("utf-8"))
            if depth > 8:
                return _post_with_retry(text_part)
            try:
                return _post_with_retry(text_part)
            except Exception as e:  # noqa: BLE001
                if "__VOICECLONE_TIMEOUT__" not in str(e):
                    raise
                if b_len <= min_bytes:
                    raise
                sub_parts = DoubaoTTSClient._split_text_utf8(text_part, max_bytes=max(min_bytes, b_len // 2))
                if len(sub_parts) <= 1:
                    raise
                out = bytearray()
                for sp in sub_parts:
                    out += _synthesize_part(sp, depth + 1)
                return bytes(out)

        parts = DoubaoTTSClient._split_text_utf8(txt_send, max_bytes=max_bytes)
        if not parts:
            raise DoubaoTTSException("empty input_text")
        out_all = bytearray()
        for p in parts:
            out_all += _synthesize_part(p, 0)
        return bytes(out_all)

    def _ws_url(self) -> str:
        return (os.environ.get("DOUBAO_WS_URL") or "wss://openspeech.bytedance.com/api/v3/sami/podcasttts").strip()

    def _ws_headers(self) -> Dict[str, str]:
        resource_id = (os.environ.get("DOUBAO_RESOURCE_ID") or "volc.service_type.10050").strip()
        app_key = (os.environ.get("DOUBAO_WS_APP_KEY") or "aGjiRDfUWi").strip()
        sequence = (os.environ.get("DOUBAO_WS_SEQUENCE") or "1").strip() or "1"
        return {
            "X-Api-App-Id": self.cfg.app_id,
            "X-Api-Access-Key": self.cfg.access_key,
            "X-Api-Resource-Id": resource_id,
            "X-Api-App-Key": app_key,
            "X-Api-Request-Id": str(uuid.uuid4()),
            "X-Api-Sequence": sequence,
        }

    @staticmethod
    def _pick_speakers() -> list[str]:
        raw = (os.environ.get("DOUBAO_PODCAST_SPEAKERS") or os.environ.get("DOUBAO_TTS_VOICE") or "").strip()
        if raw:
            parts = [p.strip() for p in raw.split(",") if p.strip()]
            if len(parts) >= 2:
                return [parts[0], parts[1]]
        return [
            "zh_male_dayixiansheng_v2_saturn_bigtts",
            "zh_female_mizaitongxue_v2_saturn_bigtts",
        ]

    def _tts_v3_unidirectional_url(self) -> str:
        return (os.environ.get("DOUBAO_TTS_V3_URL") or "https://openspeech.bytedance.com/api/v3/tts/unidirectional").strip()

    def generate_mp3_v3_unidirectional_http(self, *, input_text: str, speaker: str = "") -> bytes:
        if not (self.cfg.app_id and self.cfg.access_key) or self.cfg.access_key in {"replace_me", "你的token"}:
            raise DoubaoTTSException(
                "Doubao TTS V3 not configured: set DOUBAO_APP_ID and DOUBAO_ACCESS_KEY (access token)"
            )

        txt = (input_text or "").strip()
        if not txt:
            raise DoubaoTTSException("empty input_text")

        tts_version = (os.environ.get("DOUBAO_TTS_VERSION") or "1").strip() or "1"
        explicit_resource_id = (os.environ.get("DOUBAO_TTS_V3_RESOURCE_ID") or "").strip()
        if explicit_resource_id:
            resource_id = explicit_resource_id
        else:
            if tts_version == "2":
                resource_id = (os.environ.get("DOUBAO_TTS_V2_RESOURCE_ID") or "seed-tts-2.0").strip() or "seed-tts-2.0"
            else:
                resource_id = (os.environ.get("DOUBAO_TTS_V1_RESOURCE_ID") or "seed-tts-1.0").strip() or "seed-tts-1.0"
        if resource_id == "volc.service_type.10050":
            raise DoubaoTTSException(
                "Doubao TTS V3 resource_id is set to podcast (volc.service_type.10050). "
                "Set DOUBAO_TTS_V3_RESOURCE_ID to seed-tts-1.0 / seed-tts-1.0-concurr / seed-tts-2.0 / volc.service_type.10029 / volc.service_type.10048."
            )

        audio_format = (os.environ.get("DOUBAO_TTS_V3_FORMAT") or os.environ.get("DOUBAO_PODCAST_FORMAT") or "mp3").strip() or "mp3"
        sample_rate = int(os.environ.get("DOUBAO_TTS_V3_SAMPLE_RATE") or os.environ.get("DOUBAO_PODCAST_SAMPLE_RATE") or "24000")
        speech_rate = int(os.environ.get("DOUBAO_TTS_V3_SPEECH_RATE") or os.environ.get("DOUBAO_PODCAST_SPEECH_RATE") or "0")

        speaker = (speaker or "").strip() or (os.environ.get("DOUBAO_TTS_V3_SPEAKER") or "").strip()
        if not speaker:
            if tts_version == "2":
                speaker = (os.environ.get("DOUBAO_TTS_V2_VOICE") or "").strip()
            else:
                speaker = (os.environ.get("DOUBAO_TTS_V1_VOICE") or "").strip()
        if not speaker:
            speaker = (os.environ.get("DOUBAO_TTS_VOICE") or "").strip()
        if not speaker:
            if tts_version == "2":
                speaker = (self._pick_speakers()[0] or "").strip()
            else:
                # TTS 1.0 voices are account-dependent; do not guess a default voice name.
                raise DoubaoTTSException(
                    "Doubao TTS v1 speaker is empty. Set DOUBAO_TTS_V1_VOICE (recommended) "
                    "or DOUBAO_TTS_VOICE to a voice that matches your TTS 1.0 resource."
                )
        if not speaker:
            raise DoubaoTTSException("Doubao TTS V3 speaker is empty")

        force_ssml = self._truthy(os.environ.get("DOUBAO_TTS_V3_FORCE_SSML") or "0")
        is_ssml = force_ssml or ("<" in txt and ">" in txt)
        model = (os.environ.get("DOUBAO_TTS_V3_MODEL") or "").strip()

        if is_ssml:
            # NOTE (official): bidirectional streaming API does NOT support SSML.
            # Do not default to BidirectionalTTS namespace here.
            import re

            txt = re.sub(r"<\s*breaktime\b", "<break", txt, flags=re.IGNORECASE)
            txt = re.sub(r"</\s*breaktime\s*>", "</break>", txt, flags=re.IGNORECASE)

        emotion = (os.environ.get("DOUBAO_TTS_V3_EMOTION") or "").strip()
        emotion_scale_raw = (os.environ.get("DOUBAO_TTS_V3_EMOTION_SCALE") or "").strip()
        emotion_scale: int | None = None
        if emotion_scale_raw:
            try:
                emotion_scale = int(emotion_scale_raw)
            except Exception:
                emotion_scale = None

        context_text = (os.environ.get("DOUBAO_TTS_V3_CONTEXT_TEXT") or "").strip()
        context_texts_raw = (os.environ.get("DOUBAO_TTS_V3_CONTEXT_TEXTS") or "").strip()
        if not context_text and context_texts_raw:
            if context_texts_raw.startswith("["):
                try:
                    v = json.loads(context_texts_raw)
                    if isinstance(v, list) and v and isinstance(v[0], str) and v[0].strip():
                        context_text = v[0].strip()
                except Exception:
                    context_text = ""
            if not context_text:
                parts = [p.strip() for p in context_texts_raw.split(",") if p.strip()]
                if parts:
                    context_text = parts[0]

        additions: Dict[str, Any] = {}
        if context_text:
            additions["context_texts"] = [context_text]
        
        # 句尾静音时长（增加呼吸感）
        silence_duration_raw = (os.environ.get("DOUBAO_TTS_V3_SILENCE_DURATION") or "").strip()
        if silence_duration_raw:
            try:
                silence_duration = int(silence_duration_raw)
                if 0 <= silence_duration <= 30000:
                    additions["silence_duration"] = silence_duration
            except Exception:
                pass

        namespace = (os.environ.get("DOUBAO_TTS_V3_NAMESPACE") or "").strip()
        # Official: text_type is a string: plain / ssml
        # Do NOT coerce to int even if user sets a numeric value by mistake.
        text_type_ssml = (os.environ.get("DOUBAO_TTS_V3_TEXT_TYPE_SSML") or "ssml").strip() or "ssml"

        ssml_max_chars = int(os.environ.get("DOUBAO_TTS_V3_SSML_MAX_CHARS") or "150")
        ssml_strict = self._truthy(os.environ.get("DOUBAO_TTS_V3_SSML_STRICT") or "0")
        allow_unsupported_ssml = self._truthy(os.environ.get("DOUBAO_TTS_V3_ALLOW_UNSUPPORTED_SSML") or "0")
        if is_ssml and ssml_max_chars > 0 and len(txt) > ssml_max_chars:
            msg = (
                f"SSML too long chars={len(txt)} max={ssml_max_chars}. "
                "Per doc, SSML (including tags) should not exceed 150 chars to reduce badcases. "
                "Consider shortening/splitting your SSML."
            )
            if ssml_strict:
                raise DoubaoTTSException(msg)
            log.warning(msg)
            if tts_version != "2":
                chunks = DoubaoTTSClient._split_ssml_chunks(txt, ssml_max_chars)
                if len(chunks) > 1:
                    out_b = bytearray()
                    for ch in chunks:
                        out_b += self.generate_mp3_v3_unidirectional_http(input_text=ch, speaker=speaker)
                    return bytes(out_b)
            # Best-effort downgrade: when SSML is too long and user already allows unsupported SSML,
            # strip tags and synthesize as plain text to avoid tags being spoken and reduce badcases.
            if allow_unsupported_ssml:
                txt = (DoubaoTTSClient._strip_ssml(txt) or "").strip()
                is_ssml = False

        if is_ssml and ("<break" in txt.lower()):
            # Official note: <break> is only supported by Doubao TTS model 1.0 voices.
            # It does NOT apply to TTS 2.0 voices (e.g. seed-tts-2.0).
            if "2.0" in resource_id and not allow_unsupported_ssml:
                raise DoubaoTTSException(
                    "SSML <break> is not supported by TTS 2.0 voices (resource_id contains '2.0'). "
                    "Switch DOUBAO_TTS_V3_RESOURCE_ID to a TTS 1.0 resource (e.g. seed-tts-1.0 / volc.service_type.10029), "
                    "or set DOUBAO_TTS_V3_ALLOW_UNSUPPORTED_SSML=1 to strip <break> tags."
                )
            if "2.0" in resource_id and allow_unsupported_ssml:
                # Best-effort: for TTS2.0, SSML is not reliable. Downgrade to plain text.
                # This guarantees tags like <speak> won't be spoken.
                txt = (DoubaoTTSClient._strip_ssml(txt) or "").strip()
                is_ssml = False

        req_body: Dict[str, Any] = {
            "user": {"uid": (os.environ.get("DOUBAO_TTS_V3_UID") or "auto_podcast").strip() or "auto_podcast"},
            "req_params": {
                "text": txt,
                "model": model,
                "speaker": speaker,
                "audio_params": {
                    "format": audio_format,
                    "sample_rate": sample_rate,
                    "speech_rate": speech_rate,
                },
            },
        }

        if namespace:
            req_body["namespace"] = namespace

        if is_ssml:
            req_body["req_params"]["text_type"] = text_type_ssml
            send_ssml_field_raw = os.environ.get("DOUBAO_TTS_V3_SEND_SSML_FIELD")
            if send_ssml_field_raw is None or not send_ssml_field_raw.strip():
                send_ssml_field = tts_version != "2"
            else:
                send_ssml_field = self._truthy(send_ssml_field_raw)
            if send_ssml_field:
                # Some gateways require SSML to be provided in a dedicated field, but others will break
                # if both `text` and `ssml` contain the full SSML. Keep `text` as plain text fallback.
                req_body["req_params"]["ssml"] = txt
                if tts_version != "2":
                    # For TTS1.0 SSML, prefer forcing the gateway to consume the `ssml` field.
                    req_body["req_params"]["text"] = ""
                else:
                    plain = (DoubaoTTSClient._strip_ssml(txt) or "").strip()
                    if plain:
                        req_body["req_params"]["text"] = plain

        if emotion:
            req_body["req_params"]["audio_params"]["emotion"] = emotion
        if emotion_scale is not None:
            req_body["req_params"]["audio_params"]["emotion_scale"] = emotion_scale
        if additions:
            req_body["req_params"]["additions"] = json.dumps(additions, ensure_ascii=False)

        headers = {
            "X-Api-App-Id": self.cfg.app_id,
            "X-Api-Access-Key": self.cfg.access_key,
            "X-Api-Resource-Id": resource_id,
            "X-Api-Request-Id": str(uuid.uuid4()),
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }

        out = bytearray()
        debug_stream = self._truthy(os.environ.get("DOUBAO_TTS_V3_DEBUG_STREAM") or "0")
        url = self._tts_v3_unidirectional_url()
        r = requests.post(url, headers=headers, json=req_body, timeout=self.timeout_seconds, stream=True)
        if debug_stream:
            log.info(
                "doubao tts http resp: status=%s content_type=%s transfer_encoding=%s",
                r.status_code,
                (r.headers.get("Content-Type") or r.headers.get("content-type") or "").strip(),
                (r.headers.get("Transfer-Encoding") or r.headers.get("transfer-encoding") or "").strip(),
            )
            log.info(
                "doubao tts http req: namespace=%s is_ssml=%s ssml_len=%s context_len=%s send_ssml_field=%s has_ssml_field=%s has_speak=%s has_break=%s has_breaktime=%s",
                namespace,
                "Y" if is_ssml else "N",
                len(txt),
                len(context_text or ""),
                "Y" if (is_ssml and "ssml" in (req_body.get("req_params") or {})) else "N",
                "Y" if (is_ssml and "ssml" in (req_body.get("req_params") or {})) else "N",
                "Y" if ("<speak" in (txt or "").lower()) else "N",
                "Y" if ("<break" in (txt or "").lower()) else "N",
                "Y" if ("<breaktime" in (txt or "").lower()) else "N",
            )
        if not r.ok:
            logid = (r.headers.get("X-Tt-Logid") or r.headers.get("x-tt-logid") or "").strip()
            body = ""
            try:
                body = (r.text or "").strip()
            except Exception:
                body = ""
            if len(body) > 2000:
                body = body[:2000] + "..."
            raise DoubaoTTSException(
                f"Doubao TTS V3 HTTP failed status={r.status_code} logid={logid} "
                f"resource_id={resource_id} url={url} body={body}"
            )

        last_code: int | None = None
        last_msg: str | None = None
        debug_lines = 0

        def _looks_like_b64(s: str) -> bool:
            if not isinstance(s, str):
                return False
            t = s.strip()
            if len(t) < 32:
                return False
            # base64 chars only (plus optional padding)
            for ch in t:
                if ch.isalnum() or ch in {"+", "/", "=", "-", "_"}:
                    continue
                return False
            return True

        def _extract_audio_b64(v: Any) -> str:
            if isinstance(v, str):
                return v if _looks_like_b64(v) else ""
            if isinstance(v, dict):
                for k in ("data", "audio", "audio_data", "audioData"):
                    if k in v:
                        return _extract_audio_b64(v.get(k))
            return ""

        def _safe_preview(raw: str) -> str:
            s = (raw or "").strip()
            if s.startswith("data:"):
                s = s[5:].strip()
            if s.startswith("{"):
                try:
                    o = json.loads(s)
                    if isinstance(o, dict) and isinstance(o.get("data"), str):
                        d = o.get("data")
                        if isinstance(d, str) and len(d) > 80:
                            o = dict(o)
                            o["data"] = f"<base64 len={len(d)}>"
                        s = json.dumps(o, ensure_ascii=False)
                except Exception:
                    pass
            if len(s) > 240:
                s = s[:240] + "..."
            return s

        for line_b in r.iter_lines(decode_unicode=False):
            if not line_b:
                continue
            line = line_b.decode("utf-8", errors="ignore").strip()
            if not line:
                continue
            if debug_stream and debug_lines < 8:
                debug_lines += 1
                log.info("doubao tts http raw: %s", _safe_preview(line))
            if line.startswith("data:"):
                line = line[5:].strip()
                if not line:
                    continue
            if line.startswith("event:") or line.startswith("id:"):
                continue

            # Some streaming implementations may send raw base64 audio chunks (not JSON).
            if not line.startswith("{") and _looks_like_b64(line):
                try:
                    chunk = base64.b64decode(line)
                except Exception:
                    chunk = b""
                if chunk:
                    out += chunk
                if debug_stream:
                    log.info("doubao tts http stream: raw_b64_len=%s chunk_bytes=%s out_len=%s", len(line), len(chunk), len(out))
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            if not isinstance(obj, dict):
                continue

            code = obj.get("code")
            msg = obj.get("message")
            data = obj.get("data")

            if isinstance(code, int):
                last_code = code
            if isinstance(msg, str):
                last_msg = msg

            # Some gateways may nest audio under different keys; search the whole object.
            audio_b64 = _extract_audio_b64(obj)
            if audio_b64:
                try:
                    out += base64.b64decode(audio_b64)
                except Exception:
                    pass

            if debug_stream:
                data_type = type(data).__name__
                data_keys = ""
                if isinstance(data, dict):
                    data_keys = ",".join([str(k) for k in list(data.keys())[:12]])
                log.info(
                    "doubao tts http stream: code=%s msg=%s obj_keys=%s data_type=%s data_keys=%s audio_b64_len=%s out_len=%s",
                    "" if code is None else code,
                    "" if msg is None else str(msg)[:120],
                    ",".join([str(k) for k in list(obj.keys())[:12]]),
                    data_type,
                    data_keys,
                    0 if not isinstance(audio_b64, str) else len(audio_b64),
                    len(out),
                )

            if code == 20000000:
                break
            if isinstance(code, int) and code not in (0, 20000000):
                raise DoubaoTTSException(f"Doubao TTS V3 error code={code} msg={msg} line={obj}")

        if not out:
            raise DoubaoTTSException(f"Doubao TTS V3 returned no audio data code={last_code} msg={last_msg}")

        if audio_format.lower() == "mp3":
            # A valid MP3 stream is typically much larger than a bare ID3 header.
            # If we only got a tiny header, treat it as a failed/partial stream.
            if len(out) < 1024:
                raise DoubaoTTSException(
                    f"Doubao TTS V3 returned too little mp3 data bytes={len(out)} code={last_code} msg={last_msg}. "
                    "Enable DOUBAO_TTS_V3_DEBUG_STREAM=1 to inspect stream events."
                )
        return bytes(out)

    def generate_session(self, *, input_text: str) -> str:
        if not (self.cfg.app_id and self.cfg.access_key) or self.cfg.access_key in {"replace_me", "你的token"}:
            raise DoubaoTTSException(
                "Doubao Podcast not configured: set DOUBAO_APP_ID and DOUBAO_ACCESS_KEY (access token)"
            )

        txt = (input_text or "").strip()
        if not txt:
            raise DoubaoTTSException("empty input_text")

        session_id = uuid.uuid4().hex[:12]

        use_head_music = self._truthy(os.environ.get("DOUBAO_PODCAST_USE_HEAD_MUSIC") or "0")
        use_tail_music = self._truthy(os.environ.get("DOUBAO_PODCAST_USE_TAIL_MUSIC") or "0")
        random_order = self._truthy(os.environ.get("DOUBAO_PODCAST_RANDOM_ORDER") or "1")
        scene = (os.environ.get("DOUBAO_PODCAST_SCENE") or "deep_research").strip() or "deep_research"

        audio_format = (os.environ.get("DOUBAO_PODCAST_FORMAT") or "mp3").strip() or "mp3"
        sample_rate = int(os.environ.get("DOUBAO_PODCAST_SAMPLE_RATE") or "24000")
        speech_rate = int(os.environ.get("DOUBAO_PODCAST_SPEECH_RATE") or "0")

        payload_obj: Dict[str, Any] = {
            "input_id": os.environ.get("DOUBAO_PODCAST_INPUT_ID") or "auto_podcast",
            "input_text": txt,
            "scene": scene,
            "action": int(os.environ.get("DOUBAO_PODCAST_ACTION") or "0"),
            "use_head_music": use_head_music,
            "audio_config": {
                "format": audio_format,
                "sample_rate": sample_rate,
                "speech_rate": speech_rate,
            },
            "speaker_info": {
                "random_order": random_order,
                "speakers": self._pick_speakers(),
            },
        }

        payload_obj["audio_params"] = payload_obj.get("audio_config")

        payload_obj["input_info"] = {"return_audio_url": True}

        payload = json.dumps(payload_obj, ensure_ascii=False).encode("utf-8")

        headers = self._ws_headers()
        header_list = [f"{k}: {v}" for k, v in headers.items()]

        trace = (os.environ.get("DOUBAO_WS_TRACE") or "").strip().lower()
        if trace in {"1", "true", "yes", "on"}:
            try:
                websocket.enableTrace(True)
            except Exception:
                pass

        try:
            ws = websocket.create_connection(self._ws_url(), header=header_list, timeout=self.timeout_seconds)
            recv_timeout_s = int(os.environ.get("DOUBAO_PODCAST_RECV_TIMEOUT_SECONDS") or "5")
            ws.settimeout(min(self.timeout_seconds, max(1, recv_timeout_s)))
        except Exception as e:  # noqa: BLE001
            raise DoubaoTTSException("Doubao podcast websocket connect failed") from e

        try:
            start_message_type = int(os.environ.get("DOUBAO_PODCAST_START_MESSAGE_TYPE") or "1", 0)
            start_flags = int(os.environ.get("DOUBAO_PODCAST_START_FLAGS") or "4", 0)
            connect_event_code = int(os.environ.get("DOUBAO_PODCAST_CONNECT_EVENT_CODE") or "1", 0)
            start_event_code = int(os.environ.get("DOUBAO_PODCAST_START_EVENT_CODE") or "1", 0)
            task_event_code_raw = os.environ.get("DOUBAO_PODCAST_TASK_EVENT_CODE")
            if task_event_code_raw is not None and task_event_code_raw.strip():
                task_event_code = int(task_event_code_raw, 0)
            else:
                task_event_code = start_event_code if start_event_code != connect_event_code else 100
            serialization = int(os.environ.get("DOUBAO_PODCAST_SERIALIZATION") or "1", 0)
            compression = int(os.environ.get("DOUBAO_PODCAST_COMPRESSION") or "0", 0)

            payload_to_send = gzip.compress(payload) if compression == 0x1 else payload

            if start_flags & 0x4:
                connect_payload = gzip.compress(b"{}") if compression == 0x1 else b"{}"
                ws.send(
                    DoubaoTTSClient._build_event_frame(
                        message_type=start_message_type,
                        flags=start_flags,
                        serialization=serialization,
                        compression=compression,
                        event_code=connect_event_code,
                        session_id=None,
                        payload=connect_payload,
                    ),
                    opcode=websocket.ABNF.OPCODE_BINARY,
                )

                try:
                    raw0 = ws.recv()
                    if raw0 is not None:
                        raw0b = raw0.encode("utf-8") if isinstance(raw0, str) else bytes(raw0)
                        mt0, _fl0, _sr0, _cm0, ev0, pl0 = DoubaoTTSClient._parse_frame(raw0b)
                        if mt0 == 0xF:
                            pl0d = DoubaoTTSClient._maybe_decompress(pl0, _cm0)
                            msg0 = pl0d.decode("utf-8", errors="ignore") if pl0d else ""
                            raise DoubaoTTSException(f"Doubao podcast error frame code={ev0} msg={msg0}")
                except websocket.WebSocketTimeoutException:
                    pass
                except Exception:
                    pass

                ws.send(
                    DoubaoTTSClient._build_event_frame(
                        message_type=start_message_type,
                        flags=start_flags,
                        serialization=serialization,
                        compression=compression,
                        event_code=task_event_code,
                        session_id=session_id,
                        payload=payload_to_send,
                    ),
                    opcode=websocket.ABNF.OPCODE_BINARY,
                )
            else:
                ws.send(
                    DoubaoTTSClient._build_frame(
                        message_type=start_message_type,
                        flags=start_flags,
                        serialization=serialization,
                        compression=compression,
                        payload=payload_to_send,
                    ),
                    opcode=websocket.ABNF.OPCODE_BINARY,
                )
            self._wait_and_download(ws=ws, session_id=session_id)
            return session_id
        finally:
            try:
                ws.close()
            except Exception:
                pass

    def generate_mp3(self, *, input_text: str) -> bytes:
        if self._truthy(os.environ.get("DOUBAO_PODCAST_USE_V3_UNIDIRECTIONAL") or "0"):
            return self.generate_mp3_v3_unidirectional_http(input_text=input_text)

        if not (self.cfg.app_id and self.cfg.access_key) or self.cfg.access_key in {"replace_me", "你的token"}:
            raise DoubaoTTSException(
                "Doubao Podcast not configured: set DOUBAO_APP_ID and DOUBAO_ACCESS_KEY (access token)"
            )

        txt = (input_text or "").strip()
        if not txt:
            raise DoubaoTTSException("empty input_text")

        session_id = uuid.uuid4().hex[:12]

        use_head_music = self._truthy(os.environ.get("DOUBAO_PODCAST_USE_HEAD_MUSIC") or "0")
        use_tail_music = self._truthy(os.environ.get("DOUBAO_PODCAST_USE_TAIL_MUSIC") or "0")
        random_order = self._truthy(os.environ.get("DOUBAO_PODCAST_RANDOM_ORDER") or "1")
        scene = (os.environ.get("DOUBAO_PODCAST_SCENE") or "deep_research").strip() or "deep_research"

        audio_format = (os.environ.get("DOUBAO_PODCAST_FORMAT") or "mp3").strip() or "mp3"
        sample_rate = int(os.environ.get("DOUBAO_PODCAST_SAMPLE_RATE") or "24000")
        speech_rate = int(os.environ.get("DOUBAO_PODCAST_SPEECH_RATE") or "0")

        payload_obj: Dict[str, Any] = {
            "input_id": os.environ.get("DOUBAO_PODCAST_INPUT_ID") or "auto_podcast",
            "input_text": txt,
            "scene": scene,
            "action": int(os.environ.get("DOUBAO_PODCAST_ACTION") or "0"),
            "use_head_music": use_head_music,
            "audio_config": {
                "format": audio_format,
                "sample_rate": sample_rate,
                "speech_rate": speech_rate,
            },
            "speaker_info": {
                "random_order": random_order,
                "speakers": self._pick_speakers(),
            },
        }

        payload_obj["audio_params"] = payload_obj.get("audio_config")

        payload_obj["input_info"] = {"return_audio_url": True}

        payload = json.dumps(payload_obj, ensure_ascii=False).encode("utf-8")

        headers = self._ws_headers()
        header_list = [f"{k}: {v}" for k, v in headers.items()]

        trace = (os.environ.get("DOUBAO_WS_TRACE") or "").strip().lower()
        if trace in {"1", "true", "yes", "on"}:
            try:
                websocket.enableTrace(True)
            except Exception:
                pass

        explicit_start_mt = os.environ.get("DOUBAO_PODCAST_START_MESSAGE_TYPE")
        explicit_include_sid = os.environ.get("DOUBAO_PODCAST_START_INCLUDE_SESSION_ID")
        strict_start_mt = self._truthy(os.environ.get("DOUBAO_PODCAST_START_STRICT") or "0")

        if explicit_start_mt is not None and explicit_start_mt.strip():
            mt = int(explicit_start_mt, 0)
            if strict_start_mt:
                start_message_types = [mt]
            else:
                if (mt & 0xF) in {0x1, 0x9}:
                    start_message_types = [0x9, 0x1]
                else:
                    start_message_types = [mt]
        else:
            start_message_types = [0x9, 0x1]

        include_sid_strict = self._truthy(os.environ.get("DOUBAO_PODCAST_START_INCLUDE_SESSION_ID_STRICT") or "0")
        if explicit_include_sid is not None and explicit_include_sid.strip():
            include_sid_truthy = self._truthy(explicit_include_sid)
            if include_sid_strict:
                include_sid_values = [1 if include_sid_truthy else 0]
            else:
                include_sid_values = [1, 0]
        else:
            include_sid_values = [1, 0]

        start_flags_env = int(os.environ.get("DOUBAO_PODCAST_START_FLAGS") or "4", 0)
        strict_start_flags = self._truthy(os.environ.get("DOUBAO_PODCAST_START_FLAGS_STRICT") or "0")

        attempts: list[tuple[int, int, int]] = []
        for mt in start_message_types:
            mt4 = mt & 0xF
            if strict_start_flags:
                flags_values = [start_flags_env]
            else:
                # Many deployments only support V1 style for msg_type=1 (flags=0). Try it first.
                if mt4 == 0x1:
                    flags_values = [0, start_flags_env] if start_flags_env != 0 else [0]
                else:
                    flags_values = [start_flags_env]

            for flags_v in flags_values:
                for v in include_sid_values:
                    attempts.append((mt, v, flags_v))

        last_exc: Optional[Exception] = None
        attempt_errors: list[str] = []
        for attempt_start_mt, include_sid_v, attempt_start_flags in attempts:
            try:
                ws = websocket.create_connection(self._ws_url(), header=header_list, timeout=self.timeout_seconds)
                recv_timeout_s = int(os.environ.get("DOUBAO_PODCAST_RECV_TIMEOUT_SECONDS") or "5")
                ws.settimeout(min(self.timeout_seconds, max(1, recv_timeout_s)))
            except Exception as e:  # noqa: BLE001
                raise DoubaoTTSException("Doubao podcast websocket connect failed") from e

            try:
                start_event_code = int(os.environ.get("DOUBAO_PODCAST_START_EVENT_CODE") or "1", 0)
                connect_event_code = int(os.environ.get("DOUBAO_PODCAST_CONNECT_EVENT_CODE") or "1", 0)
                task_event_code_raw = os.environ.get("DOUBAO_PODCAST_TASK_EVENT_CODE")
                if task_event_code_raw is not None and task_event_code_raw.strip():
                    task_event_code = int(task_event_code_raw, 0)
                else:
                    task_event_code = start_event_code if start_event_code != connect_event_code else 100
                serialization = int(os.environ.get("DOUBAO_PODCAST_SERIALIZATION") or "1", 0)
                compression = int(os.environ.get("DOUBAO_PODCAST_COMPRESSION") or "0", 0)

                payload_to_send = gzip.compress(payload) if compression == 0x1 else payload

                if attempt_start_flags & 0x4:
                    connect_payload = gzip.compress(b"{}") if compression == 0x1 else b"{}"
                    ws.send(
                        DoubaoTTSClient._build_event_frame(
                            message_type=attempt_start_mt,
                            flags=attempt_start_flags,
                            serialization=serialization,
                            compression=compression,
                            event_code=connect_event_code,
                            session_id=None,
                            payload=connect_payload,
                        ),
                        opcode=websocket.ABNF.OPCODE_BINARY,
                    )

                    try:
                        raw0 = ws.recv()
                        if raw0 is not None:
                            raw0b = raw0.encode("utf-8") if isinstance(raw0, str) else bytes(raw0)
                            mt0, _fl0, _sr0, _cm0, ev0, pl0 = DoubaoTTSClient._parse_frame(raw0b)
                            if mt0 == 0xF:
                                pl0d = DoubaoTTSClient._maybe_decompress(pl0, _cm0)
                                msg0 = pl0d.decode("utf-8", errors="ignore") if pl0d else ""
                                raise DoubaoTTSException(f"Doubao podcast error frame code={ev0} msg={msg0}")
                    except websocket.WebSocketTimeoutException:
                        pass
                    except Exception:
                        pass

                    sid: Optional[str] = session_id if include_sid_v else None
                    ws.send(
                        DoubaoTTSClient._build_event_frame(
                            message_type=attempt_start_mt,
                            flags=attempt_start_flags,
                            serialization=serialization,
                            compression=compression,
                            event_code=task_event_code,
                            session_id=sid,
                            payload=payload_to_send,
                        ),
                        opcode=websocket.ABNF.OPCODE_BINARY,
                    )
                else:
                    ws.send(
                        DoubaoTTSClient._build_frame(
                            message_type=attempt_start_mt,
                            flags=attempt_start_flags,
                            serialization=serialization,
                            compression=compression,
                            payload=payload_to_send,
                        ),
                        opcode=websocket.ABNF.OPCODE_BINARY,
                    )

                mp3 = self._wait_and_download(ws=ws, session_id=session_id)
                return mp3

            except Exception as e:  # noqa: BLE001
                last_exc = e
                attempt_errors.append(
                    f"mt={attempt_start_mt} flags={attempt_start_flags} include_sid={include_sid_v}: {type(e).__name__}: {e}"
                )
            finally:
                try:
                    finish_message_type = int(os.environ.get("DOUBAO_PODCAST_FINISH_MESSAGE_TYPE") or "9", 0)
                    finish_event_code = int(os.environ.get("DOUBAO_PODCAST_FINISH_EVENT_CODE") or "2", 0)
                    serialization = int(os.environ.get("DOUBAO_PODCAST_SERIALIZATION") or "1", 0)
                    compression = int(os.environ.get("DOUBAO_PODCAST_COMPRESSION") or "0", 0)

                    finish_flags_raw = os.environ.get("DOUBAO_PODCAST_FINISH_FLAGS")
                    flags = (
                        int(finish_flags_raw, 0)
                        if (finish_flags_raw is not None and finish_flags_raw.strip())
                        else (attempt_start_flags or 0x4)
                    )

                    finish_payload = gzip.compress(b"{}") if compression == 0x1 else b"{}"

                    if flags & 0x4:
                        ws.send(
                            DoubaoTTSClient._build_event_frame(
                                message_type=finish_message_type,
                                flags=flags,
                                serialization=serialization,
                                compression=compression,
                                event_code=finish_event_code,
                                session_id=None,
                                payload=finish_payload,
                            ),
                            opcode=websocket.ABNF.OPCODE_BINARY,
                        )
                    else:
                        ws.send(
                            DoubaoTTSClient._build_frame(
                                message_type=finish_message_type,
                                flags=flags,
                                serialization=serialization,
                                compression=compression,
                                payload=finish_payload,
                            ),
                            opcode=websocket.ABNF.OPCODE_BINARY,
                        )
                except Exception:
                    pass

                try:
                    end_deadline = time.time() + 2
                    while time.time() < end_deadline:
                        try:
                            opcode2, data2 = ws.recv_data(control_frame=True)
                        except websocket.WebSocketTimeoutException:
                            break
                        if opcode2 in {websocket.ABNF.OPCODE_PING, websocket.ABNF.OPCODE_PONG}:
                            continue
                        if opcode2 == websocket.ABNF.OPCODE_CLOSE:
                            break
                        if data2 is None:
                            break
                        raw2 = data2.encode("utf-8") if isinstance(data2, str) else bytes(data2)
                        try:
                            _mt, _fl, _ser, _cmp, ev2, _pl = DoubaoTTSClient._parse_frame(raw2)
                        except Exception:
                            continue
                        if ev2 == 52:
                            break
                except Exception:
                    pass

                try:
                    ws.close()
                except Exception:
                    pass

        if last_exc is not None:
            if isinstance(last_exc, DoubaoTTSException):
                # Surface all attempts; otherwise users only see the last attempt (often mt=1 fallback).
                if attempt_errors:
                    raise DoubaoTTSException(
                        "Doubao podcast generate_mp3 failed. Attempts:\n" + "\n".join(attempt_errors)
                    ) from last_exc
                raise last_exc
            if attempt_errors:
                raise DoubaoTTSException(
                    "Doubao podcast generate_mp3 failed. Attempts:\n" + "\n".join(attempt_errors)
                ) from last_exc
            raise DoubaoTTSException("Doubao podcast generate_mp3 failed") from last_exc
        raise DoubaoTTSException("Doubao podcast generate_mp3 failed")

    def _wait_and_download(self, *, ws: websocket.WebSocket, session_id: str) -> bytes:
        wait_s = int(os.environ.get("DOUBAO_PODCAST_WAIT_SECONDS") or str(min(600, self.timeout_seconds)))
        deadline = time.time() + max(1, wait_s)
        no_event_timeout_s = int(os.environ.get("DOUBAO_PODCAST_NO_EVENT_TIMEOUT_SECONDS") or "180")
        no_event_timeout_s = min(max(1, no_event_timeout_s), max(1, wait_s))
        progress_timeout_s = int(os.environ.get("DOUBAO_PODCAST_PROGRESS_TIMEOUT_SECONDS") or "40")
        last_json: Optional[Dict[str, Any]] = None
        audio_chunks: list[bytes] = []
        last_business_ts = time.time()
        start_ts = time.time()
        saw_progress_event = False
        business_count = 0
        last_event: Optional[int] = None
        ping_count = 0
        last_close_code: Optional[int] = None
        last_close_reason: Optional[str] = None

        while time.time() < deadline:
            try:
                opcode, data = ws.recv_data(control_frame=True)
            except websocket.WebSocketTimeoutException:
                if business_count == 0 and (time.time() - start_ts) > progress_timeout_s:
                    raise DoubaoTTSException(
                        f"Doubao podcast stuck without progress events. session_id={session_id} "
                        f"business_frames={business_count} last_event={last_event} pings={ping_count} last={last_json}"
                    )
                if (time.time() - last_business_ts) > no_event_timeout_s:
                    idle_s = int(time.time() - last_business_ts)
                    if business_count == 0:
                        raise DoubaoTTSException(
                            f"Doubao podcast got no business frames (only ping/pong). "
                            f"session_id={session_id} pings={ping_count}"
                        )
                    raise DoubaoTTSException(
                        f"Doubao podcast no new business frames for {idle_s}s. "
                        f"session_id={session_id} business_frames={business_count} "
                        f"last_event={last_event} pings={ping_count} last={last_json}"
                    )
                continue
            except websocket.WebSocketConnectionClosedException as e:
                code = getattr(ws, "close_status_code", None) or last_close_code
                reason = getattr(ws, "close_reason", None) or last_close_reason
                raise DoubaoTTSException(f"Doubao podcast websocket closed code={code} reason={reason}") from e

            if opcode == websocket.ABNF.OPCODE_PING:
                ping_count += 1
                if business_count == 0 and (time.time() - start_ts) > progress_timeout_s:
                    raise DoubaoTTSException(
                        f"Doubao podcast stuck without progress events. session_id={session_id} "
                        f"business_frames={business_count} last_event={last_event} pings={ping_count} last={last_json}"
                    )
                if (time.time() - last_business_ts) > no_event_timeout_s:
                    idle_s = int(time.time() - last_business_ts)
                    if business_count == 0:
                        raise DoubaoTTSException(
                            f"Doubao podcast got no business frames (only ping/pong). "
                            f"session_id={session_id} idle={idle_s}s pings={ping_count}"
                        )
                    raise DoubaoTTSException(
                        f"Doubao podcast no new business frames for {idle_s}s. "
                        f"session_id={session_id} business_frames={business_count} "
                        f"last_event={last_event} pings={ping_count} last={last_json}"
                    )
                try:
                    ws.pong(data)
                except Exception:
                    pass
                continue
            if opcode == websocket.ABNF.OPCODE_PONG:
                if business_count == 0 and (time.time() - start_ts) > progress_timeout_s:
                    raise DoubaoTTSException(
                        f"Doubao podcast stuck without progress events. session_id={session_id} "
                        f"business_frames={business_count} last_event={last_event} pings={ping_count} last={last_json}"
                    )
                if (time.time() - last_business_ts) > no_event_timeout_s:
                    idle_s = int(time.time() - last_business_ts)
                    if business_count == 0:
                        raise DoubaoTTSException(
                            f"Doubao podcast got no business frames (only ping/pong). "
                            f"session_id={session_id} idle={idle_s}s pings={ping_count}"
                        )
                    raise DoubaoTTSException(
                        f"Doubao podcast no new business frames for {idle_s}s. "
                        f"session_id={session_id} business_frames={business_count} "
                        f"last_event={last_event} pings={ping_count} last={last_json}"
                    )
                continue
            if opcode == websocket.ABNF.OPCODE_CLOSE:
                try:
                    payload_b = b"" if data is None else (data if isinstance(data, (bytes, bytearray)) else bytes(data))
                    if len(payload_b) >= 2:
                        last_close_code = int.from_bytes(payload_b[0:2], byteorder="big", signed=False)
                        if len(payload_b) > 2:
                            last_close_reason = payload_b[2:].decode("utf-8", errors="ignore")
                except Exception:
                    pass
                raise DoubaoTTSException(
                    f"Doubao podcast websocket closed by server code={last_close_code} reason={last_close_reason}"
                )

            if data is None:
                break

            if opcode == websocket.ABNF.OPCODE_TEXT:
                raw = data.encode("utf-8") if isinstance(data, str) else bytes(data)
            elif opcode == websocket.ABNF.OPCODE_BINARY:
                raw = bytes(data)
            else:
                continue

            try:
                msg_type, _flags, serialization, compression, event, payload = DoubaoTTSClient._parse_frame(raw)
            except Exception as e:  # noqa: BLE001
                raise DoubaoTTSException(
                    f"Doubao podcast failed to parse frame opcode={opcode} size={len(raw)}"
                ) from e
            last_business_ts = time.time()
            business_count += 1
            last_event = event if isinstance(event, int) else last_event

            if serialization == 0x0 and payload:
                audio_chunks.append(payload)
                saw_progress_event = True

            if msg_type == 0xB:
                saw_progress_event = True

            if isinstance(event, int) and event in {50, 150, 360, 361, 362, 363, 152, 154}:
                saw_progress_event = True

            if business_count == 0 and (time.time() - start_ts) > progress_timeout_s:
                raise DoubaoTTSException(
                    f"Doubao podcast stuck without progress events. session_id={session_id} "
                    f"business_frames={business_count} last_event={last_event} last={last_json}"
                )

            if msg_type == 0xF:
                payload2 = DoubaoTTSClient._maybe_decompress(payload, compression)
                msg = payload2.decode("utf-8", errors="ignore") if payload2 else ""
                raise DoubaoTTSException(f"Doubao podcast error frame code={event} msg={msg}")

            if serialization == 0x1 and payload:
                payload2 = DoubaoTTSClient._maybe_decompress(payload, compression)
                try:
                    obj = json.loads(payload2.decode("utf-8"))
                except Exception:
                    obj = {"raw": payload2.decode("utf-8", errors="ignore")}
                last_json = obj if isinstance(obj, dict) else {"data": obj}

                if isinstance(last_json, dict) and isinstance(last_json.get("data"), str):
                    try:
                        audio_chunks.append(base64.b64decode(last_json["data"]))
                    except Exception:
                        pass

                if event == 363 and isinstance(last_json, dict):
                    meta = last_json.get("meta_info") or {}
                    audio_url = (meta.get("audio_url") or "").strip() if isinstance(meta, dict) else ""
                    if audio_url:
                        a = requests.get(audio_url, timeout=self.timeout_seconds)
                        a.raise_for_status()
                        return a.content

                if isinstance(last_json, dict) and isinstance(last_json.get("sequence"), int):
                    if int(last_json["sequence"]) < 0 and audio_chunks:
                        break

            if event in {52, 152}:
                break

            if msg_type == 0xB and isinstance(event, int) and event < 0 and audio_chunks:
                break

        if audio_chunks:
            return b"".join(audio_chunks)
        raise DoubaoTTSException(f"Doubao podcast ended without audio_url session_id={session_id} last={last_json}")
