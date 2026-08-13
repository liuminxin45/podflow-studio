"""Run the PodFlow v3 production stages against one explicit workflow."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
from typing import Any

from nodes.assets.config import AssetsConfig
from nodes.assets.node import run as run_assets
from nodes.audio_postprocess.config import AudioPostprocessConfig
from nodes.audio_postprocess.node import run as run_audio
from nodes.review.config import ReviewConfig
from nodes.review.node import run as run_review
from nodes.tts.config import DEFAULT_DOUBAO_VOICE_TYPE, TTSConfig
from nodes.tts.node import pronunciation_review, run as run_tts
from protocol.artifact_utils import file_fingerprint
from protocol.production_plan import build_production_plan, voice_generation_key


ROOT = Path(__file__).resolve().parents[1]
SENSITIVE = {"api_key", "access_token", "doubao_access_token", "doubao_app_id", "azure_speech_key"}


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
    provenance = ROOT / "assets" / "audio" / "quick-spark-source.json"
    if not provenance.is_file():
        raise ValueError("Quick Spark SHA256 provenance is missing")
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
    estimate = _preflight(state, tts, allow_paid)
    print(json.dumps({"ok": True, "stage": "render-preflight", "estimate": estimate}, ensure_ascii=False), flush=True)
    state["audio_approval"] = {}
    state = run_tts(state, tts)
    state = run_audio(state, _config(state, "audio_postprocess", AudioPostprocessConfig))
    state = run_assets(state, _config(state, "assets", AssetsConfig))
    state = run_review(state, ReviewConfig(require_approval=True))
    _persist(path, envelope, state)
    return {"stage": "render", "estimate": estimate, "review": state.get("review_summary", {})}


def approve(path: Path, envelope: dict[str, Any], state: dict[str, Any], digest: str, reviewer: str, notes: str) -> dict[str, Any]:
    artifact = file_fingerprint(state.get("audio_outputs", {}).get("final_audio_path"))
    if state.get("review_summary", {}).get("status") != "passed" or artifact.get("sha256") != digest:
        raise ValueError("Approval requires a passing review and the exact final MP3 SHA256")
    state["audio_approval"] = {"status": "approved", "audio_sha256": digest,
                               "reviewed_at": datetime.now(timezone.utc).isoformat(), "reviewer": reviewer, "notes": notes}
    _persist(path, envelope, state)
    return {"stage": "approve", "audioApproval": state["audio_approval"]}


def package(state: dict[str, Any], output: Path, skip_approval: bool = False) -> dict[str, Any]:
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
    if state.get("audio_outputs", {}).get("contains_mock_audio") is not False:
        raise ValueError("Mock audio cannot be packaged")
    if not skip_approval:
        if plan.get("version") != 3 or plan.get("quality_profile") != "podflow_morning_v3":
            raise ValueError("Package requires production_plan v3 / podflow_morning_v3")
        if state.get("review_summary", {}).get("status") != "passed":
            raise ValueError("Package requires a passing automatic audio review")
        if state.get("audio_approval", {}).get("audio_sha256") != artifact.get("sha256"):
            raise ValueError("Package requires current human approval")
        public_specs = {
            "format": audio_outputs.get("format") == "mp3",
            "sample rate": int(measured.get("sample_rate_hz") or 0) == 48_000,
            "bitrate": int(measured.get("bitrate_kbps") or 0) in range(156, 165),
            "loudness": measured.get("integrated_lufs") is not None and -17 <= float(measured["integrated_lufs"]) <= -15,
            "true peak": measured.get("true_peak_db") is not None and float(measured["true_peak_db"]) <= -1.0,
            "duration": 720 <= float(measured.get("duration_seconds") or 0) <= 900,
            "source engine": audio_outputs.get("source_engines") == ["doubao_tts"],
            "6+1 structure": quick_count == 6 and deep_count == 1,
        }
        failed_specs = [name for name, passed in public_specs.items() if not passed]
        if failed_specs:
            raise ValueError("Package public audio checks failed: " + ", ".join(failed_specs))
    episode_id = str(state.get("episode_id") or "")
    target = output / episode_id
    if target.exists():
        raise ValueError(f"Refusing to overwrite immutable package: {target}")
    target.mkdir(parents=True)
    audio = Path(artifact["path"])
    audio_name = f"{episode_id}.mp3"
    shutil.copy2(audio, target / audio_name)
    cover = Path(str(state.get("cover_path") or ""))
    if not cover.is_file():
        raise ValueError("Package requires a generated cover")
    cover_name = cover.name
    for value in (cover, state.get("review_summary", {}).get("audio_quality_report")):
        source = Path(str(value or ""))
        if source.is_file():
            shutil.copy2(source, target / source.name)
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
    sources = []
    seen = set()
    for fact in state.get("facts", []):
        if not isinstance(fact, dict):
            continue
        for url in [fact.get("source_url"), *(fact.get("source_urls") or [])]:
            url = str(url or "")
            if url.startswith("https://") and url not in seen:
                seen.add(url)
                sources.append({"title": str(fact.get("source_title") or fact.get("title") or "来源"), "url": url})
    if not sources:
        raise ValueError("Package requires public traceable sources")
    base = f"https://www.liuminxin.cn/podflow-studio/episodes/{episode_id}"
    manifest = {
        "id": episode_id, "title": str(script.get("title") or "PodFlow 晨报"),
        "summary": str(script.get("description") or "6 条快讯和 1 条重点解读。"),
        "publishedAt": str(state.get("created_at") or datetime.now(timezone.utc).isoformat()),
        "durationSeconds": duration, "audioUrl": f"{base}/{audio_name}",
        "audioBytes": artifact["size_bytes"], "coverUrl": f"{base}/{cover_name}",
        "transcriptUrl": f"{base}/transcript.vtt", "chaptersUrl": f"{base}/chapters.json",
        "sources": sources, "credits": [{"role": "制作", "name": "PodFlow Studio"}],
        "ttsProvider": "豆包 BigTTS", "aiAssisted": True, "explicit": False,
        "qualityProfile": "podflow_morning_v3", "audioSha256": artifact["sha256"],
        "musicCredits": [{"title": "Quick Spark", "artist": "Ondrosik",
                          "sourceUrl": "https://ondrosik.sk/music/", "license": "CC0 1.0 Universal",
                          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
                          "edited": "经裁剪、淡入淡出及响度处理"}],
        "approval": state.get("audio_approval", {}),
    }
    if skip_approval:
        manifest["unreviewed"] = True
    notes = [f"# {manifest['title']}", "", manifest["summary"], "", "## 来源", ""] + [f"- [{item['title']}]({item['url']})" for item in sources]
    (target / "show-notes.md").write_text("\n".join(notes) + "\n", encoding="utf-8")
    (target / "episode.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"stage": "package", "directory": str(target), "manifest": manifest}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workflow", required=True)
    parser.add_argument("--stage", required=True, choices=("render", "approve", "package"))
    parser.add_argument("--allow-paid-tts", action="store_true")
    parser.add_argument("--skip-approval", action="store_true", help="Skip the human-approval gate; package is marked unreviewed")
    parser.add_argument("--tts-engine", default="", help="TTS engine override (e.g. edge-tts)")
    parser.add_argument("--audio-sha256", default="")
    parser.add_argument("--reviewer", default="")
    parser.add_argument("--notes", default="")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        value = os.environ.get(name, "")
        if value.startswith(("http://127.0.0.1:", "https://127.0.0.1:", "http://localhost:", "https://localhost:")):
            os.environ.pop(name, None)
    path = _resolve_workflow(args.workflow)
    envelope, state = _load(path)
    if args.stage == "render":
        result = render(path, envelope, state, args.allow_paid_tts, tts_engine=args.tts_engine)
    elif args.stage == "approve":
        if not args.audio_sha256 or not args.reviewer:
            raise ValueError("approve requires --audio-sha256 and --reviewer")
        result = approve(path, envelope, state, args.audio_sha256, args.reviewer, args.notes)
    else:
        if args.output is None:
            raise ValueError("package requires --output")
        result = package(state, args.output.resolve(), skip_approval=args.skip_approval)
    print(json.dumps({"ok": True, **result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        raise SystemExit(10)
