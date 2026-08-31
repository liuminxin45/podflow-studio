"""Run the PodFlow v3 production stages against one explicit workflow."""

from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any
from urllib.parse import urlparse

from nodes.audio_postprocess.config import AudioPostprocessConfig
from nodes.audio_postprocess.node import run as run_audio
from nodes.facts.config import FactsConfig
from nodes.facts.node import run as run_facts
from nodes.fetch.config import FetchConfig
from nodes.fetch.node import run as run_fetch
from nodes.preprocess.config import PreprocessConfig
from nodes.preprocess.node import run as run_preprocess
from nodes.research.config import ResearchConfig
from nodes.research.node import run as run_research
from nodes.review.config import ReviewConfig
from nodes.review.node import run as run_review
from nodes.script.config import ScriptConfig
from nodes.script.node import run as run_script
from nodes.topic_selection.config import TopicSelectionConfig
from nodes.topic_selection.node import run as run_topic_selection
from nodes.tts.config import DEFAULT_DOUBAO_VOICE_TYPE, TTSConfig
from nodes.tts.node import pronunciation_review, run as run_tts
from protocol.artifact_utils import file_fingerprint
from protocol.bocha_search import search_bocha
from protocol.env_overrides import apply_env_overrides
from protocol.episode_models import SCHEMA_VERSION, validate_episode_run_payload
from protocol.presets import get_default_preset
from protocol.production_plan import build_production_plan, voice_generation_key
from protocol.release_readiness import REQUIRED_ACKNOWLEDGEMENTS


ROOT = Path(__file__).resolve().parents[1]
SENSITIVE = {"api_key", "access_token", "doubao_access_token", "doubao_app_id", "azure_speech_key"}
EPISODE_ID_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$")
DEFAULT_RELEASE_REPOSITORY = "liuminxin45/podflow-morning-feed"
DEFAULT_SITE_REPOSITORY = "liuminxin45/liuminxin45.github.io"


def _resolve_workflow(value: str) -> Path:
    candidate = Path(value).expanduser()
    candidates = [candidate] if candidate.is_absolute() else [ROOT / candidate, ROOT / "out" / "workflows" / f"{value}.json"]
    for path in candidates:
        if path.is_file():
            return path.resolve()
    raise ValueError(f"Workflow not found: {value}")


