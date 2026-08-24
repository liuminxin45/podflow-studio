from datetime import UTC, datetime
import json
from typing import Any

from nodes.facts.config import FactsConfig
from protocol.morning_news import build_fact_cards, build_run_report, select_news_topics
from protocol.llm_runtime import create_llm_runtime, has_llm_runtime_config, resolve_llm_target
from protocol.node_runner import NodeContext


def _material_key(item: dict[str, Any]) -> tuple[str, str]:
    return (
        str(item.get("url") or ""),
        str(item.get("title") or ""),
    )


def _fact_for_material(
    facts: list[dict[str, Any]], material: dict[str, Any]
) -> dict[str, Any] | None:
    material_url, material_title = _material_key(material)
    return next(
        (
            fact
            for fact in facts
            if (
                any(
                    str(item.get("url") or "") == material_url
                    for item in fact.get("evidence", [])
                    if isinstance(item, dict)
                )
                if material_url
                else bool(material_title and str(fact.get("title") or "") == material_title)
            )
        ),
        None,
    )


def _enrich_organized_facts(
    facts: list[dict[str, Any]], materials: list[dict[str, Any]]
) -> None:
    for material in materials:
        if not isinstance(material, dict) or material.get("_status") != "ready":
            continue
        fact = _fact_for_material(facts, material)
        if not isinstance(fact, dict):
            continue
        evidence = " ".join(
            str(material.get("content") or material.get("summary") or "").split()
        )
        if evidence:
            fact["summary"] = evidence[: 6000 if material.get("_isDeepDive") else 2400]

        references = material.get("_references")
        references = references if isinstance(references, list) else []
        sources = [material, *[item for item in references if isinstance(item, dict)]]
        source_entries: list[tuple[str, str]] = []
        for item in sources:
            url = str(item.get("url") or "")
            if not url or any(existing_url == url for existing_url, _ in source_entries):
                continue
            title = str(
                item.get("source_title")
                or item.get("source_name")
                or item.get("source")
                or item.get("title")
                or url
            )
            source_entries.append((url, title))
        source_urls = [url for url, _ in source_entries]
        existing_urls = {
            str(item.get("url") or "")
            for item in fact.get("evidence", [])
            if isinstance(item, dict)
        }
        for source_index, (url, title) in enumerate(source_entries, start=1):
            if url in existing_urls:
                continue
            fact.setdefault("evidence", []).append({
                "id": f"evidence_{str(fact.get('id') or '').removeprefix('fact_')}_{source_index:03d}",
                "url": url,
                "title": title,
                "published_at": str(material.get("published") or material.get("published_at") or ""),
                "source_role": "independent",
                "excerpt": evidence[:600],
            })
        if material.get("_isDeepDive"):
            brief = material.get("_deepDiveBrief")
            if not isinstance(brief, dict):
                raise ValueError(
                    "The selected deep-dive material is missing _deepDiveBrief; "
                    "run evidence-backed deep research before generating facts"
                )
            brief_urls = brief.get("sourceUrls")
            if not isinstance(brief_urls, list) or not brief_urls:
                raise ValueError("The selected deep-dive brief has no sourceUrls")
            unknown_urls = [
                str(url)
                for url in brief_urls
                if str(url) not in source_urls
            ]
            if unknown_urls:
                raise ValueError(
                    "The selected deep-dive brief references sources outside the organized evidence packet"
                )
            fact["deep_dive_brief"] = brief
        # A synthesized unit combines several sources. Without claim-level
        # provenance it must not be presented as a single-link high-confidence
        # statement, even when the primary item has a URL and timestamp.
        fact["confidence"] = "medium"


def _verify_claims(facts: list[dict[str, Any]], config: FactsConfig, ctx: Any) -> None:
    target = resolve_llm_target(config)
    if not has_llm_runtime_config(config):
        if config.require_semantic_verification:
            raise ValueError(f"Semantic fact verifier is required ({target.masked_summary()})")
        ctx.log("事实模型核验未启用：产物仅可作为 demo-only 诊断数据")
        return
    payload = [{
        "fact_id": fact.get("id"),
        "title": fact.get("title"),
        "summary": fact.get("summary"),
        "evidence": fact.get("evidence", []),
    } for fact in facts]
    prompt = f"""你是事实核验器。只能使用输入 evidence，禁止添加 URL 或外部知识。
为每个 fact 提取 1-5 条最小事实主张，并判断 supported、conflicted 或 insufficient。
每条返回 fact_id、id、text、evidence_ids、status、confidence。所有 evidence_ids 必须来自对应 fact。
只返回 JSON：{{"facts":[{{"fact_id":"fact_001","claims":[...]}}]}}。

<事实与证据>
{json.dumps(payload, ensure_ascii=False)}
</事实与证据>"""
    with create_llm_runtime(config, debug_mode=ctx.debug_mode) as client:
        parsed = client.run_task(
            "facts.build",
            prompt,
            timeout=config.timeout,
            logs=ctx.logs,
        )
    returned = parsed.get("facts") if isinstance(parsed, dict) else None
    if not isinstance(returned, list):
        raise ValueError("Fact verifier returned an invalid facts array")
    by_id = {str(item.get("fact_id") or ""): item for item in returned if isinstance(item, dict)}
    verified_at = datetime.now(UTC).isoformat()
    for fact in facts:
        fact_id = str(fact.get("id") or "")
        item = by_id.get(fact_id)
        claims = item.get("claims") if isinstance(item, dict) else None
        evidence_ids = {str(value.get("id") or "") for value in fact.get("evidence", []) if isinstance(value, dict)}
        if not isinstance(claims, list) or not claims:
            raise ValueError(f"Fact verifier omitted claims for {fact_id}")
        normalized = []
        for index, claim in enumerate(claims, start=1):
            if not isinstance(claim, dict):
                raise ValueError(f"Fact verifier returned an invalid claim for {fact_id}")
            referenced = [str(value) for value in claim.get("evidence_ids", [])]
            status = str(claim.get("status") or "")
            confidence = str(claim.get("confidence") or "")
            if not referenced or any(value not in evidence_ids for value in referenced):
                raise ValueError(f"Fact verifier referenced unknown evidence for {fact_id}")
            if status not in {"supported", "conflicted", "insufficient"} or confidence not in {"high", "medium", "low"}:
                raise ValueError(f"Fact verifier returned an invalid decision for {fact_id}")
            normalized.append({
                "id": f"claim_{fact_id.removeprefix('fact_')}_{index:03d}",
                "text": str(claim.get("text") or "").strip(),
                "evidence_ids": referenced,
                "status": status,
                "confidence": confidence,
                "verifier_model": target.model,
                "verified_at": verified_at,
            })
        if any(not claim["text"] for claim in normalized):
            raise ValueError(f"Fact verifier returned an empty claim for {fact_id}")
        fact["claims"] = normalized
        fact["confidence"] = "low" if any(item["status"] != "supported" for item in normalized) else min(
            (item["confidence"] for item in normalized), key=("low", "medium", "high").index
        )


