import copy
import json
import re
from datetime import datetime, timezone
from typing import Any

from nodes.script.config import ScriptConfig
from nodes.script.editorial_plan import (
    EDITORIAL_PLAN_SYSTEM_PROMPT,
    build_editorial_plan_prompt,
    validate_editorial_plan,
)
from nodes.script.prompts import EPISODE_SCRIPT_SYSTEM_PROMPT, build_episode_script_prompt
from nodes.script.quality import (
    apply_segment_repairs,
    assess_script_quality,
    build_script_repair_prompt,
)
from protocol.llm_runtime import create_llm_runtime, has_llm_runtime_config, resolve_llm_target
from protocol.morning_news import (
    build_run_report,
    generate_deterministic_script as _generate_base_deterministic_script,
    resolve_morning_news_structure,
)
from protocol.node_runner import NodeContext
from protocol.presets import get_default_preset


NEWS_SEGMENT_TYPES = {"quick_news", "deep_dive"}
ALLOWED_SEGMENT_TYPES = {"opening", "quick_news", "deep_dive", "closing", "custom"}


def _resolve_script_structure(
    facts: list[dict[str, Any]],
    preset: dict[str, Any],
) -> dict[str, Any]:
    """Let an explicit organize-page choice override the automatic density rule."""

    structure = dict(resolve_morning_news_structure(len(facts), preset))
    actual_total = int(structure["actual_news_item_count"])
    selected_facts = facts[:actual_total]
    has_explicit_deep_dive = any(
        isinstance(fact, dict) and bool(fact.get("is_deep_dive"))
        for fact in selected_facts
    )
    if not has_explicit_deep_dive or actual_total <= 0:
        return structure

    structure.update(
        {
            "recommended_quick_news_count": max(
                0,
                int(structure["recommended_news_item_count"]) - 1,
            ),
            "recommended_deep_dive_count": 1,
            "actual_quick_news_count": max(0, actual_total - 1),
            "actual_deep_dive_count": 1,
            "template_variant": f"quick_{max(0, actual_total - 1)}_plus_deep_1",
        }
    )
    return structure


def _explicit_deep_dive_text(fact: dict[str, Any], preset: dict[str, Any]) -> str:
    title = str(fact.get("title") or "这条新闻").strip()
    body = " ".join(str(fact.get("summary") or fact.get("claim") or "").split())
    char_range = preset.get("deep_dive_chars") or [2000, 2600]
    try:
        max_chars = max(200, int(char_range[1]))
    except (IndexError, TypeError, ValueError):
        max_chars = 2600
    prefix = f"接下来展开今天的深度稿：{title}。"
    return f"{prefix}{body}"[:max_chars]


def generate_deterministic_script(
    facts: list[dict[str, Any]],
    preset: dict[str, Any] | None = None,
    *,
    episode_id: str = "",
    title: str = "通勤早咖啡：今日新闻简报",
) -> dict[str, Any]:
    """Keep deterministic fallback aligned with an explicitly selected deep dive."""

    resolved_preset = preset or get_default_preset()
    base_structure = resolve_morning_news_structure(len(facts), resolved_preset)
    marked_fact = next(
        (
            fact
            for fact in facts
            if isinstance(fact, dict) and bool(fact.get("is_deep_dive"))
        ),
        None,
    )
    generation_facts = facts
    if isinstance(marked_fact, dict) and int(base_structure["actual_news_item_count"]) > 0:
        generation_facts = [
            *[
                fact
                for fact in facts
                if fact is not marked_fact
            ][: max(0, int(base_structure["actual_news_item_count"]) - 1)],
            marked_fact,
        ]
    script = _generate_base_deterministic_script(
        generation_facts,
        resolved_preset,
        episode_id=episode_id,
        title=title,
    )
    structure = _resolve_script_structure(generation_facts, resolved_preset)
    if not isinstance(marked_fact, dict):
        return script

    marked_fact_id = str(marked_fact.get("id") or "")
    for segment in script.get("segments", []):
        if segment.get("type") == "opening":
            segment["text"] = re.sub(
                r"其中 \d+ 条快讯和 \d+ 段重点展开",
                f"其中 {structure['actual_quick_news_count']} 条快讯和 1 段重点展开",
                str(segment.get("text") or ""),
            )
        if (
            segment.get("type") in NEWS_SEGMENT_TYPES
            and marked_fact_id
            and marked_fact_id in segment.get("source_fact_ids", [])
        ):
            segment["type"] = "deep_dive"
            segment["text"] = _explicit_deep_dive_text(marked_fact, resolved_preset)
            segment["estimated_seconds"] = max(6, int(len(segment["text"]) / 6.5))

    script.update(structure)
    return script