def _load(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    envelope = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(envelope, dict):
        raise ValueError("Workflow must be a JSON object")
    state = envelope.get("state", envelope)
    if not isinstance(state, dict):
        raise ValueError("Workflow state must be a JSON object")
    return envelope, state


def _atomic_write(path: Path, payload: dict[str, Any]) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def _persist(path: Path, envelope: dict[str, Any], state: dict[str, Any]) -> None:
    clean = json.loads(json.dumps(state, ensure_ascii=False))
    for config in clean.get("runtime_config", {}).values():
        if isinstance(config, dict):
            for key in SENSITIVE:
                if key in config:
                    config[key] = ""
    if "state" in envelope:
        envelope["state"] = clean
    else:
        envelope = clean
    _atomic_write(path, envelope)


def _config_dir() -> Path:
    configured = os.environ.get("PODFLOW_CONFIG_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    appdata = Path(os.environ.get("APPDATA", ""))
    return appdata / "podflow-studio" / "node-configs"


def _config(state: dict[str, Any], name: str, cls):
    payload = state.get("runtime_config", {}).get(name, {})
    file_path = _config_dir() / f"{name}.json"
    if file_path.is_file():
        local = json.loads(file_path.read_text(encoding="utf-8"))
        if isinstance(local, dict):
            payload = {**payload, **local}
    return cls.from_dict(payload) if payload else cls()


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _list_env(name: str) -> list[str]:
    return [part.strip() for part in _env(name).split(",") if part.strip()]


def _initial_state(episode_id: str, output_dir: Path, topic: str) -> dict[str, Any]:
    state: dict[str, Any] = {
        "episode_id": episode_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "schema_version": SCHEMA_VERSION,
        "preset": get_default_preset(),
        "source_inputs": [], "fetch_contents": [], "cleaned_contents": [],
        "researched_contents": [], "facts": [], "selected_topic": {},
        "selected_topics": [], "selected_materials": [], "auto_selected_items": [],
        "auto_rejected_items": [], "script": {}, "edited_script": {},
        "generation_request": {}, "generation_meta": {}, "script_snapshots": [],
        "downstream_stale": {}, "voice_segments": [], "production_plan": {},
        "audio_outputs": {}, "intro_outro_paths": {},
        "review_summary": {}, "audio_approval": {}, "release_readiness": {}, "publish_outputs": {},
        "subtitle_path": "", "run_report": {}, "runtime_config": {},
        "errors": [], "logs": [],
    }
    apply_env_overrides(state)
    runtime = state["runtime_config"]
    runtime["auto_execute"] = True
    runtime.setdefault("organize", {})["mode"] = "ai"
    runtime.setdefault("script", {})["api_key_env_var"] = "PODFLOW_LLM_API_KEY"
    runtime.setdefault("tts", {}).update({
        "engine": "doubao_tts",
        "output_dir": str((output_dir / "voice_segments").resolve()),
        "output_format": "mp3",
    })
    runtime.setdefault("audio_postprocess", {}).update({
        "output_dir": str(output_dir.resolve()),
        "output_format": "mp3",
        "final_basename": "final",
    })
    if topic:
        runtime.setdefault("discover", {})["target_topic"] = topic
    return state


def _llm_config_kwargs() -> dict[str, Any]:
    provider = _env("PODFLOW_LLM_PROVIDER", "openai")
    model = _env("PODFLOW_LLM_MODEL")
    api_base = _env("PODFLOW_LLM_API_BASE")
    if not _env("PODFLOW_LLM_API_KEY"):
        raise ValueError("PODFLOW_LLM_API_KEY is required for formal generation")
    if not model:
        raise ValueError("PODFLOW_LLM_MODEL is required for formal generation")
    if provider not in {"deepseek", "local_agent"} and not api_base:
        raise ValueError("PODFLOW_LLM_API_BASE is required for the selected LLM provider")
    return {
        "provider_kind": provider,
        "api_base": api_base,
        "llm_model": model,
        "api_key_env_var": "PODFLOW_LLM_API_KEY",
    }


def _deep_dive_brief(material: dict[str, Any], references: list[dict[str, str]]) -> dict[str, Any]:
    if len({urlparse(item["url"]).hostname for item in references if urlparse(item["url"]).hostname}) < 3:
        raise ValueError(f"Bocha research needs at least three independent domains for deep dive: {material.get('title', '')}")
    selected = references[:3]
    urls = [item["url"] for item in selected]
    claims = [
        {"text": item["summary"], "sourceUrls": [item["url"]], "confidence": "medium"}
        for item in selected
    ]
    return {
        "version": 1,
        "inputFingerprint": hashlib.sha256("\n".join(urls).encode("utf-8")).hexdigest()[:8],
        "coreQuestion": f"{material.get('title', '这一事件')}为什么值得继续追踪？",
        "whyNow": claims[0]["text"],
        "thesisBoundary": "只陈述以下公开来源能够共同支持的范围，不推断尚未披露的信息。",
        "sections": [
            {"title": "已知事实", "question": "公开来源确认了什么？", "listenerValue": "建立事实基线", "claims": [claims[0]]},
            {"title": "影响与边界", "question": "这对听众意味着什么？", "listenerValue": "理解影响和限制", "claims": claims[1:]},
        ],
        "counterpoints": [],
        "limitations": ["搜索结果是发布时点的公开资料，后续信息可能改变结论。"],
        "sourceUrls": urls,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


def generate(output: Path, episode_id: str, topic: str, allow_paid: bool) -> dict[str, Any]:
    if not EPISODE_ID_PATTERN.fullmatch(episode_id):
        raise ValueError("episode-id must be an immutable date-based ID")
    if not _env("PODFLOW_BOCHA_API_KEY"):
        raise ValueError("PODFLOW_BOCHA_API_KEY is required for formal generation")
    if not (_env("PODFLOW_DOUBAO_APP_ID") and _env("PODFLOW_DOUBAO_ACCESS_TOKEN")):
        raise ValueError("PODFLOW_DOUBAO_APP_ID and PODFLOW_DOUBAO_ACCESS_TOKEN are required")
    llm_kwargs = _llm_config_kwargs()
    episode_dir = (output / episode_id).resolve()
    if episode_dir.exists():
        raise ValueError(f"Refusing to overwrite episode workspace: {episode_dir}")
    episode_dir.mkdir(parents=True)
    state = _initial_state(episode_id, episode_dir, topic)

    rss_urls = _list_env("PODFLOW_RSS_URLS")
    fetch_sources = _list_env("PODFLOW_FETCH_SOURCES") or ["rss"]
    if "rss" in fetch_sources and not rss_urls:
        raise ValueError("PODFLOW_RSS_URLS is required when RSS discovery is enabled")
    state = run_fetch(state, FetchConfig(enabled_sources=fetch_sources, rss_urls=rss_urls))
    state = run_preprocess(state, PreprocessConfig())
    state = run_research(state, ResearchConfig(**llm_kwargs))
    state = run_topic_selection(state, TopicSelectionConfig(**llm_kwargs))
    materials = [item for item in state.get("selected_materials", []) if isinstance(item, dict)]
    required_materials = int(state["preset"].get("recommended_news_item_count", 7))
    if len(materials) < required_materials:
        raise ValueError(f"Insufficient selected materials for formal 6+1 episode: {len(materials)}")
    materials = materials[:required_materials]

    bocha_base = str((state["runtime_config"].get("research") or {}).get("bocha_api_base") or "")
    bocha_limit = int((state["runtime_config"].get("research") or {}).get("bocha_max_results") or 3)
    for material in materials:
        references = search_bocha(
            str(material.get("title") or state.get("selected_topic", {}).get("title") or topic),
            api_base=bocha_base,
            max_results=bocha_limit,
        )
        material["_references"] = references
        material["_status"] = "ready"
    deep_material = materials[-1]
    deep_material["_isDeepDive"] = True
    deep_material["_deepDiveBrief"] = _deep_dive_brief(deep_material, deep_material["_references"])
    state["selected_materials"] = materials
    state = run_facts(state, FactsConfig(
        **llm_kwargs,
        require_semantic_verification=True,
        max_facts=20,
        selected_topic_count=int(state["preset"].get("recommended_news_item_count", 7)),
    ))
    state = run_script(state, ScriptConfig(**llm_kwargs))
    if state.get("script", {}).get("generated_by") != "llm":
        raise ValueError("Formal generation requires an LLM-authored script; deterministic fallback was rejected")
    state["edited_script"] = copy.deepcopy(state["script"])
    workflow_path = episode_dir / "workflow.json"
    envelope = {"id": episode_id, "state": state}
    _persist(workflow_path, envelope, state)
    render_result = render(workflow_path, envelope, state, allow_paid, tts_engine="doubao_tts")
    _, rendered_state = _load(workflow_path)
    if rendered_state.get("review_summary", {}).get("status") != "passed":
        raise ValueError("Generated candidate failed automatic audio review")
    schema_ok, schema_errors = validate_episode_run_payload(rendered_state)
    if not schema_ok:
        raise ValueError("Generated workflow failed EpisodeRun v2 validation: " + "; ".join(schema_errors))
    artifact = file_fingerprint(rendered_state.get("audio_outputs", {}).get("final_audio_path"))
    return {
        "stage": "generate",
        "workflow": str(workflow_path),
        "audio": artifact,
        "review": render_result.get("review", {}),
    }


def _preflight(state: dict[str, Any], config: TTSConfig, allow_paid: bool) -> dict[str, int]:
    script = state.get("edited_script") if isinstance(state.get("edited_script"), dict) else {}
    plan = build_production_plan(script.get("segments", []), state.get("production_plan") or None)
    state["production_plan"] = plan
    clips = [clip for clip in plan["clips"] if clip.get("source") == "tts"]
    previous = {str(item.get("segment_id")): item for item in state.get("voice_segments", []) if isinstance(item, dict)}
    uncached = []
    for clip in clips:
        voice = config.doubao_voice_type if config.engine in {"doubao_tts", "voice_clone"} else config.default_voice
        key = voice_generation_key(text=clip["text"], engine=config.engine, voice=voice, rate=config.rate,
                                   volume=config.volume, direction=clip["direction"], context_before=clip["context_before"],
                                   context_after=clip["context_after"], model=config.model, output_format=config.output_format,
                                   performance_prompt=config.performance_prompt)
        old = previous.get(clip["id"], {})
        if old.get("generation_key") != key or not Path(str(old.get("path") or "")).is_file():
            uncached.append(clip)
    estimate = {"totalCharacters": sum(len(c["text"]) for c in clips),
                "uncachedCharacters": sum(len(c["text"]) for c in uncached), "uncachedClips": len(uncached)}
    unresolved = sorted({term for clip in clips
                         for term in pronunciation_review(str(clip.get("text") or ""), config.pronunciation_overrides)["unresolved_terms"]})
    if unresolved:
        raise ValueError("Pronunciation review is incomplete: " + ", ".join(unresolved))
    for slot in plan["music"].values():
        path = ROOT / slot["path"] if not Path(slot["path"]).is_absolute() else Path(slot["path"])
        if not path.is_file() or not (ROOT / slot["rights_ref"].split("#", 1)[0]).is_file():
            raise ValueError(f"Formal cue or rights record is missing: {slot['asset_id']}")
        slot["path"] = str(path.resolve())
    provenance = ROOT / "assets" / "audio" / "make-funk-source.json"
    if not provenance.is_file():
        raise ValueError("Make Funk SHA256 provenance is missing")
    if config.engine == "doubao_tts" and uncached and not all((config.doubao_app_id, config.doubao_access_token)):
        raise ValueError("Doubao credentials are missing; no external request was made")
    if config.engine == "doubao_tts" and uncached and not allow_paid:
        raise PermissionError(f"Paid TTS authorization required: {json.dumps(estimate, ensure_ascii=False)}")
    return estimate


def render(
    path: Path,
    envelope: dict[str, Any],
    state: dict[str, Any],
    allow_paid: bool,
    tts_engine: str = "",
) -> dict[str, Any]:
    tts = _config(state, "tts", TTSConfig)
    runtime_engine = str((state.get("runtime_config", {}).get("tts", {}) or {}).get("engine") or "").strip()
    tts.engine = (tts_engine or runtime_engine or "doubao_tts").strip()
    tts.doubao_voice_type = DEFAULT_DOUBAO_VOICE_TYPE
    tts.default_voice = DEFAULT_DOUBAO_VOICE_TYPE
    tts.output_format = "mp3"
    tts.doubao_app_id = tts.doubao_app_id or _env("PODFLOW_DOUBAO_APP_ID")
    tts.doubao_access_token = tts.doubao_access_token or _env("PODFLOW_DOUBAO_ACCESS_TOKEN")
    estimate = _preflight(state, tts, allow_paid)
    print(json.dumps({"ok": True, "stage": "render-preflight", "estimate": estimate}, ensure_ascii=False), file=sys.stderr, flush=True)
    state["audio_approval"] = {}
    state = run_tts(state, tts)
    state = run_audio(state, _config(state, "audio_postprocess", AudioPostprocessConfig))
    state = run_review(state, ReviewConfig(require_approval=True))
    _persist(path, envelope, state)
    return {"stage": "render", "estimate": estimate, "review": state.get("review_summary", {})}


def approve(path: Path, envelope: dict[str, Any], state: dict[str, Any], digest: str,
            reviewer: str, notes: str, acknowledgements: set[str]) -> dict[str, Any]:
    artifact = file_fingerprint(state.get("audio_outputs", {}).get("final_audio_path"))
    if state.get("review_summary", {}).get("status") != "passed" or artifact.get("sha256") != digest:
        raise ValueError("Approval requires a passing review and the exact final MP3 SHA256")
    if acknowledgements != REQUIRED_ACKNOWLEDGEMENTS:
        raise ValueError("Approval requires full listening, pronunciation, and editorial confirmations")
    state["audio_approval"] = {"status": "approved", "audio_sha256": digest,
                               "reviewed_at": datetime.now(timezone.utc).isoformat(), "reviewer": reviewer,
                               "notes": notes, "acknowledgements": sorted(acknowledgements)}
    state = run_review(state, ReviewConfig())
    _persist(path, envelope, state)
    return {"stage": "approve", "audioApproval": state["audio_approval"],
            "releaseReadiness": state.get("release_readiness", {})}


def package(
    state: dict[str, Any],
    output: Path,
    preview_only: bool = False,
    release_repository: str = DEFAULT_RELEASE_REPOSITORY,
) -> dict[str, Any]:
    artifact = file_fingerprint(state.get("audio_outputs", {}).get("final_audio_path"))
    plan = state.get("production_plan") if isinstance(state.get("production_plan"), dict) else {}
    audio_outputs = state.get("audio_outputs") if isinstance(state.get("audio_outputs"), dict) else {}
    script = state.get("edited_script") if isinstance(state.get("edited_script"), dict) else {}
    measured = ((state.get("review_summary") or {}).get("audio_outputs") or {}).get("measured") or {}
    report_path = Path(str((state.get("review_summary") or {}).get("audio_quality_report") or ""))
    if report_path.is_file():
        report_payload = json.loads(report_path.read_text(encoding="utf-8"))
        measured = ((report_payload.get("output") or {}).get("measured") or measured)
    segments = [segment for segment in script.get("segments", []) if isinstance(segment, dict)]
    regions = [str(segment.get("type") or segment.get("role") or "") for segment in segments]
    quick_count = sum(region in {"quick_news", "news_brief"} for region in regions)
    deep_count = sum(region in {"deep_dive", "analysis"} for region in regions)
    readiness = state.get("release_readiness") if isinstance(state.get("release_readiness"), dict) else {}
    if readiness.get("audio_sha256") != artifact.get("sha256"):
        raise ValueError("Package requires release readiness bound to the current audio fingerprint")
    machine_specs = {
        "release readiness": readiness.get("status") in {"preview_ready", "publish_ready"},
        "production plan": int(plan.get("version") or 0) > 0 and bool(str(plan.get("quality_profile") or "")),
        "automatic review": state.get("review_summary", {}).get("status") == "passed",
        "review fingerprint": state.get("review_summary", {}).get("audio_artifact") == artifact,
        "non-mock audio": audio_outputs.get("contains_mock_audio") is False,
        "format": audio_outputs.get("format") == "mp3",
        "sample rate": int(measured.get("sample_rate_hz") or 0) == 48_000,
        "bitrate": int(measured.get("bitrate_kbps") or 0) in range(156, 165),
        "loudness": measured.get("integrated_lufs") is not None and -17 <= float(measured["integrated_lufs"]) <= -15,
        "true peak": measured.get("true_peak_db") is not None and float(measured["true_peak_db"]) <= -1.0,
        "duration": 720 <= float(measured.get("duration_seconds") or 0) <= 900,
        "audio size": artifact.get("size_bytes", 0) >= int(float(measured.get("duration_seconds") or 0) * 20_000),
        "6+1 structure": quick_count == 6 and deep_count == 1,
    }
    failed_specs = [name for name, passed in machine_specs.items() if not passed]
    if failed_specs:
        raise ValueError("Package machine quality checks failed: " + ", ".join(failed_specs))
    if not preview_only:
        if readiness.get("status") != "publish_ready":
            raise ValueError("Formal package requires current human approval")
    quality_report = Path(str(state.get("review_summary", {}).get("audio_quality_report") or ""))
    if not quality_report.is_file():
        raise ValueError("Package requires audio-quality-report.json")
    sources = []
    seen = set()
    for fact in state.get("facts", []):
        if not isinstance(fact, dict):
            continue
        for evidence in fact.get("evidence", []):
            if not isinstance(evidence, dict):
                continue
            url = str(evidence.get("url") or "")
            if url.startswith("https://") and url not in seen:
                seen.add(url)
                sources.append({"title": str(evidence.get("title") or fact.get("title") or "来源"), "url": url})
    if not sources:
        raise ValueError("Package requires public traceable sources")
    episode_id = str(state.get("episode_id") or "")
    target = (
        output / "previews" / episode_id / str(artifact.get("sha256") or "")[:12]
        if preview_only
        else output / episode_id
    )
    if target.exists():
        raise ValueError(f"Refusing to overwrite immutable package: {target}")
    target.mkdir(parents=True)
    audio = Path(artifact["path"])
    audio_name = f"{episode_id}.mp3"
    shutil.copy2(audio, target / audio_name)
    shutil.copy2(quality_report, target / "audio-quality-report.json")
    duration = int(float(state.get("audio_outputs", {}).get("duration_seconds") or 0))
    weights = [max(1, int(segment.get("estimated_seconds") or len(str(segment.get("text") or "")) / 4)) for segment in segments]
    total_weight = max(1, sum(weights))
    elapsed = 0
    chapters = []
    for index, (segment, weight) in enumerate(zip(segments, weights)):
        start = min(max(0, duration - 1), int(elapsed * duration / total_weight))
        if chapters:
            start = min(duration - 1, max(chapters[-1]["startTime"] + 1, start))
        chapters.append({"startTime": start, "title": str(segment.get("title") or f"章节 {index + 1}")})
        elapsed += weight
    (target / "chapters.json").write_text(json.dumps({"version": "1.2.0", "chapters": chapters}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    vtt = ["WEBVTT", ""]
    for index, segment in enumerate(segments):
        start = chapters[index]["startTime"]
        end = chapters[index + 1]["startTime"] if index + 1 < len(chapters) else duration
        def stamp(value: int) -> str:
            hours, remainder = divmod(value, 3600)
            minutes, seconds = divmod(remainder, 60)
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}.000"
        vtt.extend([str(index + 1), f"{stamp(start)} --> {stamp(max(start + 1, end))}", str(segment.get("text") or ""), ""])
    (target / "transcript.vtt").write_text("\n".join(vtt), encoding="utf-8")
    release_base = f"https://github.com/{release_repository}/releases/download/{episode_id}"
    audio_name_ref = audio_name if preview_only else f"{release_base}/{audio_name}"
    site_base = f"https://www.liuminxin.cn/podflow-studio/episodes/{episode_id}"
    transcript_ref = "transcript.vtt" if preview_only else f"{site_base}/transcript.vtt"
    chapters_ref = "chapters.json" if preview_only else f"{site_base}/chapters.json"
    source_engines = [str(value) for value in audio_outputs.get("source_engines", [])]
    manifest = {
        "id": episode_id, "title": str(script.get("title") or "PodFlow 晨报"),
        "summary": str(script.get("description") or "6 条快讯和 1 条重点解读。"),
        "publishedAt": str(state.get("created_at") or datetime.now(timezone.utc).isoformat()),
        "durationSeconds": duration, "audioUrl": audio_name_ref,
        "audioBytes": artifact["size_bytes"],
        "transcriptUrl": transcript_ref, "chaptersUrl": chapters_ref,
        "sources": sources, "credits": [{"role": "制作", "name": "PodFlow Studio"}],
        "ttsProvider": ", ".join(source_engines), "aiAssisted": True, "explicit": False,
        "qualityProfile": str(plan.get("quality_profile") or ""), "audioSha256": artifact["sha256"],
        "releaseStatus": "preview_unreviewed" if preview_only else "publish_ready",
        "public": not preview_only,
        "releaseReadiness": readiness,
        "musicCredits": [{"title": "Make Funk", "artist": "HoliznaCC0",
                          "sourceUrl": "https://freemusicarchive.org/music/holiznacc0/bassic/make-funk/", "license": "CC0 1.0 Universal",
                          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
                          "edited": "经裁剪、淡入淡出及响度处理"}],
        "approval": state.get("audio_approval", {}),
    }
    if preview_only:
        manifest["unreviewed"] = True
    notes = [f"# {manifest['title']}", "", manifest["summary"], "", "## 来源", ""] + [f"- [{item['title']}]({item['url']})" for item in sources]
    (target / "show-notes.md").write_text("\n".join(notes) + "\n", encoding="utf-8")
    (target / "episode.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    checksum_names = [
        audio_name, "episode.json", "transcript.vtt", "chapters.json",
        "show-notes.md", "audio-quality-report.json",
    ]
    checksum_lines = [
        f"{hashlib.sha256((target / name).read_bytes()).hexdigest()}  {name}"
        for name in checksum_names
    ]
    (target / "checksums.sha256").write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")
    return {"stage": "package", "directory": str(target), "manifest": manifest}


def _github_env() -> dict[str, str]:
    env = os.environ.copy()
    publish_token = _env("PODFLOW_PUBLISH_TOKEN")
    if publish_token:
        env["GH_TOKEN"] = publish_token
    return env


def _gh(arguments: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            ["gh", *arguments], cwd=ROOT, env=_github_env(), capture_output=True, text=True,
        )
    except FileNotFoundError as error:
        raise ValueError("GitHub CLI (gh) is required for publish") from error
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "GitHub command failed").strip()
        raise ValueError(detail[:1000])
    return result


def publish(
    state: dict[str, Any],
    output: Path,
    release_repository: str,
    site_repository: str,
    confirm_publish: bool,
) -> dict[str, Any]:
    if not confirm_publish:
        raise ValueError("publish requires --confirm-publish")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", release_repository):
        raise ValueError("release-repo must use owner/name")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", site_repository):
        raise ValueError("site-repo must use owner/name")
    episode_id = str(state.get("episode_id") or "")
    existing = _gh(["release", "view", episode_id, "--repo", release_repository], check=False)
    if existing.returncode == 0:
        raise ValueError(f"Release already exists and is immutable: {release_repository}@{episode_id}")

    package_result = package(state, output, release_repository=release_repository)
    directory = Path(package_result["directory"])
    assets = sorted(str(path) for path in directory.iterdir() if path.is_file())
    notes = directory / "show-notes.md"
    _gh([
        "release", "create", episode_id, *assets,
        "--repo", release_repository,
        "--title", str(package_result["manifest"]["title"]),
        "--notes-file", str(notes),
        "--draft",
    ])

    release_payload = json.loads(_gh([
        "release", "view", episode_id, "--repo", release_repository,
        "--json", "tagName,isDraft,isPrerelease,assets",
    ]).stdout)
    if release_payload.get("tagName") != episode_id or not release_payload.get("isDraft") or release_payload.get("isPrerelease"):
        raise ValueError("Uploaded Release did not remain in the expected draft state")
    remote_assets = {item.get("name"): item for item in release_payload.get("assets", [])}
    expected_names = {Path(value).name for value in assets}
    if set(remote_assets) != expected_names:
        raise ValueError("Uploaded Release asset set does not match the immutable package")
    for local_path in map(Path, assets):
        remote = remote_assets[local_path.name]
        local_digest = hashlib.sha256(local_path.read_bytes()).hexdigest()
        if remote.get("size") != local_path.stat().st_size or remote.get("digest") != f"sha256:{local_digest}":
            raise ValueError(f"Uploaded Release asset verification failed: {local_path.name}")

    _gh(["release", "edit", episode_id, "--repo", release_repository, "--draft=false"])
    _gh([
        "api", "--method", "POST", f"repos/{site_repository}/dispatches",
        "-f", "event_type=podflow_release_published",
    ])
    return {
        "stage": "publish",
        "release": f"https://github.com/{release_repository}/releases/tag/{episode_id}",
        "siteRepository": site_repository,
        "dispatchEvent": "podflow_release_published",
        "package": str(directory),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workflow", default="")
    parser.add_argument("--stage", required=True, choices=("generate", "render", "approve", "package", "publish"))
    parser.add_argument("--episode-id", default="")
    parser.add_argument("--topic", default="")
    parser.add_argument("--allow-paid-tts", action="store_true")
    parser.add_argument("--preview-only", action="store_true", help="Create an internal preview after all machine gates pass")
    parser.add_argument("--full-listen-confirmed", action="store_true")
    parser.add_argument("--pronunciation-confirmed", action="store_true")
    parser.add_argument("--editorial-final-confirmed", action="store_true")
    parser.add_argument("--confirm-publish", action="store_true")
    parser.add_argument("--tts-engine", default="", help="TTS engine override (e.g. edge-tts)")
    parser.add_argument("--audio-sha256", default="")
    parser.add_argument("--reviewer", default="")
    parser.add_argument("--notes", default="")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--release-repo", default=DEFAULT_RELEASE_REPOSITORY)
    parser.add_argument("--site-repo", default=DEFAULT_SITE_REPOSITORY)
    args = parser.parse_args()
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        value = os.environ.get(name, "")
        if value.startswith(("http://127.0.0.1:", "https://127.0.0.1:", "http://localhost:", "https://localhost:")):
            os.environ.pop(name, None)
    if args.stage == "generate":
        if not args.episode_id:
            raise ValueError("generate requires --episode-id")
        result = generate((args.output or (ROOT / "out" / "episodes")).resolve(), args.episode_id, args.topic, args.allow_paid_tts)
        print(json.dumps({"ok": True, **result}, ensure_ascii=False))
        return 0
    if not args.workflow:
        raise ValueError(f"{args.stage} requires --workflow")
    path = _resolve_workflow(args.workflow)
    envelope, state = _load(path)
    if args.stage == "render":
        result = render(path, envelope, state, args.allow_paid_tts, tts_engine=args.tts_engine)
    elif args.stage == "approve":
        if not args.audio_sha256 or not args.reviewer:
            raise ValueError("approve requires --audio-sha256 and --reviewer")
        acknowledgements = {
            name
            for enabled, name in (
                (args.full_listen_confirmed, "full_listen_confirmed"),
                (args.pronunciation_confirmed, "pronunciation_confirmed"),
                (args.editorial_final_confirmed, "editorial_final_confirmed"),
            )
            if enabled
        }
        result = approve(path, envelope, state, args.audio_sha256, args.reviewer, args.notes, acknowledgements)
    elif args.stage == "package":
        if args.output is None:
            raise ValueError("package requires --output")
        result = package(state, args.output.resolve(), preview_only=args.preview_only, release_repository=args.release_repo)
    else:
        result = publish(
            state,
            (args.output or (ROOT / "out" / "releases")).resolve(),
            args.release_repo,
            args.site_repo,
            args.confirm_publish,
        )
    print(json.dumps({"ok": True, **result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        raise SystemExit(10)
