"""
Auto-Podcast Main Runner

这个文件是自动播客生成系统的主入口点，负责协调整个播客生成流程。

功能概述：
- 支持从多个新闻源获取内容（RSS、60s、AI工具集等）
- 使用多种LLM服务生成播客脚本（DeepSeek、Moonshot等）
- 集成多种TTS服务生成音频（豆包TTS、VoiceClone等）
- 提供完整的配置管理和错误处理
- 支持分步执行和全流程自动化

主要组件：
- step_fetch(): 数据获取模块
- step_script(): 脚本生成模块  
- step_tts(): 语音合成模块
- step_publish(): 发布模块
- main(): 主程序入口

使用方式：
    python run.py --date 2025-12-25 --step all
    python run.py --config config/channel_config.json
    python run.py --step fetch --timeout-seconds 120

环境要求：
- Python 3.8+
- 依赖包见 requirements.txt
- 需要配置相应的API密钥（.env文件）

作者：Auto-Podcast Team
版本：2.0.0
更新：2025-12-25
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

from src.audio.render import render_episode_audio
from src.fetch.dedup import dedup_items
from src.fetch.lilyrss import build_lily_rss_url
from src.fetch.rss import fetch_rss_items_with_status
from src.fetch.sixtys import fetch_sixtys_items_with_status
from src.fetch.aibot_daily import fetch_aibot_daily_items_with_status
from src.llm.api_client import DeepSeekClient, ScriptInputItem, ScriptOutput
from src.store.db import Store
from src.publish.local import publish_local
from src.fetch.filter import filter_fetch_archive_payload
from src.research.research_client import create_client_from_env, research_items_with_client


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base: dict[str, object] = {
            "ts": dt.datetime.fromtimestamp(record.created, tz=dt.timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
        }

        msg_obj: object
        try:
            msg_obj = record.msg
        except Exception:
            msg_obj = None

        if isinstance(msg_obj, dict):
            base.update(msg_obj)
        else:
            base["message"] = record.getMessage()

        ev = getattr(record, "event", None)
        if isinstance(ev, dict):
            base.update(ev)
        elif ev is not None:
            base["event"] = ev

        return json.dumps(base, ensure_ascii=False)


def _log_event(logger: logging.Logger, event: str, **fields: object) -> None:
    payload: dict[str, object] = {"event": event}
    payload.update(fields)
    logger.info("event", extra={"event": payload})


def _load_yaml(path: Path) -> dict:
    import yaml

    raw = path.read_text(encoding="utf-8")

    def _expand_env(s: str) -> str:
        out = ""
        i = 0
        while i < len(s):
            if s[i : i + 2] == "${":
                j = s.find("}", i + 2)
                if j == -1:
                    out += s[i:]
                    break
                key = s[i + 2 : j]
                out += os.environ.get(key, "")
                i = j + 1
            else:
                out += s[i]
                i += 1
        return out

    raw = _expand_env(raw)
    return yaml.safe_load(raw) or {}


def _setup_logging(log_dir: Path, episode_date: str) -> None:
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"{episode_date}.log"

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    fmt_kind = (os.environ.get("LOG_FORMAT") or "text").strip().lower()
    if fmt_kind == "json":
        fmt: logging.Formatter = _JsonFormatter()
    else:
        fmt = logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)

    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setFormatter(fmt)

    root.handlers.clear()
    root.addHandler(sh)
    root.addHandler(fh)


def _normalize_doubao_mode(raw: str) -> str:
    s = (raw or "").strip().lower()
    if s in {"tts", "tts_v3_http", "tts_v3_ws"}:
        return s
    if s in {"podcast", "voiceclone_http"}:
        return s
    return s


def _doubao_mode_group(mode: str) -> str:
    m = _normalize_doubao_mode(mode)
    if m in {"tts", "tts_v3_http", "tts_v3_ws"}:
        return "tts"
    if m in {"podcast"}:
        return "podcast"
    if m in {"voiceclone_http"}:
        return "voiceclone_http"
    return ""


def _apply_doubao_mode_env() -> None:
    mode = _normalize_doubao_mode(os.environ.get("DOUBAO_MODE") or "")
    grp = _doubao_mode_group(mode)
    if not grp:
        return

    keep_keys = {
        "DOUBAO_MODE",
        "DOTENV_OVERRIDE",
        "HTTP_TIMEOUT_SECONDS",
        "LOG_FORMAT",
        "PODCAST_DB_PATH",
        "DOUBAO_APP_ID",
        "DOUBAO_ACCESS_KEY",
        "DOUBAO_SECRET_KEY",
        "DOUBAO_REGION",
        "DOUBAO_TTS_DISABLE_FALLBACK",
        "DOUBAO_TTS_FORCE",
    }

    candidates = []
    candidates.append(f".env.{mode}")
    candidates.append(f".env.{grp}")
    seen: set[str] = set()
    for cand in candidates:
        if cand in seen:
            continue
        seen.add(cand)
        p = Path(cand)
        if p.exists() and p.is_file():
            load_dotenv(dotenv_path=p, override=True)

    clear_prefixes: list[str]
    clear_keys: set[str]
    if grp == "voiceclone_http":
        clear_prefixes = ["DOUBAO_TTS_", "DOUBAO_PODCAST_", "DOUBAO_WS_"]
        clear_keys = {"DOUBAO_RESOURCE_ID"}
    elif grp == "podcast":
        clear_prefixes = ["DOUBAO_TTS_", "DOUBAO_VOICECLONE_"]
        clear_keys = {
            "DOUBAO_TTS_VOICE",
            "DOUBAO_TTS_RESOURCE_ID",
            "DOUBAO_TTS_V3_RESOURCE_ID",
            "DOUBAO_TTS_V3_URL",
            "DOUBAO_TTS_V3_WS_URL",
        }
    else:
        # tts group
        clear_prefixes = ["DOUBAO_VOICECLONE_", "DOUBAO_PODCAST_", "DOUBAO_WS_"]
        clear_keys = {"DOUBAO_RESOURCE_ID"}

    for k in list(os.environ.keys()):
        if k in keep_keys:
            continue
        if k in clear_keys:
            os.environ.pop(k, None)
            continue
        for pref in clear_prefixes:
            if k.startswith(pref):
                os.environ.pop(k, None)
                break


def _today_str() -> str:
    return dt.date.today().isoformat()


def _estimate_tokens(text: str) -> int:
    if not text:
        return 0
    cjk = 0
    for ch in text:
        o = ord(ch)
        if (
            0x4E00 <= o <= 0x9FFF
            or 0x3400 <= o <= 0x4DBF
            or 0x20000 <= o <= 0x2A6DF
            or 0x2A700 <= o <= 0x2B73F
            or 0x2B740 <= o <= 0x2B81F
            or 0x2B820 <= o <= 0x2CEAF
        ):
            cjk += 1
    other = max(0, len(text) - cjk)
    return int(cjk + (other / 4.0))


def _text_stats(text: str | None) -> tuple[int, int]:
    s = (text or "").strip()
    return len(s), _estimate_tokens(s)


def _file_size_bytes(path: Path | None) -> int | None:
    if path is None:
        return None
    try:
        return int(path.stat().st_size)
    except Exception:
        return None


def _strip_angle_tags(s: str) -> str:
    out: list[str] = []
    in_tag = False
    for ch in (s or ""):
        if ch == "<":
            in_tag = True
            continue
        if ch == ">":
            in_tag = False
            continue
        if not in_tag:
            out.append(ch)
    return "".join(out).strip()


def _ps_single_quote(s: str) -> str:
    return "'" + (s or "").replace("'", "''") + "'"


def _sapi_tts_to_mp3(*, text: str, out_mp3_path: Path, timeout_s: int) -> bytes:
    out_mp3_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_txt = out_mp3_path.with_suffix(out_mp3_path.suffix + ".txt")
    tmp_wav = out_mp3_path.with_suffix(out_mp3_path.suffix + ".wav")
    tmp_mp3 = out_mp3_path.with_suffix(out_mp3_path.suffix + ".tmp.mp3")
    tmp_txt.write_text(text, encoding="utf-8")

    wav_ps = _ps_single_quote(str(tmp_wav))
    txt_ps = _ps_single_quote(str(tmp_txt))
    ps_script = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        f"$t = Get-Content -Raw -Encoding UTF8 {txt_ps}; "
        f"$s.SetOutputToWaveFile({wav_ps}); "
        "$s.Speak($t); "
        "$s.Dispose();"
    )

    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
        check=True,
        timeout=timeout_s,
    )

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(tmp_wav),
            "-c:a",
            "libmp3lame",
            "-q:a",
            "3",
            str(tmp_mp3),
        ],
        check=True,
        timeout=timeout_s,
    )

    b = tmp_mp3.read_bytes()
    out_mp3_path.write_bytes(b)
    return b


def _edge_tts_to_mp3(*, text: str, out_mp3_path: Path, timeout_s: int) -> bytes:
    out_mp3_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_txt = out_mp3_path.with_suffix(out_mp3_path.suffix + ".txt")
    tmp_mp3 = out_mp3_path.with_suffix(out_mp3_path.suffix + ".tmp.mp3")
    tmp_txt.write_text(text, encoding="utf-8")

    voice = (os.environ.get("EDGE_TTS_VOICE") or "zh-CN-XiaoxiaoNeural").strip() or "zh-CN-XiaoxiaoNeural"

    subprocess.run(
        [
            sys.executable,
            "-m",
            "edge_tts",
            "--file",
            str(tmp_txt),
            "--voice",
            voice,
            "--write-media",
            str(tmp_mp3),
        ],
        check=True,
        timeout=timeout_s,
    )

    b = tmp_mp3.read_bytes()
    out_mp3_path.write_bytes(b)
    return b


def _local_tts_to_mp3(*, text: str, out_mp3_path: Path, timeout_s: int) -> bytes:
    last_err: Exception | None = None

    if sys.platform.startswith("win") and shutil.which("ffmpeg") is not None:
        try:
            return _sapi_tts_to_mp3(text=text, out_mp3_path=out_mp3_path, timeout_s=timeout_s)
        except Exception as e:  # noqa: BLE001
            last_err = e

    try:
        return _edge_tts_to_mp3(text=text, out_mp3_path=out_mp3_path, timeout_s=timeout_s)
    except Exception as e:  # noqa: BLE001
        last_err = e

    raise RuntimeError(
        "local tts failed: install python package 'edge-tts' or install 'ffmpeg' for SAPI wav->mp3 conversion"
    ) from last_err


def _render_audio_simple(*, main_path: Path, out_path: Path, timeout_seconds: int) -> None:
    if not main_path.exists():
        raise RuntimeError(f"missing main audio: {main_path}")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(main_path),
            "-filter:a",
            "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "3",
            str(out_path),
        ],
        check=True,
        timeout=timeout_seconds,
    )


def _calc_items_text_stats(items: list[dict]) -> tuple[int, int, int, int]:
    total_chars = 0
    total_tokens = 0
    max_item_chars = 0
    max_item_tokens = 0
    for it in items:
        s = (it.get("title") or "") + "\n" + (it.get("summary") or "") + "\n" + (it.get("content") or "")
        c = len(s)
        t = _estimate_tokens(s)
        total_chars += c
        total_tokens += t
        if c > max_item_chars:
            max_item_chars = c
        if t > max_item_tokens:
            max_item_tokens = t
    return total_chars, total_tokens, max_item_chars, max_item_tokens


def _apply_category(items: list[dict], category: str) -> None:
    cat = (category or "").strip() or "others"
    for it in items:
        if isinstance(it, dict) and "category" not in it:
            it["category"] = cat


def _archive_fetch_result(
    *,
    archive_base_dir: Path,
    episode_date: str,
    prefix: str,
    payload: dict,
) -> Path:
    try:
        d = dt.date.fromisoformat(episode_date)
    except Exception:
        d = dt.date.today()

    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = archive_base_dir / f"{d.year:04d}" / f"{d.month:02d}" / f"{d.day:02d}"
    out_dir.mkdir(parents=True, exist_ok=True)

    out_path = out_dir / f"{prefix}_{ts}.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


def _episode_archive_dir(archive_base_dir: Path, episode_date: str) -> Path:
    try:
        d = dt.date.fromisoformat(episode_date)
    except Exception:
        d = dt.date.today()
    return archive_base_dir / f"{d.year:04d}" / f"{d.month:02d}" / f"{d.day:02d}"


def _find_latest_archive(archive_base_dir: Path, episode_date: str, prefix: str) -> Path | None:
    d = _episode_archive_dir(archive_base_dir, episode_date)
    if not d.exists():
        return None
    cands = sorted(d.glob(f"{prefix}_*.json"))
    return cands[-1] if cands else None


def _extract_metaso_clean_payload(metaso: dict) -> dict | None:
    if not isinstance(metaso, dict):
        return None

    def _extract(resp: dict) -> tuple[str | None, list | None, str | None]:
        content: str | None = None
        citations: list | None = None
        model: str | None = None

        m = resp.get("model")
        if isinstance(m, str) and m.strip():
            model = m.strip()

        choices = resp.get("choices")
        if isinstance(choices, list) and choices:
            msg = (choices[0] or {}).get("message")
            if isinstance(msg, dict):
                c = msg.get("content")
                if isinstance(c, str) and c.strip():
                    content = c

                cites = msg.get("citations")
                if isinstance(cites, list):
                    citations = cites

        return content, citations, model

    content: str | None = None
    citations: list | None = None
    model: str | None = None

    resp_json = metaso.get("response_json")
    if isinstance(resp_json, dict):
        try:
            content, citations, model = _extract(resp_json)
        except Exception:
            pass

    if content is None:
        resp_text = metaso.get("response_text")
        if isinstance(resp_text, str) and resp_text.strip():
            try:
                parsed = json.loads(resp_text)
                if isinstance(parsed, dict):
                    content, citations, model = _extract(parsed)
            except Exception:
                pass

    if content is None:
        return None

    model2 = None
    m2 = metaso.get("model")
    if isinstance(m2, str) and m2.strip():
        model2 = m2.strip()
    elif isinstance(model, str) and model.strip():
        model2 = model.strip()

    if citations is None:
        citations = []

    return {
        "content": content,
        "citations": citations,
        "meta": {
            "provider": "metaso",
            "model": model2,
        },
    }


def step_fetch(
    store: Store,
    cfg: dict,
    episode_id: str,
    timeout_s: int,
    force_fetch: bool,
    metaso_max_items: int | None = None,
) -> None:
    log = logging.getLogger("step.fetch")

    ep = store.get_episode(episode_id)

    rss_sources = (cfg.get("sources") or {}).get("rss") or []
    sixtys_sources = (cfg.get("sources") or {}).get("sixtys") or []
    aibot_sources = (cfg.get("sources") or {}).get("aibot_daily") or []
    lily_sources_raw = (cfg.get("sources") or {}).get("lily_rss") or []
    max_items = int((cfg.get("pipeline") or {}).get("max_items") or 8)

    out_cfg = cfg.get("output") or {}
    fetch_archives_dir = Path(out_cfg.get("fetch_archives_dir") or "./out/fetch_archives")
    script_dir = Path(out_cfg.get("script_dir") or "./out/script")
    script_dir.mkdir(parents=True, exist_ok=True)

    filter_cfg = cfg.get("filter") or {}
    filter_fields = filter_cfg.get("fields")
    filter_keep_raw = bool(filter_cfg.get("keep_raw") or False)
    if filter_fields is None:
        filter_fields2: list[str] | None = None
    elif isinstance(filter_fields, list):
        filter_fields2 = [str(x) for x in filter_fields]
    else:
        filter_fields2 = None

    warn_duration_ms = int(os.environ.get("FETCH_WARN_DURATION_MS", "15000"))
    warn_total_tokens = int(os.environ.get("FETCH_HEALTH_WARN_TOTAL_TOKENS", "20000"))
    warn_max_item_tokens = int(os.environ.get("FETCH_HEALTH_WARN_MAX_ITEM_TOKENS", "8000"))

    run_id = store.create_fetch_run(episode_id)
    _log_event(
        log,
        "fetch_run_start",
        run_id=int(run_id),
        episode_id=str(episode_id),
        max_items=int(max_items),
    )
    _log_event(
        log,
        "step_stats",
        step="fetch",
        phase="before",
        episode_id=str(episode_id),
        max_items=int(max_items),
        rss_sources=int(len(rss_sources)),
        aibot_sources=int(len(aibot_sources)),
        sixtys_sources=int(len(sixtys_sources)),
        lily_entries=int(len(list(lily_sources_raw)) if isinstance(lily_sources_raw, list) else 0),
    )
    try:
        fetched: list[dict] = []

        for src in rss_sources:
            enabled = (src or {}).get("enabled")
            if enabled is False:
                continue

            name = (src or {}).get("name") or "rss"

            category = ((src or {}).get("category") or "others").strip() or "others"
            url = (src or {}).get("url")
            urls = (src or {}).get("urls")
            candidates = []
            if isinstance(urls, list):
                for u in urls:
                    if isinstance(u, str) and u.strip():
                        candidates.append(u.strip())
            if isinstance(url, str) and url.strip():
                candidates.append(url.strip())
            if not candidates:
                continue

            ok_any = False
            for cand in candidates:
                log.info("fetch rss: %s %s", name, cand)
                t0 = time.perf_counter()
                try:
                    items, sc = fetch_rss_items_with_status(url=cand, source=name, timeout_seconds=timeout_s)
                    _apply_category(items, category)
                    total_chars, total_tokens, max_item_chars, max_item_tokens = _calc_items_text_stats(items)
                    fetched.extend(items)
                    dur_ms = int((time.perf_counter() - t0) * 1000)
                    store.add_fetch_attempt(
                        run_id=run_id,
                        source_type="rss",
                        source_name=name,
                        url=str(cand),
                        ok=True,
                        status_code=(int(sc) if sc is not None else None),
                        error=None,
                        duration_ms=dur_ms,
                        item_count=len(items),
                        total_chars=total_chars,
                        est_tokens=total_tokens,
                        max_item_chars=max_item_chars,
                        max_item_tokens=max_item_tokens,
                    )
                    _log_event(
                        log,
                        "fetch_attempt",
                        run_id=int(run_id),
                        source_type="rss",
                        source_name=str(name),
                        url=str(cand),
                        ok=True,
                        status_code=(int(sc) if sc is not None else None),
                        duration_ms=int(dur_ms),
                        item_count=int(len(items)),
                        total_chars=int(total_chars),
                        est_tokens=int(total_tokens),
                        max_item_chars=int(max_item_chars),
                        max_item_tokens=int(max_item_tokens),
                    )
                    if len(items) == 0:
                        log.warning("fetch rss ok but 0 items: %s", name)
                    if dur_ms >= warn_duration_ms:
                        log.warning("fetch rss slow: %s ms=%s", name, dur_ms)
                    if total_tokens >= warn_total_tokens or max_item_tokens >= warn_max_item_tokens:
                        log.warning(
                            "fetch rss tokens large: %s total=%s max_item=%s",
                            name,
                            total_tokens,
                            max_item_tokens,
                        )
                    ok_any = True
                    break
                except Exception as e:  # noqa: BLE001
                    resp = getattr(e, "response", None)
                    sc2 = getattr(resp, "status_code", None)
                    dur_ms = int((time.perf_counter() - t0) * 1000)
                    store.add_fetch_attempt(
                        run_id=run_id,
                        source_type="rss",
                        source_name=name,
                        url=str(cand),
                        ok=False,
                        status_code=sc2,
                        error=str(e),
                        duration_ms=dur_ms,
                        item_count=0,
                        total_chars=0,
                        est_tokens=0,
                        max_item_chars=0,
                        max_item_tokens=0,
                    )
                    _log_event(
                        log,
                        "fetch_attempt",
                        run_id=int(run_id),
                        source_type="rss",
                        source_name=str(name),
                        url=str(cand),
                        ok=False,
                        status_code=sc2,
                        duration_ms=int(dur_ms),
                        item_count=0,
                        error=str(e),
                    )
                    log.warning("fetch rss failed: %s", e)

            if not ok_any:
                log.warning("fetch rss all candidates failed: %s", name)

        for src in aibot_sources:
            enabled = (src or {}).get("enabled")
            if enabled is False:
                continue

            name = (src or {}).get("name") or "AI工具集-每日AI快讯"
            category = ((src or {}).get("category") or "others").strip() or "others"
            url = (src or {}).get("url")
            urls = (src or {}).get("urls")
            candidates = []
            if isinstance(urls, list):
                for u in urls:
                    if isinstance(u, str) and u.strip():
                        candidates.append(u.strip())
            if isinstance(url, str) and url.strip():
                candidates.append(url.strip())
            if not candidates:
                continue

            ok_any = False
            for cand in candidates:
                log.info("fetch aibot_daily: %s %s", name, cand)
                t0 = time.perf_counter()
                try:
                    items, sc = fetch_aibot_daily_items_with_status(
                        url=cand,
                        source=name,
                        episode_date=ep["episode_date"],
                        timeout_seconds=timeout_s,
                    )
                    _apply_category(items, category)
                    total_chars, total_tokens, max_item_chars, max_item_tokens = _calc_items_text_stats(items)
                    fetched.extend(items)
                    dur_ms = int((time.perf_counter() - t0) * 1000)
                    store.add_fetch_attempt(
                        run_id=run_id,
                        source_type="aibot_daily",
                        source_name=name,
                        url=str(cand),
                        ok=True,
                        status_code=(int(sc) if sc is not None else None),
                        error=None,
                        duration_ms=dur_ms,
                        item_count=len(items),
                        total_chars=total_chars,
                        est_tokens=total_tokens,
                        max_item_chars=max_item_chars,
                        max_item_tokens=max_item_tokens,
                    )
                    _log_event(
                        log,
                        "fetch_attempt",
                        run_id=int(run_id),
                        source_type="aibot_daily",
                        source_name=str(name),
                        url=str(cand),
                        ok=True,
                        status_code=(int(sc) if sc is not None else None),
                        duration_ms=int(dur_ms),
                        item_count=int(len(items)),
                        total_chars=int(total_chars),
                        est_tokens=int(total_tokens),
                        max_item_chars=int(max_item_chars),
                        max_item_tokens=int(max_item_tokens),
                    )
                    if len(items) == 0:
                        log.warning("fetch aibot_daily ok but 0 items: %s", name)
                    if dur_ms >= warn_duration_ms:
                        log.warning("fetch aibot_daily slow: %s ms=%s", name, dur_ms)
                    if total_tokens >= warn_total_tokens or max_item_tokens >= warn_max_item_tokens:
                        log.warning(
                            "fetch aibot_daily tokens large: %s total=%s max_item=%s",
                            name,
                            total_tokens,
                            max_item_tokens,
                        )
                    ok_any = True
                    break
                except Exception as e:  # noqa: BLE001
                    resp = getattr(e, "response", None)
                    sc2 = getattr(resp, "status_code", None)
                    dur_ms = int((time.perf_counter() - t0) * 1000)
                    store.add_fetch_attempt(
                        run_id=run_id,
                        source_type="aibot_daily",
                        source_name=name,
                        url=str(cand),
                        ok=False,
                        status_code=sc2,
                        error=str(e),
                        duration_ms=dur_ms,
                        item_count=0,
                        total_chars=0,
                        est_tokens=0,
                        max_item_chars=0,
                        max_item_tokens=0,
                    )
                    _log_event(
                        log,
                        "fetch_attempt",
                        run_id=int(run_id),
                        source_type="aibot_daily",
                        source_name=str(name),
                        url=str(cand),
                        ok=False,
                        status_code=(int(sc2) if sc2 is not None else None),
                        duration_ms=int(dur_ms),
                        item_count=0,
                        error=str(e),
                    )
                    log.warning("fetch aibot_daily failed: %s", e)

            if not ok_any:
                log.warning("fetch aibot_daily all candidates failed: %s", name)

        for src in sixtys_sources:
            enabled = (src or {}).get("enabled")
            if enabled is False:
                continue

            name = (src or {}).get("name") or "60s"
            base_url = ((src or {}).get("base_url") or "").strip() or "https://60s.viki.moe"
            base_urls = (src or {}).get("base_urls")
            base_urls2 = base_urls if isinstance(base_urls, list) else None
            category = ((src or {}).get("category") or "others").strip() or "others"

            log.info("fetch sixtys: %s base=%s", name, base_url)
            t0 = time.perf_counter()
            try:
                items, sc, used_base = fetch_sixtys_items_with_status(
                    base_url=base_url,
                    base_urls=base_urls2,
                    source=name,
                    timeout_seconds=timeout_s,
                )
                used_base2 = used_base or base_url
                _apply_category(items, category)
                total_chars, total_tokens, max_item_chars, max_item_tokens = _calc_items_text_stats(items)
                fetched.extend(items)
                dur_ms = int((time.perf_counter() - t0) * 1000)

                store.add_fetch_attempt(
                    run_id=run_id,
                    source_type="sixtys",
                    source_name=name,
                    url=f"{used_base2.rstrip('/')}/v2/60s",
                    ok=True,
                    status_code=(int(sc) if sc is not None else None),
                    error=None,
                    duration_ms=dur_ms,
                    item_count=len(items),
                    total_chars=total_chars,
                    est_tokens=total_tokens,
                    max_item_chars=max_item_chars,
                    max_item_tokens=max_item_tokens,
                )

                _log_event(
                    log,
                    "fetch_attempt",
                    run_id=int(run_id),
                    source_type="sixtys",
                    source_name=str(name),
                    url=f"{used_base2.rstrip('/')}/v2/60s",
                    ok=True,
                    status_code=(int(sc) if sc is not None else None),
                    duration_ms=int(dur_ms),
                    item_count=int(len(items)),
                    total_chars=int(total_chars),
                    est_tokens=int(total_tokens),
                    max_item_chars=int(max_item_chars),
                    max_item_tokens=int(max_item_tokens),
                )

                if len(items) == 0:
                    log.warning("fetch sixtys ok but 0 items: %s", name)
                if dur_ms >= warn_duration_ms:
                    log.warning("fetch sixtys slow: %s ms=%s", name, dur_ms)
                if total_tokens >= warn_total_tokens or max_item_tokens >= warn_max_item_tokens:
                    log.warning(
                        "fetch sixtys tokens large: %s total=%s max_item=%s",
                        name,
                        total_tokens,
                        max_item_tokens,
                    )
            except Exception as e:  # noqa: BLE001
                resp = getattr(e, "response", None)
                sc2 = getattr(resp, "status_code", None)
                dur_ms = int((time.perf_counter() - t0) * 1000)

                store.add_fetch_attempt(
                    run_id=run_id,
                    source_type="sixtys",
                    source_name=name,
                    url=f"{base_url.rstrip('/')}/v2/60s",
                    ok=False,
                    status_code=sc2,
                    error=str(e),
                    duration_ms=dur_ms,
                    item_count=0,
                    total_chars=0,
                    est_tokens=0,
                    max_item_chars=0,
                    max_item_tokens=0,
                )

                _log_event(
                    log,
                    "fetch_attempt",
                    run_id=int(run_id),
                    source_type="sixtys",
                    source_name=str(name),
                    url=f"{base_url.rstrip('/')}/v2/60s",
                    ok=False,
                    status_code=sc2,
                    duration_ms=int(dur_ms),
                    item_count=0,
                    error=str(e),
                )
                log.warning("fetch sixtys failed: %s", e)

        def _iter_lily_entries(raw: list[object]) -> list[dict]:
            out: list[dict] = []
            for x in raw:
                if not isinstance(x, dict):
                    continue
                group = (x.get("group") or "").strip()
                items = x.get("items")
                if group and isinstance(items, list):
                    if x.get("enabled") is False:
                        continue
                    for it in items:
                        if not isinstance(it, dict):
                            continue
                        it2 = dict(it)
                        it2["_group"] = group
                        out.append(it2)
                else:
                    out.append(dict(x))
            return out

        lily_entries = _iter_lily_entries(list(lily_sources_raw))
        for src in lily_entries:
            enabled = (src or {}).get("enabled")
            if enabled is False:
                continue

            group = ((src or {}).get("_group") or "").strip()
            category = group or "others"
            name0 = (src or {}).get("name") or "lilyrss"
            name = f"{group}/{name0}" if group else str(name0)

            kind = ((src or {}).get("kind") or "").strip()
            value = ((src or {}).get("value") or "").strip()
            base_url = ((src or {}).get("base_url") or "").strip() or "https://rss.lilydjwg.me"
            query = (src or {}).get("query")
            if not isinstance(query, dict):
                query = None

            if not kind or not value:
                continue

            log.info("fetch lilyrss: %s kind=%s", name, kind)
            t0 = time.perf_counter()
            try:
                feed_url = build_lily_rss_url(kind=kind, value=value, base_url=base_url, query=query)
                items, sc = fetch_rss_items_with_status(url=feed_url, source=name, timeout_seconds=timeout_s)
                _apply_category(items, category)
                total_chars, total_tokens, max_item_chars, max_item_tokens = _calc_items_text_stats(items)
                fetched.extend(items)
                dur_ms = int((time.perf_counter() - t0) * 1000)
                store.add_fetch_attempt(
                    run_id=run_id,
                    source_type="lily_rss",
                    source_name=name,
                    url=feed_url,
                    ok=True,
                    status_code=(int(sc) if sc is not None else None),
                    error=None,
                    duration_ms=dur_ms,
                    item_count=len(items),
                    total_chars=total_chars,
                    est_tokens=total_tokens,
                    max_item_chars=max_item_chars,
                    max_item_tokens=max_item_tokens,
                )
                _log_event(
                    log,
                    "fetch_attempt",
                    run_id=int(run_id),
                    source_type="lily_rss",
                    source_name=str(name),
                    url=str(feed_url),
                    ok=True,
                    status_code=(int(sc) if sc is not None else None),
                    duration_ms=int(dur_ms),
                    item_count=int(len(items)),
                    total_chars=int(total_chars),
                    est_tokens=int(total_tokens),
                    max_item_chars=int(max_item_chars),
                    max_item_tokens=int(max_item_tokens),
                )
                if len(items) == 0:
                    log.warning("fetch lilyrss ok but 0 items: %s", name)
                if dur_ms >= warn_duration_ms:
                    log.warning("fetch lilyrss slow: %s ms=%s", name, dur_ms)
                if total_tokens >= warn_total_tokens or max_item_tokens >= warn_max_item_tokens:
                    log.warning(
                        "fetch lilyrss tokens large: %s total=%s max_item=%s",
                        name,
                        total_tokens,
                        max_item_tokens,
                    )
            except Exception as e:  # noqa: BLE001
                resp = getattr(e, "response", None)
                sc2 = getattr(resp, "status_code", None)
                dur_ms = int((time.perf_counter() - t0) * 1000)
                store.add_fetch_attempt(
                    run_id=run_id,
                    source_type="lily_rss",
                    source_name=name,
                    url=str(value),
                    ok=False,
                    status_code=sc2,
                    error=str(e),
                    duration_ms=dur_ms,
                    item_count=0,
                    total_chars=0,
                    est_tokens=0,
                    max_item_chars=0,
                    max_item_tokens=0,
                )
                _log_event(
                    log,
                    "fetch_attempt",
                    run_id=int(run_id),
                    source_type="lily_rss",
                    source_name=str(name),
                    url=str(value),
                    ok=False,
                    status_code=sc2,
                    duration_ms=int(dur_ms),
                    item_count=0,
                    error=str(e),
                )
                log.warning("fetch lilyrss failed: %s", e)

        fetched_raw = list(fetched)
        fetched = dedup_items(fetched, max_items=max_items)

        raw_total_chars, raw_total_tokens, raw_max_item_chars, raw_max_item_tokens = _calc_items_text_stats(fetched_raw)
        dedup_total_chars, dedup_total_tokens, dedup_max_item_chars, dedup_max_item_tokens = _calc_items_text_stats(fetched)

        _log_event(
            log,
            "step_stats",
            step="fetch",
            phase="after_dedup",
            episode_id=str(episode_id),
            raw_count=int(len(fetched_raw)),
            raw_total_chars=int(raw_total_chars),
            raw_est_tokens=int(raw_total_tokens),
            raw_max_item_chars=int(raw_max_item_chars),
            raw_max_item_tokens=int(raw_max_item_tokens),
            dedup_count=int(len(fetched)),
            dedup_total_chars=int(dedup_total_chars),
            dedup_est_tokens=int(dedup_total_tokens),
            dedup_max_item_chars=int(dedup_max_item_chars),
            dedup_max_item_tokens=int(dedup_max_item_tokens),
        )

        upserted = store.upsert_items(fetched)
        store.set_episode_status(episode_id, "fetched")

        try:
            archive_path = _archive_fetch_result(
                archive_base_dir=fetch_archives_dir,
                episode_date=ep["episode_date"],
                prefix="rss",
                payload={
                    "episode_id": episode_id,
                    "episode_date": ep["episode_date"],
                    "run_id": run_id,
                    "created_at": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
                    "max_items": max_items,
                    "raw_count": len(fetched_raw),
                    "dedup_count": len(fetched),
                    "items_raw": fetched_raw,
                    "items": fetched,
                },
            )
            log.info("fetch archive saved: %s", archive_path)

            try:
                filtered_payload = filter_fetch_archive_payload(
                    json.loads(Path(archive_path).read_text(encoding="utf-8")),
                    fields=filter_fields2,
                    keep_raw=filter_keep_raw,
                )
                filtered_path = _archive_fetch_result(
                    archive_base_dir=fetch_archives_dir,
                    episode_date=ep["episode_date"],
                    prefix="rss_filtered",
                    payload=filtered_payload,
                )
                log.info("fetch filtered archive saved: %s", filtered_path)
                _log_event(
                    log,
                    "fetch_filter",
                    run_id=int(run_id),
                    archive_path=str(archive_path),
                    filtered_path=str(filtered_path),
                    fields=(filter_fields2 if filter_fields2 is not None else ["title"]),
                )

                try:
                    items2 = filtered_payload.get("items")
                    items3 = items2 if isinstance(items2, list) else []
                    research_cfg = cfg.get("research") or {}
                    metaso_cfg = research_cfg.get("metaso") if isinstance(research_cfg, dict) else None
                    metaso_cfg2 = metaso_cfg if isinstance(metaso_cfg, dict) else {}

                    cfg_max_items = metaso_cfg2.get("max_items") if isinstance(metaso_cfg2.get("max_items"), int) else None
                    max_items_for_metaso = metaso_max_items if metaso_max_items is not None else cfg_max_items

                    # 创建研究客户端
                    research_client = create_client_from_env("metaso")
                    
                    # 执行研究
                    research_result = research_items_with_client(
                        client=research_client,
                        items=items3,
                        max_items=max_items_for_metaso,
                        use_retry=True
                    )
                    
                    if research_result.success:
                        # 构建兼容旧格式的响应
                        r = {
                            "content": research_result.content,
                            "model": research_result.model,
                            "metadata": research_result.metadata
                        }
                        
                        research_payload = {
                            "episode_id": episode_id,
                            "episode_date": ep["episode_date"],
                            "run_id": run_id,
                            "created_at": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
                            "filtered_path": str(filtered_path),
                            "raw_items_count": int(filtered_payload.get("raw_items_count") or 0),
                            "filtered_items_count": int(filtered_payload.get("filtered_items_count") or 0),
                            "metaso": r,
                            "research_result": research_result.model_dump(),  # 新格式结果
                        }
                        research_path = _archive_fetch_result(
                            archive_base_dir=fetch_archives_dir,
                            episode_date=ep["episode_date"],
                            prefix="rss_research",
                            payload=research_payload,
                        )
                        log.info("fetch research archive saved: %s", research_path)
                        _log_event(
                            log,
                            "fetch_research",
                            run_id=int(run_id),
                            filtered_path=str(filtered_path),
                            research_path=str(research_path),
                            ok=bool(r.get("ok")),
                            status=(r.get("status")),
                        )

                        clean_payload = _extract_metaso_clean_payload(r)
                        if clean_payload is not None:
                            content_path = _archive_fetch_result(
                                archive_base_dir=fetch_archives_dir,
                                episode_date=ep["episode_date"],
                                prefix="rss_research_content",
                                payload=clean_payload,
                            )
                            log.info("fetch research content saved: %s", content_path)
                            _log_event(
                                log,
                                "fetch_research_content",
                                run_id=int(run_id),
                                research_path=str(research_path),
                                content_path=str(content_path),
                            )
                except Exception as e:  # noqa: BLE001
                    log.warning("metaso research failed: %s", e)
            except Exception as e:  # noqa: BLE001
                log.warning("fetch filter failed: %s", e)
        except Exception as e:  # noqa: BLE001
            log.warning("fetch archive failed: %s", e)

        log.info("items fetched=%d upserted=%d", len(fetched), upserted)
    finally:
        try:
            store.finish_fetch_run(run_id)
        except Exception:
            pass

        _log_event(
            log,
            "fetch_run_finish",
            run_id=int(run_id),
            episode_id=str(episode_id),
        )


def step_list_fetch_health_trend(store: Store, days: int, limit: int) -> None:
    log = logging.getLogger("step.list_fetch_health_trend")
    since_s = int(time.time()) - max(1, int(days or 7)) * 86400
    limit2 = max(1, int(limit or 200))

    with store._connect() as con:  # noqa: SLF001
        rows = con.execute(
            """
            SELECT date(created_at, 'unixepoch') AS d,
                   source_type,
                   source_name,
                   COUNT(*) AS total,
                   SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS failed,
                   SUM(CASE WHEN ok=1 AND item_count=0 THEN 1 ELSE 0 END) AS ok_zero,
                   AVG(duration_ms) AS avg_ms,
                   MAX(duration_ms) AS max_ms,
                   SUM(est_tokens) AS est_tokens
            FROM fetch_attempts
            WHERE created_at >= ?
            GROUP BY d, source_type, source_name
            ORDER BY d DESC, failed DESC, total DESC
            LIMIT ?
            """.strip(),
            (since_s, limit2),
        ).fetchall()

        log.info("fetch health trend rows=%d since=%s", len(rows), dt.datetime.fromtimestamp(since_s).isoformat())
        for r in rows:
            log.info(
                "trend: day=%s type=%s name=%s total=%s failed=%s ok_zero=%s avg_ms=%s max_ms=%s est_tokens=%s",
                r[0],
                r[1],
                r[2],
                r[3] or 0,
                r[4] or 0,
                r[5] or 0,
                int(r[6] or 0),
                r[7] or 0,
                r[8] or 0,
            )


def step_list_fetch_health(store: Store, cfg: dict, days: int, limit: int, only_failed: bool) -> None:
    log = logging.getLogger("step.list_fetch_health")
    since_s = int(time.time()) - max(1, int(days or 7)) * 86400
    limit2 = max(1, int(limit or 50))

    warn_total_tokens = int(os.environ.get("FETCH_HEALTH_WARN_TOTAL_TOKENS", "20000"))
    warn_max_item_tokens = int(os.environ.get("FETCH_HEALTH_WARN_MAX_ITEM_TOKENS", "8000"))

    cond = "created_at >= ?"
    params: list[object] = [since_s]
    if only_failed:
        cond += " AND ok = 0"

    with store._connect() as con:  # noqa: SLF001
        rows = con.execute(
            f"""
            SELECT source_type, source_name, COUNT(*) AS total,
                   SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS failed,
                   SUM(total_chars) AS total_chars,
                   SUM(est_tokens) AS est_tokens,
                   MAX(max_item_chars) AS max_item_chars,
                   MAX(max_item_tokens) AS max_item_tokens,
                   MAX(created_at) AS last_ts
            FROM fetch_attempts
            WHERE {cond}
            GROUP BY source_type, source_name
            ORDER BY failed DESC, total DESC
            LIMIT ?
            """.strip(),
            tuple(params + [limit2]),
        ).fetchall()

        log.info("fetch health sources=%d since=%s", len(rows), dt.datetime.fromtimestamp(since_s).isoformat())
        for r in rows:
            last_iso = dt.datetime.fromtimestamp(int(r[8])).isoformat() if r[8] else ""
            total_tokens = int(r[5] or 0)
            max_item_tokens = int(r[7] or 0)
            msg = (
                "source: type=%s name=%s total=%d failed=%d total_chars=%s est_tokens=%s max_item_chars=%s max_item_tokens=%s last=%s"
            )
            args = (r[0], r[1], r[2], r[3] or 0, r[4] or 0, total_tokens, r[6] or 0, max_item_tokens, last_iso)
            if total_tokens >= warn_total_tokens or max_item_tokens >= warn_max_item_tokens:
                log.warning(msg, *args)
            else:
                log.info(msg, *args)

        recent = con.execute(
            f"""
            SELECT created_at, source_type, source_name, ok, status_code, duration_ms, item_count, total_chars, est_tokens, max_item_chars, max_item_tokens, url, error
            FROM fetch_attempts
            WHERE {cond}
            ORDER BY created_at DESC
            LIMIT ?
            """.strip(),
            tuple(params + [limit2]),
        ).fetchall()

        for r in recent:
            ts_iso = dt.datetime.fromtimestamp(int(r[0])).isoformat() if r[0] else ""
            log.info(
                "attempt: ts=%s type=%s name=%s ok=%s status=%s ms=%s items=%s total_chars=%s est_tokens=%s max_item_chars=%s max_item_tokens=%s url=%s err=%s",
                ts_iso,
                r[1],
                r[2],
                "Y" if r[3] else "N",
                "" if r[4] is None else r[4],
                r[5],
                r[6],
                r[7] or 0,
                r[8] or 0,
                r[9] or 0,
                r[10] or 0,
                r[11],
                (r[12] or "")[:200],
            )

    out_cfg = (cfg or {}).get("output") or {}
    fetch_archives_dir = Path(out_cfg.get("fetch_archives_dir") or "./out/fetch_archives")
    if not fetch_archives_dir.exists():
        return

    files = sorted(
        [p for p in fetch_archives_dir.rglob("*_filtered_*.json") if p.is_file()],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not files:
        return

    log.info("filtered archives found=%d dir=%s", len(files), str(fetch_archives_dir))
    shown = 0
    for p in files:
        if shown >= limit2:
            break
        try:
            payload = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            log.warning("filtered archive read failed: %s err=%s", str(p), str(e))
            continue

        if not isinstance(payload, dict):
            continue

        raw_count = payload.get("raw_items_count")
        if raw_count is None:
            raw_count = payload.get("raw_count")
        filtered_count = payload.get("filtered_items_count")
        if filtered_count is None:
            items2 = payload.get("items")
            filtered_count = len(items2) if isinstance(items2, list) else None

        ep_date = (payload.get("episode_date") or "").strip()
        dropped = None
        if isinstance(raw_count, int) and isinstance(filtered_count, int):
            dropped = raw_count - filtered_count

        msg = "filter: date=%s file=%s raw=%s filtered=%s dropped=%s"
        args = (ep_date, p.name, raw_count, filtered_count, dropped)
        if isinstance(raw_count, int) and raw_count > 0 and isinstance(filtered_count, int) and filtered_count == 0:
            log.warning(msg, *args)
        else:
            log.info(msg, *args)
        shown += 1


def step_list_items(
    store: Store, items_source: str | None, items_limit: int, items_show_content: bool, items_text_limit: int
) -> None:
    log = logging.getLogger("step.list_items")

    source = (items_source or "").strip() or None
    limit = max(1, int(items_limit or 10))
    text_limit = max(0, int(items_text_limit or 0))

    conditions: list[str] = []
    params: list[object] = []
    if source:
        conditions.append("source = ?")
        params.append(source)

    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    with store._connect() as con:  # noqa: SLF001
        total = con.execute(f"SELECT COUNT(*) FROM items{where}", tuple(params)).fetchone()[0]
        cond2 = list(conditions)
        params2 = list(params)
        cond2.append("used_episode_id IS NULL")
        where2 = " WHERE " + " AND ".join(cond2)
        unused = con.execute(f"SELECT COUNT(*) FROM items{where2}", tuple(params2)).fetchone()[0]

        log.info("items total=%d unused=%d source_filter=%s", total, unused, source or "<all>")

        rows = con.execute(
            f"SELECT source, COUNT(*) AS cnt FROM items{where} GROUP BY source ORDER BY cnt DESC",
            tuple(params),
        ).fetchall()
        for r in rows:
            log.info("items by source: %s=%d", r[0], r[1])

        latest = con.execute(
            f"""
            SELECT id, title, summary, content, source, published_at, url, used_episode_id
            FROM items{where}
            ORDER BY COALESCE(published_at, '') DESC, updated_at DESC
            LIMIT ?
            """.strip(),
            tuple(params + [limit]),
        ).fetchall()

        for r in latest:
            log.info(
                "item: source=%s used=%s published_at=%s title=%s url=%s",
                r[4],
                "Y" if r[7] else "N",
                r[5] or "",
                r[1] or "",
                r[6] or "",
            )

            if items_show_content:
                summary = (r[2] or "").strip()
                content = (r[3] or "").strip()
                if text_limit > 0:
                    if len(summary) > text_limit:
                        summary = summary[:text_limit]
                    if len(content) > text_limit:
                        content = content[:text_limit]
                if summary:
                    log.info("item summary: %s", summary)
                if content:
                    log.info("item content: %s", content)


def step_script(store: Store, cfg: dict, episode_id: str, timeout_s: int, script_input: str) -> None:
    log = logging.getLogger("step.script")

    ep = store.get_episode(episode_id)
    if ep["status"] in {"scripted", "tts_done", "rendered", "published"}:
        log.info("episode already scripted or later; skip")
        return

    pick_items = int((cfg.get("pipeline") or {}).get("pick_items") or 5)
    channel = cfg.get("channel") or {}

    out_cfg = cfg.get("output") or {}
    fetch_archives_dir = Path(out_cfg.get("fetch_archives_dir") or "./out/fetch_archives")
    script_dir = Path(out_cfg.get("script_dir") or "./out/script")
    script_dir.mkdir(parents=True, exist_ok=True)

    research_content_path = _find_latest_archive(fetch_archives_dir, ep["episode_date"], "rss_research_content")
    use_research = False
    if script_input == "research":
        use_research = True
    elif script_input == "auto" and research_content_path is not None:
        use_research = True

    research_content = ""
    research_citations: list[dict] = []
    if use_research:
        if research_content_path is None:
            raise RuntimeError("script_input=research but rss_research_content archive not found")
        obj = json.loads(research_content_path.read_text(encoding="utf-8"))
        content = obj.get("content") if isinstance(obj, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("rss_research_content archive missing content")
        research_content = content
        cites = obj.get("citations") if isinstance(obj, dict) else None
        if isinstance(cites, list):
            research_citations = [c for c in cites if isinstance(c, dict)]

    items = store.pick_items_for_episode(episode_id=episode_id, limit=pick_items)
    if not items:
        if use_research and research_content:
            log.warning("no unused items available; continue with research content only")
            items = []
        else:
            raise RuntimeError("no items available to script")

    items_total_chars, items_total_tokens, items_max_item_chars, items_max_item_tokens = _calc_items_text_stats(items)
    research_chars, research_tokens = _text_stats(research_content)
    _log_event(
        log,
        "step_stats",
        step="script",
        phase="before",
        episode_id=str(episode_id),
        script_input=str(script_input),
        items_count=int(len(items)),
        items_total_chars=int(items_total_chars),
        items_est_tokens=int(items_total_tokens),
        items_max_item_chars=int(items_max_item_chars),
        items_max_item_tokens=int(items_max_item_tokens),
        research_chars=int(research_chars),
        research_est_tokens=int(research_tokens),
        citations_count=int(len(research_citations)),
    )

    input_items = [
        ScriptInputItem(
            id=row["id"],
            title=row["title"],
            summary=row["summary"],
            content=row["content"],
            url=row["url"],
            published_at=row["published_at"],
        )
        for row in items
    ]

    provider = (os.environ.get("LLM_PROVIDER") or "moonshot").strip().lower()
    if provider not in {"moonshot", "deepseek"}:
        log.warning("unknown LLM_PROVIDER=%s; fallback to moonshot", provider)
        provider = "moonshot"
    temperature = float((cfg.get("deepseek") or {}).get("temperature") or 0.7)

    if provider == "deepseek":
        base_url = os.environ.get("DEEPSEEK_BASE_URL", "").strip()
        api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
        model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip()
        if not base_url or not api_key:
            raise RuntimeError("DeepSeek not configured: set DEEPSEEK_BASE_URL and DEEPSEEK_API_KEY")

        client = DeepSeekClient(base_url=base_url, api_key=api_key, model=model, timeout_seconds=timeout_s)
        if use_research:
            log.info("script input=research path=%s", str(research_content_path))
            out = client.generate_from_research(
                channel=channel,
                items=input_items,
                research_content=research_content,
                citations=research_citations,
                temperature=temperature,
            )
        else:
            out = client.generate(channel=channel, items=input_items, temperature=temperature)
    else:
        from src.llm.api_client import MoonshotClient

        base_url = os.environ.get("MOONSHOT_BASE_URL", "https://api.moonshot.cn/v1").strip()
        api_key = os.environ.get("MOONSHOT_API_KEY", "").strip()
        model = os.environ.get("MOONSHOT_MODEL", "kimi-k2-turbo-preview").strip()
        if not api_key:
            raise RuntimeError("Moonshot not configured: set MOONSHOT_API_KEY")

        client2 = MoonshotClient(base_url=base_url, api_key=api_key, model=model, timeout_seconds=timeout_s)
        if use_research:
            log.info("script input=research path=%s", str(research_content_path))
            out: ScriptOutput = client2.generate_from_research(
                channel=channel,
                items=input_items,
                research_content=research_content,
                citations=research_citations,
                temperature=temperature,
            )
        else:
            out = client2.generate(channel=channel, items=input_items, temperature=temperature)

    store.set_episode_script(
        episode_id=episode_id,
        title=out.title,
        ssml=out.ssml,
        shownotes=out.shownotes,
        tags=out.tags,
        script_json=json.dumps(out.model_dump(), ensure_ascii=False),
    )

    script_json_path = script_dir / f"{ep['episode_date']}.script.json"
    ssml_path = script_dir / f"{ep['episode_date']}.ssml.txt"
    shownotes_path = script_dir / f"{ep['episode_date']}.shownotes.md"
    script_json_path.write_text(json.dumps(out.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")
    ssml_path.write_text(out.ssml or "", encoding="utf-8")
    shownotes_path.write_text(out.shownotes or "", encoding="utf-8")

    title_chars, title_tokens = _text_stats(out.title)
    ssml_chars, ssml_tokens = _text_stats(out.ssml)
    shownotes_chars, shownotes_tokens = _text_stats(out.shownotes)
    _log_event(
        log,
        "step_stats",
        step="script",
        phase="after",
        episode_id=str(episode_id),
        title_chars=int(title_chars),
        title_est_tokens=int(title_tokens),
        ssml_chars=int(ssml_chars),
        ssml_est_tokens=int(ssml_tokens),
        shownotes_chars=int(shownotes_chars),
        shownotes_est_tokens=int(shownotes_tokens),
        tags_count=int(len(out.tags)),
    )

    store.mark_items_used([row["id"] for row in items], episode_id=episode_id)
    store.set_episode_status(episode_id, "scripted")

    log.info("scripted: title=%s tags=%s", out.title, ",".join(out.tags))


def step_tts(store: Store, cfg: dict, episode_id: str, timeout_s: int) -> None:
    log = logging.getLogger("step.tts")

    tts_force = (os.environ.get("DOUBAO_TTS_FORCE") or "0").strip().lower() in {"1", "true", "yes", "on"}

    ep = store.get_episode(episode_id)
    if not tts_force and ep["status"] in {"tts_done", "rendered", "published"}:
        if ep.get("tts_audio_path") and Path(ep["tts_audio_path"]).exists():
            log.info("episode already tts_done or later; skip")
            return
        raise RuntimeError("episode marked tts_done but tts_audio_path missing or file not found")

    if not tts_force and ep.get("tts_audio_path") and Path(ep["tts_audio_path"]).exists():
        store.set_episode_status(episode_id, "tts_done")
        log.info("found existing tts audio; reconciled status to tts_done")
        return

    if not tts_force and ep["status"] != "scripted":
        raise RuntimeError(f"tts requires scripted episode; current={ep['status']}")
    if tts_force and not (ep.get("ssml") or "").strip():
        raise RuntimeError("tts_force requires existing ssml on episode")

    ssml_chars, ssml_tokens = _text_stats(ep.get("ssml"))
    _log_event(
        log,
        "step_stats",
        step="tts",
        phase="before",
        episode_id=str(episode_id),
        ssml_chars=int(ssml_chars),
        ssml_est_tokens=int(ssml_tokens),
    )

    out_dir = Path((cfg.get("output") or {}).get("out_dir") or "./out")
    tts_dir = Path((cfg.get("output") or {}).get("tts_dir") or "./out/tts")
    out_dir.mkdir(parents=True, exist_ok=True)
    tts_dir.mkdir(parents=True, exist_ok=True)

    voice = ((cfg.get("tts") or {}).get("voice") or "").strip()

    poll_max_wait_s = int(os.environ.get("DOUBAO_TTS_POLL_MAX_WAIT_SECONDS", str(timeout_s)))
    poll_interval_s = int(os.environ.get("DOUBAO_TTS_POLL_INTERVAL_SECONDS", "1"))
    disable_fallback = (os.environ.get("DOUBAO_TTS_DISABLE_FALLBACK") or "0").strip().lower() in {"1", "true", "yes", "on"}

    tts_path = tts_dir / f"{ep['episode_date']}.tts.mp3"
    wrote_file = False
    try:
        from src.tts.tts_client import TTSClientFactory

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
        if doubao_mode == "podcast":
            client = TTSClientFactory.create_doubao_podcast_client(timeout_seconds=timeout_s)
            task_id = "podcast"
            text = _strip_angle_tags(ep["ssml"])
            result = client.synthesize(text, mode="podcast")
            audio_bytes = result.audio_data
        elif doubao_mode == "voiceclone_http":
            client = TTSClientFactory.create_doubao_podcast_client(timeout_seconds=timeout_s)
            task_id = "voiceclone_http"
            text = ep["ssml"]
            speaker_id = (os.environ.get("DOUBAO_VOICECLONE_SPEAKER_ID") or "").strip()
            log.info(
                "doubao voiceclone start: mode=%s url=%s speaker_id=%s cluster=%s",
                doubao_mode,
                (os.environ.get("DOUBAO_VOICECLONE_URL") or "https://openspeech.bytedance.com/api/v1/tts").strip(),
                speaker_id,
                (os.environ.get("DOUBAO_VOICECLONE_CLUSTER") or "volcano_icl").strip() or "volcano_icl",
            )
            result = client.synthesize(text, mode="voiceclone_http", speaker_id=speaker_id)
            audio_bytes = result.audio_data
        elif doubao_mode in {"tts", "tts_v3_http"}:
            client = TTSClientFactory.create_doubao_podcast_client(timeout_seconds=timeout_s)
            task_id = "tts_v3_http" if doubao_mode == "tts_v3_http" else "tts"
            text = ep["ssml"]
            tts_version = (os.environ.get("DOUBAO_TTS_VERSION") or "1").strip() or "1"
            rid = (os.environ.get("DOUBAO_TTS_V3_RESOURCE_ID") or "").strip()
            if not rid:
                if tts_version == "2":
                    rid = (os.environ.get("DOUBAO_TTS_V2_RESOURCE_ID") or "seed-tts-2.0").strip() or "seed-tts-2.0"
                else:
                    rid = (os.environ.get("DOUBAO_TTS_V1_RESOURCE_ID") or "seed-tts-1.0").strip() or "seed-tts-1.0"

            voice_effective = voice
            if tts_version == "2":
                v2 = (os.environ.get("DOUBAO_TTS_V2_VOICE") or "").strip()
                if v2:
                    voice_effective = v2
            else:
                v1 = (os.environ.get("DOUBAO_TTS_V1_VOICE") or "").strip()
                if v1:
                    voice_effective = v1
            log.info(
                "doubao tts start: mode=%s task_id=%s url=%s resource_id=%s tts_version=%s",
                doubao_mode,
                task_id,
                (os.environ.get("DOUBAO_TTS_V3_URL") or "https://openspeech.bytedance.com/api/v3/tts/unidirectional").strip(),
                rid,
                tts_version,
            )
            result = client.synthesize(text, mode="tts_v3_http", speaker=voice_effective)
            audio_bytes = result.audio_data
        elif doubao_mode == "tts_v3_ws":
            client = TTSClientFactory.create_doubao_client(voice_type=voice, timeout_seconds=timeout_s)
            try:
                result = client.synthesize(ep["ssml"], mode="tts_v3_ws")
                log.info(
                    "doubao tts start: mode=%s task_id=%s poll_max_wait_s=%s poll_interval_s=%s",
                    doubao_mode,
                    "tts_v3_ws",
                    poll_max_wait_s,
                    poll_interval_s,
                )
                audio_bytes = result.audio_data
            except Exception as e:  # noqa: BLE001
                if "text too long for single doubao websocket request" in str(e):
                    task_id = "chunked"
                    result = client.synthesize(ep["ssml"], mode="default")
                    audio_bytes = result.audio_data
                else:
                    raise
        else:
            raise RuntimeError(
                f"Unknown DOUBAO_MODE={doubao_mode}. Use podcast / tts (http) / tts_v3_http / tts_v3_ws / voiceclone_http"
            )
    except BaseException as e:  # noqa: BLE001
        if isinstance(e, (KeyboardInterrupt, SystemExit)):
            raise
        if disable_fallback:
            raise
        log.exception("doubao tts failed; fallback to local SAPI TTS: %s", e)
        task_id = "sapi"
        text = _strip_angle_tags(ep["ssml"])
        audio_bytes = _local_tts_to_mp3(text=text, out_mp3_path=tts_path, timeout_s=timeout_s)
        wrote_file = True

    if not wrote_file:
        tts_path.write_bytes(audio_bytes)

    store.set_episode_tts(episode_id=episode_id, task_id=task_id, tts_audio_path=str(tts_path))
    store.set_episode_status(episode_id, "tts_done")

    _log_event(
        log,
        "step_stats",
        step="tts",
        phase="after",
        episode_id=str(episode_id),
        tts_audio_bytes=int(len(audio_bytes)),
        tts_audio_path=str(tts_path),
    )

    log.info("tts done: %s", tts_path)


def step_render(store: Store, cfg: dict, episode_id: str, timeout_s: int) -> None:
    log = logging.getLogger("step.render")

    ep = store.get_episode(episode_id)
    if ep["status"] in {"rendered", "published"}:
        if ep.get("rendered_audio_path") and Path(ep["rendered_audio_path"]).exists():
            log.info("episode already rendered or later; skip")
            return
        raise RuntimeError("episode marked rendered but rendered_audio_path missing or file not found")

    if ep.get("rendered_audio_path") and Path(ep["rendered_audio_path"]).exists():
        store.set_episode_status(episode_id, "rendered")
        log.info("found existing rendered audio; reconciled status to rendered")
        return

    if ep["status"] != "tts_done":
        raise RuntimeError(f"render requires tts_done episode; current={ep['status']}")

    audio_cfg = cfg.get("audio") or {}
    assets_dir = Path(audio_cfg.get("assets_dir") or "./assets")
    intro = assets_dir / (audio_cfg.get("intro") or "intro.mp3")
    outro = assets_dir / (audio_cfg.get("outro") or "outro.mp3")
    bgm = assets_dir / (audio_cfg.get("bgm") or "bgm.mp3")
    bgm_volume = float(audio_cfg.get("bgm_volume") or 0.18)

    render_dir = Path((cfg.get("output") or {}).get("render_dir") or "./out/render")
    render_dir.mkdir(parents=True, exist_ok=True)

    rendered_path = render_dir / f"{ep['episode_date']}.final.mp3"

    if shutil.which("ffmpeg") is None:
        log.warning("ffmpeg not found; fallback to copy tts audio as rendered output")
        _log_event(
            log,
            "step_stats",
            step="render",
            phase="before",
            episode_id=str(episode_id),
            tts_bytes=int(_file_size_bytes(Path(ep["tts_audio_path"])) or 0),
        )
        rendered_path.write_bytes(Path(ep["tts_audio_path"]).read_bytes())
        store.set_episode_rendered(episode_id=episode_id, rendered_audio_path=str(rendered_path))
        store.set_episode_status(episode_id, "rendered")
        _log_event(
            log,
            "step_stats",
            step="render",
            phase="after",
            episode_id=str(episode_id),
            rendered_bytes=int(_file_size_bytes(rendered_path) or 0),
            rendered_audio_path=str(rendered_path),
        )
        log.info("rendered: %s", rendered_path)
        return

    if not (intro.exists() and outro.exists() and bgm.exists()):
        log.warning(
            "render assets missing; fallback to simple render: intro=%s outro=%s bgm=%s",
            str(intro),
            str(outro),
            str(bgm),
        )
        _log_event(
            log,
            "step_stats",
            step="render",
            phase="before",
            episode_id=str(episode_id),
            intro_bytes=int(_file_size_bytes(intro) or 0),
            outro_bytes=int(_file_size_bytes(outro) or 0),
            bgm_bytes=int(_file_size_bytes(bgm) or 0),
            tts_bytes=int(_file_size_bytes(Path(ep["tts_audio_path"])) or 0),
        )
        _render_audio_simple(main_path=Path(ep["tts_audio_path"]), out_path=rendered_path, timeout_seconds=timeout_s)
        store.set_episode_rendered(episode_id=episode_id, rendered_audio_path=str(rendered_path))
        store.set_episode_status(episode_id, "rendered")
        _log_event(
            log,
            "step_stats",
            step="render",
            phase="after",
            episode_id=str(episode_id),
            rendered_bytes=int(_file_size_bytes(rendered_path) or 0),
            rendered_audio_path=str(rendered_path),
        )
        log.info("rendered: %s", rendered_path)
        return

    _log_event(
        log,
        "step_stats",
        step="render",
        phase="before",
        episode_id=str(episode_id),
        intro_bytes=int(_file_size_bytes(intro) or 0),
        outro_bytes=int(_file_size_bytes(outro) or 0),
        bgm_bytes=int(_file_size_bytes(bgm) or 0),
        tts_bytes=int(_file_size_bytes(Path(ep["tts_audio_path"])) or 0),
    )

    render_episode_audio(
        intro_path=intro,
        main_path=Path(ep["tts_audio_path"]),
        outro_path=outro,
        bgm_path=bgm,
        bgm_volume=bgm_volume,
        out_path=rendered_path,
        timeout_seconds=timeout_s,
    )

    store.set_episode_rendered(episode_id=episode_id, rendered_audio_path=str(rendered_path))
    store.set_episode_status(episode_id, "rendered")

    _log_event(
        log,
        "step_stats",
        step="render",
        phase="after",
        episode_id=str(episode_id),
        rendered_bytes=int(_file_size_bytes(rendered_path) or 0),
        rendered_audio_path=str(rendered_path),
    )

    log.info("rendered: %s", rendered_path)


def step_publish(store: Store, cfg: dict, episode_id: str) -> None:
    log = logging.getLogger("step.publish")

    ep = store.get_episode(episode_id)
    if ep["status"] == "published":
        if ep.get("published_path") and Path(ep["published_path"]).exists():
            log.info("episode already published; skip")
            return
        raise RuntimeError("episode marked published but published_path missing or file not found")

    if ep.get("published_path") and Path(ep["published_path"]).exists():
        store.set_episode_status(episode_id, "published")
        log.info("found existing published audio; reconciled status to published")
        return

    if ep["status"] != "rendered":
        raise RuntimeError(f"publish requires rendered episode; current={ep['status']}")

    publish_dir = Path((cfg.get("output") or {}).get("publish_dir") or "./out/publish")
    publish_dir.mkdir(parents=True, exist_ok=True)

    tags_list = [t for t in (ep["tags"] or "").split(",") if t] if ep.get("tags") else []

    shownotes_chars, shownotes_tokens = _text_stats(ep.get("shownotes"))
    _log_event(
        log,
        "step_stats",
        step="publish",
        phase="before",
        episode_id=str(episode_id),
        rendered_bytes=int(_file_size_bytes(Path(ep["rendered_audio_path"])) or 0),
        shownotes_chars=int(shownotes_chars),
        shownotes_est_tokens=int(shownotes_tokens),
        tags_count=int(len(tags_list)),
    )

    published_path = publish_local(
        rendered_audio_path=Path(ep["rendered_audio_path"]),
        episodes_dir=publish_dir,
        episode_date=ep["episode_date"],
        title=ep["title"] or "",
        shownotes=ep["shownotes"] or "",
        tags=tags_list,
    )

    store.set_episode_published(episode_id=episode_id, published_path=str(published_path))
    store.set_episode_status(episode_id, "published")

    meta_path = publish_dir / f"{ep['episode_date']}.metadata.json"
    notes_path = publish_dir / f"{ep['episode_date']}.shownotes.md"
    _log_event(
        log,
        "step_stats",
        step="publish",
        phase="after",
        episode_id=str(episode_id),
        published_bytes=int(_file_size_bytes(published_path) or 0),
        metadata_bytes=int(_file_size_bytes(meta_path) or 0),
        shownotes_file_bytes=int(_file_size_bytes(notes_path) or 0),
        published_path=str(published_path),
    )

    log.info("published: %s", published_path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="./config/settings.yaml")
    parser.add_argument("--date", default=None)
    parser.add_argument("--timeout-seconds", type=int, default=None)
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--run-dir", default=None)
    parser.add_argument(
        "--step",
        default="all",
        choices=[
            "all",
            "fetch",
            "script",
            "tts",
            "render",
            "publish",
            "list-items",
            "list-fetch-health",
            "list-fetch-health-trend",
        ],
    )
    parser.add_argument("--force-fetch", action="store_true")
    parser.add_argument("--max-items", type=int, default=None)
    parser.add_argument("--metaso-max-items", type=int, default=None)
    parser.add_argument("--script-input", choices=["auto", "items", "research"], default="auto")
    parser.add_argument("--items-limit", type=int, default=10)
    parser.add_argument("--items-source", default=None)
    parser.add_argument("--items-show-content", action="store_true")
    parser.add_argument("--items-text-limit", type=int, default=200)
    parser.add_argument("--health-days", type=int, default=7)
    parser.add_argument("--health-limit", type=int, default=50)
    parser.add_argument("--health-only-failed", action="store_true")
    args = parser.parse_args()

    pre_mode = os.environ.get("DOUBAO_MODE")

    dotenv_cfg = dotenv_values(".env")
    dotenv_override_raw = os.environ.get("DOTENV_OVERRIDE")
    if isinstance(dotenv_cfg, dict) and (not dotenv_override_raw or not str(dotenv_override_raw).strip()):
        dotenv_override_raw = str(dotenv_cfg.get("DOTENV_OVERRIDE") or "")
    dotenv_override = (str(dotenv_override_raw or "0").strip().lower() in {"1", "true", "yes", "on"})
    load_dotenv(".env", override=dotenv_override)

    if pre_mode is not None and str(pre_mode).strip():
        os.environ["DOUBAO_MODE"] = str(pre_mode).strip()

    _apply_doubao_mode_env()

    cfg = _load_yaml(Path(args.config))
    if args.max_items is not None:
        pipeline_cfg = cfg.get("pipeline")
        if not isinstance(pipeline_cfg, dict):
            pipeline_cfg = {}
            cfg["pipeline"] = pipeline_cfg
        pipeline_cfg["max_items"] = int(args.max_items)
    episode_date = args.date or _today_str()

    out_cfg = cfg.get("output") or {}

    runs_root = Path(out_cfg.get("runs_dir") or "./out/runs")
    run_dir: Path
    if args.run_dir:
        run_dir = Path(args.run_dir)
    else:
        run_id = (str(args.run_id).strip() if args.run_id else "")
        if not run_id:
            run_id = dt.datetime.now().strftime("%H%M%S") + "_" + uuid.uuid4().hex[:6]

        run_dir = runs_root / episode_date / run_id
        if args.step in {"script", "tts", "render", "publish"} and not run_dir.exists():
            date_dir = runs_root / episode_date
            if date_dir.exists():
                existing = sorted([p for p in date_dir.iterdir() if p.is_dir()], key=lambda p: p.name)
                if existing:
                    run_dir = existing[-1]

    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "logs").mkdir(parents=True, exist_ok=True)
    (run_dir / "fetch").mkdir(parents=True, exist_ok=True)
    (run_dir / "script").mkdir(parents=True, exist_ok=True)
    (run_dir / "tts").mkdir(parents=True, exist_ok=True)
    (run_dir / "render").mkdir(parents=True, exist_ok=True)
    (run_dir / "publish").mkdir(parents=True, exist_ok=True)

    output_cfg = cfg.get("output")
    if not isinstance(output_cfg, dict):
        output_cfg = {}
        cfg["output"] = output_cfg
    output_cfg["runs_dir"] = str(runs_root)
    output_cfg["out_dir"] = str(run_dir)
    output_cfg["logs_dir"] = str(run_dir / "logs")
    output_cfg["fetch_archives_dir"] = str(run_dir / "fetch")
    output_cfg["script_dir"] = str(run_dir / "script")
    output_cfg["tts_dir"] = str(run_dir / "tts")
    output_cfg["render_dir"] = str(run_dir / "render")
    output_cfg["publish_dir"] = str(run_dir / "publish")

    _setup_logging(Path(output_cfg["logs_dir"]), episode_date)

    if args.timeout_seconds is not None:
        timeout_s = int(args.timeout_seconds)
    else:
        dotenv_timeout = (dotenv_cfg.get("HTTP_TIMEOUT_SECONDS") or "").strip() if isinstance(dotenv_cfg, dict) else ""
        timeout_s = int(dotenv_timeout or os.environ.get("HTTP_TIMEOUT_SECONDS", "20"))

    db_path = os.environ.get("PODCAST_DB_PATH", "./out/podcast.sqlite")
    store = Store(db_path=db_path)
    store.init_schema()

    channel_id = (cfg.get("channel") or {}).get("id") or "default"
    episode_id = store.get_or_create_episode(channel_id=channel_id, episode_date=episode_date)

    log = logging.getLogger("run")
    log.info("episode_id=%s date=%s step=%s timeout_s=%s", episode_id, episode_date, args.step, timeout_s)

    try:
        if args.step in {"all", "fetch"}:
            step_fetch(
                store=store,
                cfg=cfg,
                episode_id=episode_id,
                timeout_s=timeout_s,
                force_fetch=bool(args.force_fetch),
                metaso_max_items=(int(args.metaso_max_items) if args.metaso_max_items is not None else None),
            )
        if args.step == "list-items":
            step_list_items(
                store=store,
                items_source=args.items_source,
                items_limit=args.items_limit,
                items_show_content=bool(args.items_show_content),
                items_text_limit=int(args.items_text_limit),
            )
        if args.step == "list-fetch-health":
            step_list_fetch_health(
                store=store,
                cfg=cfg,
                days=int(args.health_days),
                limit=int(args.health_limit),
                only_failed=bool(args.health_only_failed),
            )
        if args.step == "list-fetch-health-trend":
            step_list_fetch_health_trend(
                store=store,
                days=int(args.health_days),
                limit=int(args.health_limit),
            )
        if args.step in {"all", "script"}:
            step_script(store=store, cfg=cfg, episode_id=episode_id, timeout_s=timeout_s, script_input=str(args.script_input))
        if args.step in {"all", "tts"}:
            step_tts(store=store, cfg=cfg, episode_id=episode_id, timeout_s=timeout_s)
        if args.step in {"all", "render"}:
            step_render(store, cfg, episode_id, timeout_s)
        if args.step in {"all", "publish"}:
            step_publish(store, cfg, episode_id)
    except Exception as e:
        log.error("error: %s", e)
        return 1

    log.info("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