def _build_news_brief_prompt(
    topic: dict[str, Any],
    config: ScriptConfig,
    facts: list[dict[str, Any]],
    structure: dict[str, Any],
    editorial_plan: dict[str, Any] | None = None,
) -> str:
    return build_episode_script_prompt(topic, config, facts, structure, editorial_plan)


def _normalize_script(
    raw_script: dict[str, Any],
    topic: dict[str, Any],
    facts: list[dict[str, Any]],
    config: ScriptConfig,
    editorial_plan: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not isinstance(raw_script, dict):
        raw_script = {}

    fact_ids = {str(fact.get("id")) for fact in facts if isinstance(fact, dict) and fact.get("id")}
    normalized_segments: list[dict[str, Any]] = []
    raw_segments = raw_script.get("segments") or []
    if isinstance(raw_segments, list):
        for idx, segment in enumerate(raw_segments):
            if not isinstance(segment, dict) or not segment.get("text"):
                continue
            source_fact_ids = [
                str(fact_id)
                for fact_id in segment.get("source_fact_ids", [])
                if str(fact_id) in fact_ids
            ]
            text = str(segment.get("text", "")).strip()
            segment_type = str(segment.get("type") or "custom")
            if segment_type not in ALLOWED_SEGMENT_TYPES:
                segment_type = "custom"
            if segment_type == "custom":
                return generate_deterministic_script(
                    facts,
                    _preset_from_config(config),
                    episode_id="",
                    title=topic.get("title", "通勤早咖啡：今日新闻简报"),
                )
            if segment_type in NEWS_SEGMENT_TYPES and not source_fact_ids:
                return generate_deterministic_script(
                    facts,
                    _preset_from_config(config),
                    episode_id="",
                    title=topic.get("title", "通勤早咖啡：今日新闻简报"),
                )
            normalized_segments.append(
                {
                    "id": segment.get("id") or f"seg_{idx + 1:03d}",
                    "type": segment_type,
                    "title": segment.get("title") or "",
                    "text": text,
                    "source_fact_ids": source_fact_ids,
                    "estimated_seconds": int(segment.get("estimated_seconds") or max(6, len(text) / 6.5)),
                    "speaker": segment.get("speaker", "Host A"),
                }
            )

    if not normalized_segments:
        return generate_deterministic_script(
            facts,
            _preset_from_config(config),
            episode_id="",
            title=topic.get("title", "通勤早咖啡：今日新闻简报"),
        )

    structure = _resolve_script_structure(facts, _preset_from_config(config))
    planned_items = editorial_plan.get("items", []) if editorial_plan else []
    expected_news_types = (
        [
            "deep_dive" if item["role"] == "deep_dive" else "quick_news"
            for item in planned_items
        ]
        if planned_items
        else ["quick_news"] * int(structure["actual_quick_news_count"]) + [
            "deep_dive"
        ] * int(structure["actual_deep_dive_count"])
    )
    actual_news_segments = [
        segment for segment in normalized_segments if segment["type"] in NEWS_SEGMENT_TYPES
    ]
    used_news_fact_ids = {
        fact_id
        for segment in actual_news_segments
        for fact_id in segment["source_fact_ids"]
    }
    has_opening = any(segment["type"] == "opening" for segment in normalized_segments)
    has_closing = any(segment["type"] == "closing" for segment in normalized_segments)
    marked_deep_fact_id = next(
        (
            str(fact.get("id") or "")
            for fact in facts
            if isinstance(fact, dict) and bool(fact.get("is_deep_dive"))
        ),
        "",
    )
    deep_segments = [
        segment for segment in actual_news_segments if segment["type"] == "deep_dive"
    ]
    marked_deep_binding_is_valid = (
        not marked_deep_fact_id
        or (
            len(deep_segments) == 1
            and marked_deep_fact_id in deep_segments[0]["source_fact_ids"]
            and not any(
                marked_deep_fact_id in segment["source_fact_ids"]
                for segment in actual_news_segments
                if segment["type"] == "quick_news"
            )
        )
    )
    planned_bindings_are_valid = (
        not planned_items
        or [
            segment["source_fact_ids"]
            for segment in actual_news_segments
        ] == [[item["fact_id"]] for item in planned_items]
    )
    if (
        [segment["type"] for segment in actual_news_segments] != expected_news_types
        or used_news_fact_ids != fact_ids
        or not has_opening
        or not has_closing
        or not marked_deep_binding_is_valid
        or not planned_bindings_are_valid
    ):
        return generate_deterministic_script(
            facts,
            _preset_from_config(config),
            episode_id="",
            title=topic.get("title", "通勤早咖啡：今日新闻简报"),
        )

    script = {
        "title": raw_script.get("title") or topic.get("title") or "通勤早咖啡：今日新闻简报",
        "description": raw_script.get("description") or "单人新闻早报，面向通勤路上的快速收听。",
        "content_type": "news_brief",
        "preset_id": config.preset_id,
        "num_hosts": 1,
        "language": config.language,
        "segments": normalized_segments,
        "generated_by": raw_script.get("generated_by", "llm"),
    }
    return script


def run(state: dict[str, Any], config: ScriptConfig = None) -> dict[str, Any]:
    config = config or ScriptConfig()
    ctx = NodeContext("ScriptNode", state)
    topic = state.get("selected_topic", {}) or {"title": "通勤早咖啡：今日新闻早报"}
    facts = state.get("facts", [])

    ctx.log_start(
        f"输入: topic='{topic.get('title', 'N/A')[:50]}', facts={len(facts)} | "
        f"preset={config.preset_id}, content_type={config.content_type}, "
        f"target_duration={config.target_duration_minutes}min, num_hosts={config.num_hosts}",
        uses_llm=True,
    )

    try:
        if not facts:
            ctx.add_error("script", "Missing facts; run FactsNode before ScriptNode")
            ctx.log_end("输出: (无脚本 — 缺少事实卡片)")
            return ctx.finalize(state)

        if not state.get("selected_topics"):
            ctx.add_error("script", "Missing selected_topics; run FactsNode before ScriptNode")
            ctx.log_end("输出: (无脚本 — 缺少已选主题)")
            return ctx.finalize(state)

        preset = _preset_from_config(config)
        state["preset"] = preset
        script_facts = _select_script_facts(state, facts, config)
        if not script_facts:
            ctx.add_error("script", "Missing selected facts for script generation")
            ctx.log_end("输出: (无脚本 — 缺少已整理事实卡片)")
            return ctx.finalize(state)

        request = state.get("generation_request")
        request = request if isinstance(request, dict) else {}
        request_mode = request.get("mode", "initial")
        if request_mode not in {"initial", "regenerate"}:
            raise ValueError(f"Unsupported generation request mode: {request_mode}")
        is_regeneration = request_mode == "regenerate"

        # Do all expensive generation before touching the active draft. A model
        # failure therefore leaves the existing edited script available.
        script = _generate_script(
            topic,
            script_facts,
            config,
            ctx,
            require_llm=bool(request.get("require_llm")),
        )
        script["id"] = f"{state.get('episode_id', 'episode')}_script_generated"
        generated_at = datetime.now(timezone.utc).isoformat()

        if is_regeneration:
            _append_script_snapshot(state, request, generated_at)

        state["script"] = script
        if is_regeneration or not state.get("edited_script"):
            state["edited_script"] = {
                **copy.deepcopy(script),
                "id": f"{script.get('id', 'script')}_editable",
                "edited_from": script.get("id", "script.generated"),
                "edit_mode": "regenerated" if is_regeneration else "initial_editable_copy",
            }
        state["generation_meta"] = _generation_meta(config, script_facts, script, generated_at)
        state["generation_request"] = {}

        if is_regeneration:
            _invalidate_downstream_outputs(state, generated_at)

        build_run_report(state)
        ctx.log(
            f"脚本生成完成: {script.get('title', '')}, segments={len(script.get('segments', []))}, "
            f"facts={len(facts)}"
        )
    except Exception as e:
        request = state.get("generation_request")
        if isinstance(request, dict) and request:
            state["generation_request"] = {
                **request,
                "status": "failed",
                "failed_at": datetime.now(timezone.utc).isoformat(),
            }
        ctx.add_error("script", str(e), detail=str(e))
        ctx.log(f"错误: {str(e)}")

    script = state.get("script", {})
    detail = (
        f"输出: script.title='{script.get('title', 'N/A')[:50]}', "
        f"segments={len(script.get('segments', []))}"
    )
    ctx.log_end(detail)
    return ctx.finalize(state)


def _generate_script(
    topic: dict[str, Any],
    facts: list[dict[str, Any]],
    config: ScriptConfig,
    ctx: NodeContext,
    *,
    require_llm: bool = False,
) -> dict[str, Any]:
    target = resolve_llm_target(config)
    preset = _preset_from_config(config)

    if not has_llm_runtime_config(config):
        if require_llm:
            raise RuntimeError(
                f"成稿 AI 未配置或凭据不可用（{target.masked_summary()}），未使用本地模板覆盖初稿"
            )
        ctx.log(f"未配置可用 LLM runtime ({target.masked_summary()})，使用 deterministic 本地稿件生成器")
        return generate_deterministic_script(
            facts,
            preset,
            episode_id="",
            title=topic.get("title", "通勤早咖啡：今日新闻简报"),
        )

    with create_llm_runtime(config, debug_mode=ctx.debug_mode) as client:
        ctx.log(f"LLM编排调用: {target.masked_summary()}, timeout={config.timeout}s")
        plan_response = client.call(
            [
                {"role": "system", "content": EDITORIAL_PLAN_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": build_editorial_plan_prompt(
                        facts,
                        target_chars_min=config.episode_chars_min,
                        target_chars_max=config.episode_chars_max,
                    ),
                },
            ],
            timeout=config.timeout,
            logs=ctx.logs,
        )
        plan_content = client.extract_content(plan_response)
        editorial_plan = validate_editorial_plan(_parse_json_object(plan_content, "成稿编排"), facts)
        ctx.log(
            f"成稿编排完成: items={len(editorial_plan['items'])}, "
            f"order={[item['fact_id'] for item in editorial_plan['items']]}"
        )
        prompt = _build_news_brief_prompt(
            topic,
            config,
            facts,
            _resolve_script_structure(facts, preset),
            editorial_plan,
        )
        ctx.log(f"LLM成稿调用: {target.masked_summary()}, timeout={config.timeout}s")
        response = client.call(
            [
                {"role": "system", "content": EPISODE_SCRIPT_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            timeout=config.timeout,
            logs=ctx.logs,
        )
        content = client.extract_content(response)

    try:
        parsed = _parse_json_object(content, "成稿")
        normalized = _normalize_script(parsed, topic, facts, config, editorial_plan)
        if normalized.get("generated_by") == "deterministic_mock":
            if require_llm:
                raise RuntimeError(
                    "成稿 AI 返回的段落结构、新闻数量或事实绑定无效，未使用本地模板覆盖初稿"
                )
            return normalized
        quality = assess_script_quality(normalized, facts, editorial_plan)
        repairable_issues = [
            issue for issue in [*quality["hard"], *quality["soft"]] if issue.get("segment_id")
        ]
        if repairable_issues:
            repair_ids = {issue["segment_id"] for issue in repairable_issues}
            try:
                ctx.log(f"成稿定向修复调用: segments={sorted(repair_ids)}")
                with create_llm_runtime(config, debug_mode=ctx.debug_mode) as repair_client:
                    repair_response = repair_client.call(
                        [
                            {
                                "role": "system",
                                "content": "你是中文资讯播客的事实约束修稿编辑。只返回有效 JSON。",
                            },
                            {
                                "role": "user",
                                "content": build_script_repair_prompt(
                                    normalized, facts, repairable_issues
                                ),
                            },
                        ],
                        timeout=config.timeout,
                        logs=ctx.logs,
                    )
                    repair_content = repair_client.extract_content(repair_response)
                repaired = apply_segment_repairs(
                    normalized,
                    _parse_json_object(repair_content, "成稿修复"),
                    repair_ids,
                )
                normalized = _normalize_script(repaired, topic, facts, config, editorial_plan)
                if normalized.get("generated_by") == "deterministic_mock":
                    raise ValueError("成稿修复改变了段落结构或事实绑定")
                quality = assess_script_quality(normalized, facts, editorial_plan)
            except Exception as repair_error:
                if quality["hard"]:
                    raise
                ctx.log(f"成稿软问题定向修复未采用: {repair_error}")
        if quality["hard"]:
            details = "；".join(issue["detail"] for issue in quality["hard"])
            if require_llm:
                raise RuntimeError(f"成稿 AI 未通过事实质检：{details}")
            ctx.log(f"成稿事实质检失败，使用 deterministic 降级输出: {details}")
            return generate_deterministic_script(
                facts, preset, episode_id="", title=topic.get("title", "通勤早咖啡：今日新闻简报")
            )
        if quality["soft"]:
            ctx.log(
                "成稿听感提示: "
                + "；".join(f"{issue['code']}:{issue['detail']}" for issue in quality["soft"])
            )
        return normalized
    except (ValueError, json.JSONDecodeError) as error:
        if require_llm:
            raise RuntimeError(f"成稿 AI 返回无效：{error}，未使用本地模板覆盖初稿") from error
        ctx.log(f"成稿解析或校验失败，使用 deterministic 降级输出: {error}")

    if require_llm:
        raise RuntimeError("成稿 AI 未返回可读取的脚本对象，未使用本地模板覆盖初稿")
    return generate_deterministic_script(
        facts,
        preset,
        episode_id="",
        title=topic.get("title", "通勤早咖啡：今日新闻简报"),
    )


def _parse_json_object(content: str, label: str) -> dict[str, Any]:
    json_match = re.search(r"\{.*\}", content, re.DOTALL)
    if not json_match:
        raise ValueError(f"{label} AI 未返回 JSON 对象")
    try:
        parsed = json.loads(json_match.group())
    except json.JSONDecodeError as exc:
        raise ValueError(f"{label} AI 未返回有效 JSON") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"{label} AI 必须返回 JSON 对象")
    return parsed


def _preset_from_config(config: ScriptConfig) -> dict[str, Any]:
    preset = get_default_preset()

    def seconds_for_chars(chars: int) -> int:
        return max(1, round(chars / config.words_per_minute * 60))

    template_variant = (
        f"quick_{config.quick_news_recommended_count}_plus_deep_{config.deep_dive_recommended_count}"
        if config.deep_dive_recommended_count
        else f"quick_{config.quick_news_recommended_count}"
    )
    preset.update(
        {
            "id": config.preset_id,
            "content_type": "news_brief",
            "num_hosts": 1,
            "target_duration_minutes": config.target_duration_minutes,
            "target_duration_minutes_range": f"around {config.target_duration_minutes}",
            "template_variant": template_variant,
            "recommended_news_item_count": config.recommended_news_item_count,
            "quick_news_recommended_count": config.quick_news_recommended_count,
            "deep_dive_recommended_count": config.deep_dive_recommended_count,
            "allow_custom_news_item_count": config.allow_custom_news_item_count,
            "editorial_voice": config.editorial_voice,
            "quick_news_chars": [config.quick_news_chars_min, config.quick_news_chars_max],
            "deep_dive_chars": [config.deep_dive_chars_min, config.deep_dive_chars_max],
            "episode_chars": [config.episode_chars_min, config.episode_chars_max],
            "tone": config.tone,
            "content_tendency": config.content_tendency,
            "content_guidance": config.content_guidance,
            "language": config.language,
            "segment_plan": [
                {
                    "type": "opening",
                    "count": 1,
                    "target_seconds": [seconds_for_chars(320), seconds_for_chars(450)],
                },
                {
                    "type": "quick_news",
                    "recommended_count": config.quick_news_recommended_count,
                    "target_seconds": [
                        seconds_for_chars(config.quick_news_chars_min),
                        seconds_for_chars(config.quick_news_chars_max),
                    ],
                },
                {
                    "type": "deep_dive",
                    "recommended_count": config.deep_dive_recommended_count,
                    "target_seconds": [
                        seconds_for_chars(config.deep_dive_chars_min),
                        seconds_for_chars(config.deep_dive_chars_max),
                    ],
                },
                {
                    "type": "closing",
                    "count": 1,
                    "target_seconds": [seconds_for_chars(80), seconds_for_chars(160)],
                },
            ],
        }
    )
    return preset


def _select_script_facts(
    state: dict[str, Any], facts: list[dict[str, Any]], config: ScriptConfig
) -> list[dict[str, Any]]:
    """Use the explicit FactsNode topic selection as the only script input."""

    by_id = {
        str(fact.get("id")): fact
        for fact in facts
        if isinstance(fact, dict) and fact.get("id")
    }
    selected_topics = state.get("selected_topics")
    selected: list[dict[str, Any]] = []
    deep_fact_id = next(
        (
            str(fact.get("id") or "")
            for fact in facts
            if isinstance(fact, dict) and bool(fact.get("is_deep_dive"))
        ),
        "",
    )
    if isinstance(selected_topics, list) and selected_topics:
        seen: set[str] = set()
        for topic in selected_topics:
            if not isinstance(topic, dict):
                continue
            fact_id = str(topic.get("fact_id") or "")
            if bool(topic.get("is_deep_dive")):
                deep_fact_id = fact_id
            fact = by_id.get(fact_id)
            if fact and fact_id not in seen:
                selected.append(fact)
                seen.add(fact_id)
    candidates = selected
    deep_fact = next(
        (fact for fact in candidates if str(fact.get("id") or "") == deep_fact_id),
        None,
    )
    max_items = len(candidates) if config.allow_custom_news_item_count else config.recommended_news_item_count
    if deep_fact is not None:
        quick_facts = [fact for fact in candidates if fact is not deep_fact]
        marked_deep_fact = {**deep_fact, "is_deep_dive": True}
        return [
            *quick_facts[: max(0, max_items - 1)],
            marked_deep_fact,
        ]
    return candidates[:max_items]


def _append_script_snapshot(
    state: dict[str, Any], request: dict[str, Any], generated_at: str
) -> None:
    requested_draft = request.get("draft_snapshot")
    old_draft = (
        requested_draft
        if isinstance(requested_draft, dict) and requested_draft.get("segments")
        else state.get("edited_script", {})
    )
    if not isinstance(old_draft, dict) or not old_draft.get("segments"):
        return
    snapshots = state.get("script_snapshots")
    if not isinstance(snapshots, list):
        snapshots = []
    snapshots.append(
        {
            "id": f"script_snapshot_{generated_at.replace(':', '').replace('+', '').replace('-', '')}",
            "reason": "before_regeneration",
            "created_at": generated_at,
            "edited_script": copy.deepcopy(old_draft),
            "generation_meta": copy.deepcopy(state.get("generation_meta", {})),
        }
    )
    state["script_snapshots"] = snapshots[-10:]


def _generation_meta(
    config: ScriptConfig,
    facts: list[dict[str, Any]],
    script: dict[str, Any],
    generated_at: str,
) -> dict[str, Any]:
    structure = _resolve_script_structure(facts, _preset_from_config(config))
    return {
        "generated_at": generated_at,
        "preset_id": config.preset_id,
        "source_fact_count": len(facts),
        "used_fact_ids": [str(fact.get("id")) for fact in facts if fact.get("id")],
        "structure": structure,
        "actual_news_item_count": script.get("actual_news_item_count", structure["actual_news_item_count"]),
        "settings": {
            "target_duration_minutes": config.target_duration_minutes,
            "editorial_voice": config.editorial_voice,
            "quick_news_chars": [config.quick_news_chars_min, config.quick_news_chars_max],
            "deep_dive_chars": [config.deep_dive_chars_min, config.deep_dive_chars_max],
            "episode_chars": [config.episode_chars_min, config.episode_chars_max],
            "content_tendency": config.content_tendency,
            "content_guidance": config.content_guidance,
            "words_per_minute": config.words_per_minute,
        },
    }


def _invalidate_downstream_outputs(state: dict[str, Any], generated_at: str) -> None:
    """Retire active production outputs while retaining their physical paths."""

    artifact_keys = [
        "voice_segments",
        "audio_outputs",
        "cover_path",
        "review_summary",
        "publish_outputs",
        "subtitle_path",
    ]
    artifacts = {
        key: copy.deepcopy(state.get(key))
        for key in artifact_keys
        if state.get(key) not in (None, "", [], {})
    }
    state.update(
        {
            "voice_segments": [],
            "audio_outputs": {},
            "cover_path": "",
            "review_summary": {},
            "publish_outputs": {},
            "subtitle_path": "",
            "downstream_stale": {
                "is_stale": bool(artifacts),
                "reason": "script_regenerated",
                "invalidated_at": generated_at,
                "artifacts": artifacts,
            },
        }
    )
    manifest = state.get("_manifest")
    nodes = manifest.get("nodes") if isinstance(manifest, dict) else None
    if isinstance(nodes, dict):
        for node_name in ("tts", "audio_postprocess", "assets", "review", "publish"):
            if node_name in nodes and isinstance(nodes[node_name], dict):
                nodes[node_name]["status"] = "stale"
