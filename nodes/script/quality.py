"""Deterministic provenance and listening-quality checks for generated scripts."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlparse


NUMBER_TOKEN = re.compile(
    r"(?<![A-Za-z0-9_.])(?:\d{4}年(?:\d{1,2}月(?:\d{1,2}日)?)?|\d+(?:\.\d+)?%|[¥￥$]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:元|美元|万元|亿元))(?![A-Za-z0-9_])"
)
REPETITIVE_OPENINGS = ("我们再看", "接下来关注", "值得关注的是", "这意味着")
LISTENER_COMMAND_PATTERN = re.compile(
    r"(?:(?:您|你|大家|听众|家庭|家长|考生|用户|消费者|居民|旅客).{0,12}"
    r"(?:应当|应该|应(?=[\u4e00-\u9fff])|需要|建议|必须|请)"
    r"|(?:应当|应该|建议|必须|请)(?:先|立即|及时)?(?=[\u4e00-\u9fff]))"
)
ATTRIBUTED_OFFICIAL_ACTION = re.compile(
    r"(?:官方|有关部门|主管部门|公告|通知|指南).{0,24}(?:要求|提醒|建议|规定)"
)
INTERNAL_INSTRUCTION_PATTERN = re.compile(
    r"(?:发布前|播出前|编辑时|后期时|核验提示|发布提示|编辑提示|"
    r"请(?:核对|确认|补充|替换|删除|修改)|"
    r"(?:导出|生成)(?:\s*RSS|发布包)|工作流(?:节点|状态)|"
    r"(?:事实|数字|来源).{0,8}(?:待核验|需核验|需要核验))",
    re.IGNORECASE,
)


def assess_script_quality(
    script: dict[str, Any],
    facts: list[dict[str, Any]],
    editorial_plan: dict[str, Any],
) -> dict[str, list[dict[str, str]]]:
    hard: list[dict[str, str]] = []
    soft: list[dict[str, str]] = []
    facts_by_id = {str(fact.get("id")): fact for fact in facts if fact.get("id")}
    segments = script.get("segments") if isinstance(script, dict) else []
    segments = segments if isinstance(segments, list) else []

    opening = next((item for item in segments if item.get("type") == "opening"), None)
    news = [item for item in segments if item.get("type") in {"quick_news", "deep_dive"}]
    closing = next((item for item in segments if item.get("type") == "closing"), None)
    if not opening or not closing:
        hard.append(_issue("SCRIPT_STRUCTURE", "稿件必须包含开场和收尾"))
        return {"hard": hard, "soft": soft}

    opening_text = str(opening.get("text") or "")
    opening_source_ids = [str(value) for value in opening.get("source_fact_ids", [])]
    planned_opening_ids = [str(value) for value in editorial_plan.get("opening", {}).get("fact_ids", [])]
    if set(opening_source_ids) != set(planned_opening_ids):
        hard.append(_issue("OPENING_FACT_BINDING", "开场事实绑定与编排不一致", opening))
    opening_fact_text = " ".join(
        " ".join([
            str(facts_by_id[fact_id].get("title") or ""),
            str(facts_by_id[fact_id].get("summary") or ""),
            *[str(claim.get("text") or "") for claim in facts_by_id[fact_id].get("claims", []) if isinstance(claim, dict)],
        ])
        for fact_id in planned_opening_ids
        if fact_id in facts_by_id
    )
    _assess_text_integrity(opening, opening_text, opening_fact_text, hard, soft)
    unsupported_opening_numbers = sorted(_number_tokens(opening_text) - _number_tokens(opening_fact_text))
    if unsupported_opening_numbers:
        hard.append(
            _issue(
                "UNSUPPORTED_NUMBER",
                f"开场绑定事实卡中找不到数字：{', '.join(unsupported_opening_numbers)}",
                opening,
            )
        )
    if len(opening_text) > 260:
        soft.append(_issue("OPENING_TOO_LONG", f"开场 {len(opening_text)} 字，目标不超过 260 字", opening))
    elif len(opening_text) < 180:
        soft.append(_issue("OPENING_TOO_SHORT", f"开场 {len(opening_text)} 字，目标不少于 180 字", opening))
    closing_text = str(closing.get("text") or "")
    if len(closing_text) > 100:
        soft.append(_issue("CLOSING_TOO_LONG", "收尾超过 100 字，可能重复本期内容", closing))
    elif len(closing_text) < 60:
        soft.append(_issue("CLOSING_TOO_SHORT", "收尾少于 60 字，缺少稳定的节目落点", closing))
    _assess_text_integrity(closing, closing_text, "", hard, soft)

    planned_items = editorial_plan.get("items", [])
    if len(news) != len(planned_items):
        hard.append(_issue("NEWS_COUNT", "新闻段数量与编排不一致"))
        return {"hard": hard, "soft": soft}

    lengths: list[int] = []
    opening_prefixes: list[str] = []
    seen_sentences: dict[str, str] = {}
    for segment, planned in zip(news, planned_items):
        source_ids = [str(value) for value in segment.get("source_fact_ids", [])]
        if source_ids != [planned["fact_id"]]:
            hard.append(_issue("FACT_BINDING", "新闻段事实绑定与编排不一致", segment))
            continue
        fact = facts_by_id.get(str(planned["fact_id"]))
        if fact is None:
            hard.append(_issue("MISSING_FACT", "新闻段绑定的事实卡不存在", segment))
            continue
        source_hosts = _source_hosts(fact)
        if segment.get("type") == "deep_dive" and len(source_hosts) < 3:
            hard.append(
                _issue(
                    "DEEP_DIVE_SOURCES",
                    f"重点解读至少需要三个独立来源，当前只有 {len(source_hosts)} 个",
                    segment,
                )
            )
        elif segment.get("type") == "quick_news" and not source_hosts:
            hard.append(_issue("QUICK_NEWS_SOURCE", "每条快讯至少需要一个可追溯来源", segment))
        text = str(segment.get("text") or "")
        lengths.append(len(text))
        fact_text = " ".join([
            str(fact.get("title") or ""),
            str(fact.get("summary") or ""),
            *[str(claim.get("text") or "") for claim in fact.get("claims", []) if isinstance(claim, dict)],
        ])
        _assess_text_integrity(
            segment,
            f"{segment.get('title') or ''} {text}",
            fact_text,
            hard,
            soft,
        )
        unsupported = sorted(_number_tokens(text) - _number_tokens(fact_text))
        if unsupported:
            hard.append(
                _issue("UNSUPPORTED_NUMBER", f"绑定事实卡中找不到数字：{', '.join(unsupported)}", segment)
            )
        prefix = next((value for value in REPETITIVE_OPENINGS if text.startswith(value)), "")
        opening_prefixes.append(prefix)
        listener_question = str(planned.get("listener_question") or "")
        if listener_question and not (_question_terms(listener_question) & _question_terms(text)):
            soft.append(
                _issue(
                    "LISTENER_QUESTION_UNCLEAR",
                    f"正文未明显覆盖编排问题：{listener_question}",
                    segment,
                )
            )
        if opening_text and _overlap_ratio(opening_text, text) >= 0.55:
            soft.append(_issue("OPENING_BODY_REPETITION", "开场与正文存在明显重复", segment))
        for sentence in _spoken_sentences(text):
            previous_segment_id = seen_sentences.get(sentence)
            if previous_segment_id and previous_segment_id != str(segment.get("id") or ""):
                hard.append(_issue("REPEATED_TEMPLATE_SENTENCE", "不同新闻段重复使用相同模板句", segment))
                break
            seen_sentences[sentence] = str(segment.get("id") or "")

    opening_question = str(editorial_plan.get("opening", {}).get("listener_question") or "")
    if opening_question:
        promised_terms = _question_terms(opening_question)
        if promised_terms and not any(
            promised_terms & _question_terms(str(segment.get("text") or ""))
            for segment in news
        ):
            hard.append(_issue("OPENING_PROMISE_UNFULFILLED", f"正文没有兑现开场问题：{opening_question}", opening))

    for index in range(len(opening_prefixes) - 1):
        if opening_prefixes[index] and opening_prefixes[index] == opening_prefixes[index + 1]:
            soft.append(_issue("REPEATED_TRANSITION", f"连续使用“{opening_prefixes[index]}”开头", news[index + 1]))
    for index in range(len(lengths) - 2):
        window = lengths[index : index + 3]
        if min(window) >= 100 and max(window) - min(window) <= max(window) * 0.1:
            soft.append(_issue("UNIFORM_PACING", "连续三段篇幅过于接近", news[index + 1]))

    planned_total = (
        int(editorial_plan.get("opening", {}).get("target_chars") or 0)
        + sum(int(item.get("target_chars") or 0) for item in planned_items)
        + int(editorial_plan.get("closing", {}).get("target_chars") or 0)
    )
    actual_total = sum(len(str(segment.get("text") or "")) for segment in segments)
    if planned_total and actual_total < planned_total * 0.8:
        soft.append(
            _issue(
                "EPISODE_UNDER_PLAN",
                f"实际正文 {actual_total} 字，低于编排目标 {planned_total} 字；素材不足时可保留短稿",
            )
        )
    elif planned_total and actual_total > planned_total * 1.2:
        soft.append(
            _issue(
                "EPISODE_OVER_PLAN",
                f"实际正文 {actual_total} 字，超过编排目标 {planned_total} 字",
            )
        )

    return {"hard": hard, "soft": soft}


def build_script_repair_prompt(
    script: dict[str, Any],
    facts: list[dict[str, Any]],
    issues: list[dict[str, str]],
) -> str:
    repair_ids = {issue["segment_id"] for issue in issues if issue.get("segment_id")}
    segments = [
        segment
        for segment in script.get("segments", [])
        if str(segment.get("id") or "") in repair_ids
    ]
    relevant_fact_ids = {
        str(fact_id)
        for segment in segments
        for fact_id in segment.get("source_fact_ids", [])
    }
    relevant_facts = [
        fact for fact in facts if str(fact.get("id") or "") in relevant_fact_ids
    ]
    return f"""只修复下列口播段落，不改段落 ID、类型、顺序或事实绑定。
