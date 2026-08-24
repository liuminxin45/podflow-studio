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
EDITORIAL_QUALITY_VERSION = "editorial_quality_v1"
EDITORIAL_DIMENSIONS = (
    "relevance",
    "information_gain",
    "synthesis",
    "coherence",
    "spoken_naturalness",
    "non_repetition",
)


def _resolve_script_structure(
    facts: list[dict[str, Any]],
    preset: dict[str, Any],
) -> dict[str, Any]:
    """Resolve depth only from the evidence-backed organize-page decision."""

    structure = dict(resolve_morning_news_structure(len(facts), preset))
    actual_total = int(structure["actual_news_item_count"])
    selected_facts = facts[:actual_total]
    has_explicit_deep_dive = any(
        isinstance(fact, dict) and bool(fact.get("is_deep_dive"))
        for fact in selected_facts
    )
    if actual_total <= 0:
        return structure
    if not has_explicit_deep_dive:
        structure.update(
            {
                "actual_quick_news_count": actual_total,
                "actual_deep_dive_count": 0,
                "template_variant": f"quick_{actual_total}",
            }
        )
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
    brief = fact.get("deep_dive_brief")
    brief = brief if isinstance(brief, dict) else {}
    brief_parts = [
        str(brief.get("whyNow") or ""),
        *[
            " ".join(
                str(claim.get("text") or "")
                for claim in section.get("claims", [])
                if isinstance(claim, dict)
            )
            for section in brief.get("sections", [])
            if isinstance(section, dict)
        ],
        *[
            str(claim.get("text") or "")
            for claim in brief.get("counterpoints", [])
            if isinstance(claim, dict)
        ],
        str(brief.get("thesisBoundary") or ""),
    ]
    body = " ".join(
        " ".join(part.split())
        for part in brief_parts
        if part and str(part).strip()
    ) or " ".join(str(fact.get("summary") or "").split())
    char_range = preset.get("deep_dive_chars") or [1200, 1600]
    try:
        max_chars = max(200, int(char_range[1]))
    except (IndexError, TypeError, ValueError):
        max_chars = 1600
    prefix = f"接下来展开今天的深度稿：{title}。"
    return f"{prefix}{body}"[:max_chars]


