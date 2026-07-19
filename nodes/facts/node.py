from typing import Any

from nodes.facts.config import FactsConfig
from protocol.morning_news import build_fact_cards, build_run_report, select_news_topics
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
                str(fact.get("source_url") or "") == material_url
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
        source_urls = list(
            dict.fromkeys(
                str(item.get("url") or "")
                for item in sources
                if item.get("url")
            )
        )
        source_titles = list(
            dict.fromkeys(
                str(
                    item.get("source_title")
                    or item.get("source_name")
                    or item.get("source")
                    or item.get("title")
                    or ""
                )
                for item in sources
                if (
                    item.get("source_title")
                    or item.get("source_name")
                    or item.get("source")
                    or item.get("title")
                )
            )
        )
        fact["source_urls"] = source_urls
        fact["source_titles"] = source_titles
        # A synthesized unit combines several sources. Without claim-level
        # provenance it must not be presented as a single-link high-confidence
        # statement, even when the primary item has a URL and timestamp.
        fact["confidence"] = "medium"


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
        deep_fact = None
        if isinstance(deep_material, dict):
            deep_url = str(deep_material.get("url") or "")
            deep_title = str(deep_material.get("title") or "")
            deep_fact = next(
                (
                    fact
                    for fact in facts
                    if (
                        str(fact.get("source_url") or "") == deep_url
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