事实卡是唯一事实来源；删除无来源数字，不补造背景、因果或评价。
删除“您可能更关心”、查阅或核对资料清单、对听众下指令的编辑说明腔。遇到 � 等乱码时依据事实卡改回可确认的文字；无法确认就删除乱码所在表述。

<问题_JSON>
{json.dumps(issues, ensure_ascii=False, indent=2)}
</问题_JSON>
<待修段落_JSON>
{json.dumps(segments, ensure_ascii=False, indent=2)}
</待修段落_JSON>
<绑定事实卡_JSON>
{json.dumps(relevant_facts, ensure_ascii=False, indent=2)}
</绑定事实卡_JSON>

只返回：
{{"repairs":[{{"segment_id":"seg_001","text":"修复后的完整口播文本"}}]}}"""


def apply_segment_repairs(
    script: dict[str, Any],
    raw_repairs: dict[str, Any],
    allowed_segment_ids: set[str],
) -> dict[str, Any]:
    repairs = raw_repairs.get("repairs") if isinstance(raw_repairs, dict) else None
    if not isinstance(repairs, list) or not repairs:
        raise ValueError("成稿修复格式错误：repairs 必须是非空数组")
    replacement: dict[str, str] = {}
    for repair in repairs:
        if not isinstance(repair, dict):
            raise ValueError("成稿修复格式错误：repair 必须是对象")
        segment_id = str(repair.get("segment_id") or "")
        text = str(repair.get("text") or "").strip()
        if segment_id not in allowed_segment_ids or not text or segment_id in replacement:
            raise ValueError("成稿修复格式错误：只能为指定段落提供一次非空修复")
        replacement[segment_id] = text
    if set(replacement) != allowed_segment_ids:
        raise ValueError("成稿修复格式错误：必须返回全部指定段落")

    return {
        **script,
        "segments": [
            {**segment, "text": replacement.get(str(segment.get("id") or ""), segment.get("text", ""))}
            for segment in script.get("segments", [])
        ],
    }


def _issue(code: str, detail: str, segment: dict[str, Any] | None = None) -> dict[str, str]:
    return {
        "code": code,
        "detail": detail,
        "segment_id": str((segment or {}).get("id") or ""),
    }


def _overlap_ratio(left: str, right: str) -> float:
    def chunks(value: str) -> set[str]:
        cleaned = re.sub(r"\s+", "", value)
        return {cleaned[index : index + 8] for index in range(max(0, len(cleaned) - 7))}

    left_chunks = chunks(left)
    right_chunks = chunks(right)
    if not left_chunks or not right_chunks:
        return 0.0
    return len(left_chunks & right_chunks) / min(len(left_chunks), len(right_chunks))


def _number_tokens(value: str) -> set[str]:
    tokens: set[str] = set()
    for raw_token in NUMBER_TOKEN.findall(value):
        token = re.sub(r"\s+", "", raw_token)
        money = re.fullmatch(r"(\d+(?:\.\d+)?)(元|万元|亿元)", token)
        if money:
            amount = float(money.group(1))
            multiplier = {"元": 1, "万元": 10_000, "亿元": 100_000_000}[money.group(2)]
            tokens.add(f"{amount * multiplier:g}元")
        else:
            tokens.add(token)
    return tokens


def _assess_text_integrity(
    segment: dict[str, Any],
    text: str,
    supported_text: str,
    hard: list[dict[str, str]],
    soft: list[dict[str, str]],
) -> None:
    if "\ufffd" in text:
        hard.append(_issue("INVALID_TEXT_ENCODING", "口播包含无法解码的替换字符“�”", segment))
    if INTERNAL_INSTRUCTION_PATTERN.search(text):
        hard.append(
            _issue(
                "INTERNAL_INSTRUCTION_LEAK",
                "口播包含编辑、核验或发布阶段的内部指令",
                segment,
            )
        )
    command_sentences = [
        sentence
        for sentence in re.split(r"(?<=[。！？!?])", text)
        if LISTENER_COMMAND_PATTERN.search(sentence)
    ]
    unsupported_commands = [
        sentence
        for sentence in command_sentences
        if not ATTRIBUTED_OFFICIAL_ACTION.search(sentence)
        or _overlap_ratio(sentence, supported_text) < 0.2
    ]
    if "您可能更关心" in text or unsupported_commands:
        soft.append(
            _issue(
                "EDITORIAL_INSTRUCTION",
                "口播包含面向听众的资料核验清单或编辑说明，应改写为事件本身的影响",
                segment,
            )
        )


def _source_hosts(fact: dict[str, Any]) -> set[str]:
    urls = [
        str(item.get("url") or "")
        for item in fact.get("evidence", [])
        if isinstance(item, dict)
    ]
    brief = fact.get("deep_dive_brief")
    if isinstance(brief, dict):
        urls.extend(str(value or "") for value in brief.get("sourceUrls", []))
    hosts: set[str] = set()
    for value in urls:
        parsed = urlparse(value.strip())
        if parsed.scheme in {"http", "https"} and parsed.hostname:
            hosts.add(parsed.hostname.lower().removeprefix("www."))
    return hosts


def _spoken_sentences(value: str) -> set[str]:
    return {
        re.sub(r"\s+", "", sentence)
        for sentence in re.split(r"[。！？!?]", value)
        if len(re.sub(r"\s+", "", sentence)) >= 12
    }


def _question_terms(value: str) -> set[str]:
    cleaned = re.sub(r"[？?，。！!、；：:“”‘’（）()\s]", "", value)
    latin = {token.lower() for token in re.findall(r"[A-Za-z0-9]{3,}", cleaned)}
    chinese = "".join(re.findall(r"[\u4e00-\u9fff]", cleaned))
    stop = {"什么", "怎么", "怎样", "为何", "为什么", "是否", "哪些", "如何", "还有"}
    pairs = {
        chinese[index : index + 2]
        for index in range(max(0, len(chinese) - 1))
        if chinese[index : index + 2] not in stop
    }
    return latin | pairs