def generate_deterministic_script(
    facts: list[dict[str, Any]],
    preset: dict[str, Any] | None = None,
    *,
    episode_id: str = "",
    title: str = "PodFlow 晨报",
) -> dict[str, Any]:
    """Keep deterministic fallback aligned with an explicitly selected deep dive."""

    resolved_preset = preset or get_default_preset()
    marked_fact = next(
        (
            fact
            for fact in facts
            if isinstance(fact, dict) and bool(fact.get("is_deep_dive"))
        ),
        None,
    )
    generation_preset = resolved_preset
    if not isinstance(marked_fact, dict):
        generation_preset = {
            **resolved_preset,
            "quick_news_recommended_count": int(
                resolved_preset.get("recommended_news_item_count", len(facts))
            ),
            "deep_dive_recommended_count": 0,
            "template_variant": f"quick_{min(len(facts), int(resolved_preset.get('recommended_news_item_count', len(facts))))}",
        }
    base_structure = resolve_morning_news_structure(len(facts), generation_preset)
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
        generation_preset,
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
    claim_ids_by_fact = {
        str(fact.get("id")): [
            str(claim.get("id"))
            for claim in fact.get("claims", [])
            if isinstance(claim, dict) and claim.get("status") == "supported" and claim.get("id")
        ]
        for fact in facts
        if isinstance(fact, dict) and fact.get("id")
    }
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
                segment_type = "quick_news" if source_fact_ids else "custom"
            if segment_type == "custom":
                continue
            if segment_type in NEWS_SEGMENT_TYPES and not source_fact_ids:
                return generate_deterministic_script(
                    facts,
                    _preset_from_config(config),
                    episode_id="",
                    title=topic.get("title", "PodFlow 晨报"),
                )
            normalized_segments.append(
                {
                    "id": segment.get("id") or f"seg_{idx + 1:03d}",
                    "type": segment_type,
                    "title": segment.get("title") or "",
                    "text": text,
                    "source_fact_ids": source_fact_ids,
                    "source_claim_ids": [
                        claim_id for fact_id in source_fact_ids for claim_id in claim_ids_by_fact.get(fact_id, [])
                    ],
                    "estimated_seconds": int(segment.get("estimated_seconds") or max(6, len(text) / 6.5)),
                    "speaker": segment.get("speaker", "Host A"),
                }
            )

    if not normalized_segments:
        return generate_deterministic_script(
            facts,
            _preset_from_config(config),
            episode_id="",
            title=topic.get("title", "PodFlow 晨报"),
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
    if planned_items and len(actual_news_segments) == len(planned_items):
        segments_by_fact_id = {
            segment["source_fact_ids"][0]: segment
            for segment in actual_news_segments
            if len(segment["source_fact_ids"]) == 1
        }
        planned_fact_ids = [item["fact_id"] for item in planned_items]
        if (
            len(segments_by_fact_id) == len(actual_news_segments)
            and set(segments_by_fact_id) == set(planned_fact_ids)
        ):
            actual_news_segments = [
                segments_by_fact_id[fact_id] for fact_id in planned_fact_ids
            ]
            for segment, item in zip(actual_news_segments, planned_items):
                segment["type"] = (
                    "deep_dive" if item["role"] == "deep_dive" else "quick_news"
                )
            normalized_segments = [
                *[
                    segment
                    for segment in normalized_segments
                    if segment["type"] == "opening"
                ],
                *actual_news_segments,
                *[
                    segment
                    for segment in normalized_segments
                    if segment["type"] == "closing"
                ],
            ]
    if not any(segment["type"] == "opening" for segment in normalized_segments):
        normalized_segments.insert(
            0,
            {
                "id": "seg_opening",
                "type": "opening",
                "title": "开场",
                "text": "早上好，下面是今天值得关注的新闻。",
                "source_fact_ids": list(
                    (editorial_plan or {}).get("opening", {}).get("fact_ids", [])
                ),
                "source_claim_ids": [
                    claim_id
                    for fact_id in (editorial_plan or {}).get("opening", {}).get("fact_ids", [])
                    for claim_id in claim_ids_by_fact.get(str(fact_id), [])
                ],
                "estimated_seconds": 8,
                "speaker": "Host A",
            },
        )
    if not any(segment["type"] == "closing" for segment in normalized_segments):
        normalized_segments.append(
            {
                "id": "seg_closing",
                "type": "closing",
                "title": "收尾",
                "text": "以上是本期内容，我们下期见。",
                "source_fact_ids": [],
                "source_claim_ids": [],
                "estimated_seconds": 6,
                "speaker": "Host A",
            }
        )
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
            title=topic.get("title", "PodFlow 晨报"),
        )

    script = {
        "title": raw_script.get("title") or topic.get("title") or "PodFlow 晨报",
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
    topic = state.get("selected_topic", {}) or {"title": "PodFlow 晨报"}
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
        editorial_quality = script.pop("_editorial_quality", {
            "version": EDITORIAL_QUALITY_VERSION,
            "status": "failed",
            "model": "",
            "scores": {},
            "hard_errors": ["MODEL_EDITORIAL_EVALUATION_MISSING"],
            "repair_count": 0,
        })
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
        state["generation_meta"] = _generation_meta(
            config, script_facts, script, generated_at, editorial_quality
        )
        state["generation_request"] = {}

        if is_regeneration:
            _invalidate_downstream_outputs(state, generated_at)

        build_run_report(state)
        ctx.log(
            f"脚本生成完成: {script.get('title', '')}, segments={len(script.get('segments', []))}, "
            f"facts={len(facts)}"
        )
    except Exception as e:
        import traceback

        tb = traceback.format_exc()
        request = state.get("generation_request")
        if isinstance(request, dict) and request:
            state["generation_request"] = {
                **request,
                "status": "failed",
                "failed_at": datetime.now(timezone.utc).isoformat(),
            }
        ctx.add_error("script", f"{type(e).__name__}: {e}", detail=tb)
        ctx.log(f"错误: {type(e).__name__}: {e}")
        ctx.log(f"Traceback: {tb}")

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
            title=topic.get("title", "PodFlow 晨报"),
        )

    try:
        with create_llm_runtime(config, debug_mode=ctx.debug_mode) as client:
            structure = _resolve_script_structure(facts, preset)
            ctx.log(f"LLM编排调用: {target.masked_summary()}, timeout={config.timeout}s")
            editorial_plan_payload = client.run_task(
                "script.plan",
                f"{EDITORIAL_PLAN_SYSTEM_PROMPT}\n\n" + build_editorial_plan_prompt(
                    facts,
                    target_chars_min=config.episode_chars_min,
                    target_chars_max=config.episode_chars_max,
                    deep_dive_count=int(structure["actual_deep_dive_count"]),
                ),
                timeout=config.timeout,
                logs=ctx.logs,
            )
            try:
                editorial_plan = validate_editorial_plan(
                    editorial_plan_payload,
                    facts,
                    expected_deep_dive_count=int(structure["actual_deep_dive_count"]),
                )
            except ValueError as plan_error:
                ctx.log(f"成稿编排定向修复调用: {plan_error}")
                repaired_plan_payload = client.run_task(
                    "script.plan_repair",
                    "修复下面的编排，只修复格式和约束，不改变事实 ID 集合，不增加事实。\n\n"
                    f"<校验错误>{plan_error}</校验错误>\n"
                    f"<原编排>{json.dumps(editorial_plan_payload, ensure_ascii=False)}</原编排>\n\n"
                    + build_editorial_plan_prompt(
                        facts,
                        target_chars_min=config.episode_chars_min,
                        target_chars_max=config.episode_chars_max,
                        deep_dive_count=int(structure["actual_deep_dive_count"]),
                    ),
                    timeout=config.timeout,
                    logs=ctx.logs,
                )
                editorial_plan = validate_editorial_plan(
                    repaired_plan_payload,
                    facts,
                    expected_deep_dive_count=int(structure["actual_deep_dive_count"]),
                )
            ctx.log(
                f"成稿编排完成: items={len(editorial_plan['items'])}, "
                f"order={[item['fact_id'] for item in editorial_plan['items']]}"
            )
            prompt = _build_news_brief_prompt(
                topic,
                config,
                facts,
                structure,
                editorial_plan,
            )
            ctx.log(f"LLM成稿调用: {target.masked_summary()}, timeout={config.timeout}s")
            content = client.run_task(
                "script.write",
                f"{EPISODE_SCRIPT_SYSTEM_PROMPT}\n\n{prompt}",
                timeout=config.timeout,
                logs=ctx.logs,
            )
    except Exception as llm_error:
        # LLM transport/auth/timeout failure. With facts present, never leave
        # the episode without a script: fall back to the deterministic generator
        # unless the caller explicitly required an LLM draft.
        if require_llm:
            raise RuntimeError(
                f"成稿 AI 调用失败（{type(llm_error).__name__}: {llm_error}），"
                "未使用本地模板覆盖初稿"
            ) from llm_error
        ctx.log(
            f"成稿 AI 调用失败（{type(llm_error).__name__}: {llm_error}），"
            "使用 deterministic 降级输出"
        )
        return generate_deterministic_script(
            facts, preset, episode_id="", title=topic.get("title", "PodFlow 晨报")
        )

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
        repair_count = 0
        repairable_issues = [
            issue for issue in [*quality["hard"], *quality["soft"]] if issue.get("segment_id")
        ]
        if repairable_issues:
            repair_count = 1
            repair_ids = {issue["segment_id"] for issue in repairable_issues}
            try:
                ctx.log(f"成稿定向修复调用: segments={sorted(repair_ids)}")
                with create_llm_runtime(config, debug_mode=ctx.debug_mode) as repair_client:
                    repair_payload = repair_client.run_task(
                        "script.repair",
                        build_script_repair_prompt(normalized, facts, repairable_issues),
                        timeout=config.timeout,
                        logs=ctx.logs,
                    )
                repaired = apply_segment_repairs(
                    normalized,
                    repair_payload,
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
                facts, preset, episode_id="", title=topic.get("title", "PodFlow 晨报")
            )
        if quality["soft"]:
            ctx.log(
                "成稿听感提示: "
                + "；".join(f"{issue['code']}:{issue['detail']}" for issue in quality["soft"])
            )
        editorial_quality = _assess_editorial_quality(normalized, facts, config, ctx, repair_count)
        semantic_issues = editorial_quality.pop("segment_issues", [])
        if editorial_quality["status"] != "passed" and repair_count == 0 and semantic_issues:
            repair_ids = {issue["segment_id"] for issue in semantic_issues if issue.get("segment_id")}
            if repair_ids:
                repair_count = 1
                ctx.log(f"编辑质量定向修复调用: segments={sorted(repair_ids)}")
                with create_llm_runtime(config, debug_mode=ctx.debug_mode) as repair_client:
                    repair_payload = repair_client.run_task(
                        "script.repair",
                        build_script_repair_prompt(normalized, facts, semantic_issues),
                        timeout=config.timeout,
                        logs=ctx.logs,
                    )
                repaired = apply_segment_repairs(
                    normalized,
                    repair_payload,
                    repair_ids,
                )
                normalized = _normalize_script(repaired, topic, facts, config, editorial_plan)
                if normalized.get("generated_by") == "deterministic_mock":
                    raise ValueError("编辑质量修复改变了段落结构或事实绑定")
                repaired_quality = assess_script_quality(normalized, facts, editorial_plan)
                if repaired_quality["hard"]:
                    raise ValueError("编辑质量修复未通过完整事实质检")
                editorial_quality = _assess_editorial_quality(normalized, facts, config, ctx, repair_count)
                editorial_quality.pop("segment_issues", None)
        if editorial_quality["status"] != "passed":
            details = "；".join(editorial_quality.get("hard_errors", [])) or "评分低于 4"
            if require_llm:
                raise RuntimeError(f"成稿 AI 未通过 {EDITORIAL_QUALITY_VERSION}：{details}")
            ctx.log(f"成稿编辑质量评测失败，使用 deterministic 降级输出: {details}")
            return generate_deterministic_script(
                facts, preset, episode_id="", title=topic.get("title", "PodFlow 晨报")
            )
        editorial_quality["repair_count"] = repair_count
        normalized["_editorial_quality"] = editorial_quality
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
        title=topic.get("title", "PodFlow 晨报"),
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


