from __future__ import annotations

import base64
import gzip
import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import requests
import websocket


class DoubaoTTSException(RuntimeError):
    pass


@dataclass
class DoubaoTTSConfig:
    app_id: str
    access_key: str
    secret_key: str
    region: str


class DoubaoTTSClient:
    def __init__(self, timeout_seconds: int):
        self.timeout_seconds = timeout_seconds
        self.cfg = DoubaoTTSConfig(
            app_id=os.environ.get("DOUBAO_APP_ID", "").strip(),
            access_key=os.environ.get("DOUBAO_ACCESS_KEY", "").strip(),
            secret_key=os.environ.get("DOUBAO_SECRET_KEY", "").strip(),
            region=os.environ.get("DOUBAO_REGION", "").strip() or "cn-north-1",
        )
        self._conns: Dict[str, websocket.WebSocket] = {}
        self._payloads: Dict[str, Dict[str, Any]] = {}

    def _ws_url(self) -> str:
        return (os.environ.get("DOUBAO_WS_URL") or "wss://openspeech.bytedance.com/api/v3/sami/podcasttts").strip()

    def _ws_headers(self) -> Dict[str, str]:
        # From the doc: Podcast API websocket v3
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

    def generate_mp3_v3_unidirectional_http(self, *, input_text: str) -> bytes:
        if not (self.cfg.app_id and self.cfg.access_key) or self.cfg.access_key in {"replace_me", "你的token"}:
            raise DoubaoTTSException(
                "Doubao TTS V3 not configured: set DOUBAO_APP_ID and DOUBAO_ACCESS_KEY (access token)"
            )

        txt = (input_text or "").strip()
        if not txt:
            raise DoubaoTTSException("empty input_text")

        resource_id = (
            os.environ.get("DOUBAO_TTS_V3_RESOURCE_ID")
            or os.environ.get("DOUBAO_RESOURCE_ID")
            or "volc.service_type.10029"
        ).strip()
        if resource_id == "volc.service_type.10050":
            raise DoubaoTTSException(
                "Doubao TTS V3 resource_id is set to podcast (volc.service_type.10050). "
                "Set DOUBAO_TTS_V3_RESOURCE_ID to seed-tts-1.0 / seed-tts-2.0 / volc.service_type.10029 / volc.service_type.10048."
            )

        audio_format = (os.environ.get("DOUBAO_TTS_V3_FORMAT") or os.environ.get("DOUBAO_PODCAST_FORMAT") or "mp3").strip() or "mp3"
        sample_rate = int(os.environ.get("DOUBAO_TTS_V3_SAMPLE_RATE") or os.environ.get("DOUBAO_PODCAST_SAMPLE_RATE") or "24000")
        speech_rate = int(os.environ.get("DOUBAO_TTS_V3_SPEECH_RATE") or os.environ.get("DOUBAO_PODCAST_SPEECH_RATE") or "0")

        speaker = (os.environ.get("DOUBAO_TTS_V3_SPEAKER") or "").strip()
        if not speaker:
            speaker = (self._pick_speakers()[0] or "").strip()
        if not speaker:
            raise DoubaoTTSException("Doubao TTS V3 speaker is empty")

        req_body: Dict[str, Any] = {
            "user": {"uid": (os.environ.get("DOUBAO_TTS_V3_UID") or "auto_podcast").strip() or "auto_podcast"},
            "req_params": {
                "text": txt,
                "speaker": speaker,
                "audio_params": {
                    "format": audio_format,
                    "sample_rate": sample_rate,
                    "speech_rate": speech_rate,
                },
            },
        }

        headers = {
            "X-Api-App-Id": self.cfg.app_id,
            "X-Api-Access-Key": self.cfg.access_key,
            "X-Api-Resource-Id": resource_id,
            "X-Api-Request-Id": str(uuid.uuid4()),
            "Content-Type": "application/json",
        }

        out = bytearray()
        url = self._tts_v3_unidirectional_url()
        r = requests.post(url, headers=headers, json=req_body, timeout=self.timeout_seconds, stream=True)
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

        for line_b in r.iter_lines(decode_unicode=False):
            if not line_b:
                continue
            line = line_b.decode("utf-8", errors="ignore").strip()
            if not line:
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

            if isinstance(data, str) and data:
                try:
                    out += base64.b64decode(data)
                except Exception:
                    pass

            if code == 20000000:
                break
            if isinstance(code, int) and code not in (0, 20000000):
                raise DoubaoTTSException(f"Doubao TTS V3 error code={code} msg={msg} line={obj}")

        if not out:
            raise DoubaoTTSException("Doubao TTS V3 returned no audio data")
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