def run(state: dict[str, Any], config: FactsConfig = None) -> dict[str, Any]:
    config = config or FactsConfig()
    ctx = NodeContext("FactsNode", state)
    materials = state.get("selected_materials", [])

    ctx.log_start(
        f"输入: materials={len(materials)}, max_facts={config.max_facts}, selected_topic_count={config.selected_topic_count}"
    )

    try:
        if not materials:
            ctx.add_error("facts", "No selected_materials available for fact cards")
            ctx.log_end("输出: facts=0")
            return ctx.finalize(state)
        if not all(
            isinstance(item, dict) and item.get("_status") == "ready"
            for item in materials
        ):
            ctx.add_error("facts", "Every selected_material must have _status=ready")
            ctx.log_end("输出: facts=0")
            return ctx.finalize(state)

        deep_material = next(
            (
                item
                for item in materials
                if isinstance(item, dict) and bool(item.get("_isDeepDive"))
            ),
            None,
        )
        fact_materials = list(materials)
        if isinstance(deep_material, dict) and deep_material in fact_materials:
            deep_index = fact_materials.index(deep_material)
            if deep_index >= config.max_facts:
                fact_materials = [
                    *fact_materials[: max(0, config.max_facts - 1)],
                    deep_material,
                ]
        facts = build_fact_cards(fact_materials, limit=config.max_facts)
        _enrich_organized_facts(facts, fact_materials)
        _verify_claims(facts, config, ctx)
        deep_fact = None
        if isinstance(deep_material, dict):
            deep_url = str(deep_material.get("url") or "")
            deep_title = str(deep_material.get("title") or "")
            deep_fact = next(
                (
                    fact
                    for fact in facts
                    if (
                        any(str(item.get("url") or "") == deep_url for item in fact.get("evidence", []))
                        if deep_url
                        else bool(
                            deep_title
                            and str(fact.get("title") or "") == deep_title
                        )
                    )
                ),
                None,
            )
        if isinstance(deep_fact, dict):
            deep_fact["is_deep_dive"] = True
            deep_body = " ".join(
                str(
                    deep_material.get("content")
                    or deep_material.get("summary")
                    or ""
                ).split()
            )
            if deep_body:
                # The common fact-card builder intentionally stays concise for
                # headlines. A user-selected deep dive keeps its organized
                # evidence packet in the same existing string field so the
                # script writer can support a substantially richer segment.
                deep_fact["summary"] = deep_body[:6000]
        state["facts"] = facts
        selected_topics = select_news_topics(facts, config.selected_topic_count)
        if isinstance(deep_fact, dict):
            deep_fact_id = str(deep_fact.get("id") or "")
            deep_topic = {
                "title": deep_fact.get("title", ""),
                "fact_id": deep_fact_id,
                "is_deep_dive": True,
            }
            without_deep = [
                topic
                for topic in selected_topics
                if str(topic.get("fact_id") or "") != deep_fact_id
            ]
            selected_topics = [
                *without_deep[: max(0, len(selected_topics) - 1)],
                deep_topic,
            ]
            selected_topics = [
                {**topic, "id": f"topic_{index + 1:03d}"}
                for index, topic in enumerate(selected_topics)
            ]
        state["selected_topics"] = selected_topics
        build_run_report(state)
        ctx.log(f"事实卡片生成完成: facts={len(facts)}, selected_topics={len(state['selected_topics'])}")
    except Exception as exc:
        ctx.add_error("facts", str(exc), detail=str(exc))

    ctx.log_end(
        f"输出: facts={len(state.get('facts', []))}, selected_topics={len(state.get('selected_topics', []))}"
    )
    return ctx.finalize(state)