def _assess_editorial_quality(
    script: dict[str, Any],
    facts: list[dict[str, Any]],
    config: ScriptConfig,
    ctx: NodeContext,
    repair_count: int,
) -> dict[str, Any]:
    target = resolve_llm_target(config)
    prompt = (
        "按 editorial_quality_v1 评估中文播客稿。只使用输入事实卡，不补充外部事实。"
        "对 relevance、information_gain、synthesis、coherence、spoken_naturalness、non_repetition "
        "分别给 1-5 整数分。列出 hard_errors；需要定向修复时列出 segment_issues，"
        "每项含 segment_id、code、detail。只返回 JSON："
        '{"scores":{},"hard_errors":[],"segment_issues":[]}。\n\n'
        f"<事实卡_JSON>{json.dumps(facts, ensure_ascii=False)}</事实卡_JSON>\n"
        f"<稿件_JSON>{json.dumps(script, ensure_ascii=False)}</稿件_JSON>"
    )
    with create_llm_runtime(config, debug_mode=ctx.debug_mode) as client:
        payload = client.run_task(
            "script.quality",
            prompt,
            timeout=config.timeout,
            logs=ctx.logs,
        )
    scores_raw = payload.get("scores")
    if not isinstance(scores_raw, dict) or set(scores_raw) != set(EDITORIAL_DIMENSIONS):
        raise ValueError("编辑质量评测缺少完整评分维度")
    scores: dict[str, int] = {}
    for dimension in EDITORIAL_DIMENSIONS:
        value = scores_raw.get(dimension)
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 5:
            raise ValueError(f"编辑质量评测分数无效: {dimension}")
        scores[dimension] = value
    hard_errors_raw = payload.get("hard_errors", [])
    if not isinstance(hard_errors_raw, list) or any(not isinstance(value, str) for value in hard_errors_raw):
        raise ValueError("编辑质量评测 hard_errors 无效")
    segment_issues_raw = payload.get("segment_issues", [])
    if not isinstance(segment_issues_raw, list):
        raise ValueError("编辑质量评测 segment_issues 无效")
    known_segments = {str(segment.get("id") or "") for segment in script.get("segments", []) if isinstance(segment, dict)}
    segment_issues: list[dict[str, str]] = []
    for issue in segment_issues_raw:
        if not isinstance(issue, dict):
            raise ValueError("编辑质量评测包含无效问题")
        segment_id = str(issue.get("segment_id") or "")
        code = str(issue.get("code") or "")
        detail = str(issue.get("detail") or "")
        if segment_id not in known_segments or not code or not detail:
            raise ValueError("编辑质量评测引用未知段落或缺少问题字段")
        segment_issues.append({"segment_id": segment_id, "code": code, "detail": detail})
    hard_errors = [value.strip() for value in hard_errors_raw if value.strip()]
    passed = all(value >= 4 for value in scores.values()) and not hard_errors
    return {
        "version": EDITORIAL_QUALITY_VERSION,
        "status": "passed" if passed else "failed",
        "model": target.model,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "scores": scores,
        "hard_errors": hard_errors,
        "repair_count": repair_count,
        "segment_issues": segment_issues,
    }


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
                    "target_seconds": [seconds_for_chars(180), seconds_for_chars(260)],
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
    editorial_quality: dict[str, Any],
) -> dict[str, Any]:
    structure = _resolve_script_structure(facts, _preset_from_config(config))
    return {
        "generated_at": generated_at,
        "preset_id": config.preset_id,
        "source_fact_count": len(facts),
        "used_fact_ids": [str(fact.get("id")) for fact in facts if fact.get("id")],
        "structure": structure,
        "actual_news_item_count": script.get("actual_news_item_count", structure["actual_news_item_count"]),
        "editorial_quality": {
            **editorial_quality,
            "generated_by": script.get("generated_by", ""),
        },
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
        "release_readiness",
        "audio_approval",
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
            "release_readiness": {},
            "audio_approval": {},
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
