import os
import json
import re
from typing import Any
from nodes.script.config import ScriptConfig
from protocol.llm_client import LLMClient
from protocol.node_runner import NodeContext


def _build_materials_text(materials: list) -> str:
    return "\n\n".join(
        [f"- {m.get('title', '')}: {m.get('content', '')[:500]}" for m in materials[:5]]
    )


def _build_story_prompt(topic: dict[str, Any], config: ScriptConfig, materials_text: str) -> str:
    if config.num_hosts == 1:
        host_desc = "solo narration (1 host, all lines by Host A)"
        structure_desc = "opening + story content + reflection + closing (all by Host A)"
        sections_example = (
            '{"id": "opening", "type": "opening", "label": "开场", "speaker": "Host A", "text": "..."},\n'
            '        {"id": "mainline_1", "type": "mainline", "label": "主线一", "speaker": "Host A", "text": "..."},\n'
            '        {"id": "reflection", "type": "reflection", "label": "思考感悟", "speaker": "Host A", "text": "..."},\n'
            '        {"id": "closing", "type": "closing", "label": "结尾", "speaker": "Host A", "text": "..."}'
        )
    else:
        host_desc = f"multi-host dialogue ({config.num_hosts} hosts: Host A, Host B)"
        structure_desc = "opening + multiple mainline segments + cross-host discussion + closing"
        sections_example = (
            '{"id": "opening", "type": "opening", "label": "开场", "speaker": "Host A", "text": "..."},\n'
            '        {"id": "mainline_1", "type": "mainline", "label": "主线一", "speaker": "Host A", "text": "..."},\n'
            '        {"id": "discussion", "type": "discussion", "label": "延伸讨论", "speaker": "Host B", "text": "..."},\n'
            '        {"id": "closing", "type": "closing", "label": "结尾", "speaker": "Host A", "text": "..."}'
        )
    target_chars = config.target_duration_minutes * config.words_per_minute
    return f"""Generate a {config.target_duration_minutes}-minute Chinese podcast script.

Topic: {topic.get("title", "")}
Description: {topic.get("description", "")}

Materials:
{materials_text}

Requirements:
1. Format: {host_desc}
2. Style: {config.dialogue_style}
3. Structure: {structure_desc}
4. Mark each speaker
5. ALL content MUST be in Chinese (普通话)
6. Total script length: ~{target_chars}字 (each section should have substantial content, NOT placeholder text)

Return JSON (sections only, no dialogue field needed):
{{
    "title": "节目标题",
    "description": "节目简介",
    "content_type": "story",
    "sections": [
        {sections_example}
    ]
}}
"""


def _build_news_brief_prompt(
    topic: dict[str, Any], config: ScriptConfig, materials_text: str
) -> str:
    if config.num_hosts == 1:
        host_desc = "solo narration (1 host, all lines by Host A)"
    else:
        host_desc = f"multi-host dialogue ({config.num_hosts} hosts: Host A, Host B)"
    target_chars = config.target_duration_minutes * config.words_per_minute
    return f"""Generate a {config.target_duration_minutes}-minute Chinese news brief podcast script.

Topic: {topic.get("title", "")}
Description: {topic.get("description", "")}

Materials:
{materials_text}

Requirements:
1. Format: {host_desc}
2. Style: {config.dialogue_style}
3. Structure: opening + {config.news_item_count} news items + closing
4. Each news item: event summary + key fact + impact
5. Mark each speaker
6. ALL content MUST be in Chinese (普通话)
7. Total script length: ~{target_chars}字 (each section should have substantial content, NOT placeholder text)

Return JSON (sections only, no dialogue field needed):
{{
    "title": "节目标题",
    "description": "节目简介",
    "content_type": "news_brief",
    "sections": [
        {{"id": "opening", "type": "opening", "label": "开场导语", "speaker": "Host A", "text": "将开场内容写在这里"}},
        {{"id": "news_1", "type": "news_item", "label": "新闻一", "speaker": "Host A", "text": "将第一条新闻内容写在这里"}},
        {{"id": "closing", "type": "closing", "label": "结尾总结", "speaker": "Host A", "text": "将结尾内容写在这里"}}
    ]
}}
"""


PROMPT_BUILDERS = {
    "story": _build_story_prompt,
    "news_brief": _build_news_brief_prompt,
}

SYSTEM_PROMPTS = {
    "story": "You are a professional podcast script writer.",
    "news_brief": "You are a professional news podcast editor skilled in concise daily briefings.",
}


def _normalize_script(
    content_type: str, raw_script: dict[str, Any], topic: dict[str, Any]
) -> dict[str, Any]:
    if not isinstance(raw_script, dict):
        raw_script = {}

    normalized_content_type = raw_script.get("content_type")
    if normalized_content_type not in PROMPT_BUILDERS:
        normalized_content_type = content_type

    normalized = {
        "title": raw_script.get("title") or topic.get("title", "Untitled"),
        "description": raw_script.get("description", ""),
        "content_type": normalized_content_type,
        "sections": raw_script.get("sections")
        if isinstance(raw_script.get("sections"), list)
        else [],
        "dialogue": raw_script.get("dialogue")
        if isinstance(raw_script.get("dialogue"), list)
        else [],
    }

    normalized["dialogue"] = [
        {
            "speaker": sec.get("speaker", "Host A"),
            "text": sec.get("text", ""),
        }
        for sec in normalized["sections"]
        if isinstance(sec, dict) and sec.get("text")
    ] or normalized["dialogue"]

    return normalized


def run(state: dict[str, Any], config: ScriptConfig = None) -> dict[str, Any]:
    config = config or ScriptConfig()
    ctx = NodeContext("ScriptNode", state)
    topic = state.get("selected_topic", {})
    materials = state.get("selected_materials", [])

    ctx.log_start(
        f"输入: selected_topic='{topic.get('title', 'N/A')[:50]}', "
        f"selected_materials={len(materials)} items | "
        f"content_type={config.content_type}, "
        f"target_duration={config.target_duration_minutes}min, "
        f"num_hosts={config.num_hosts}",
        uses_llm=True,
    )

    try:
        if not topic or not materials:
            ctx.add_error("script", "Missing topic or materials")
            ctx.log_end("输出: (无脚本 — 缺少输入)")
            return ctx.finalize(state)

        ctx.log(f"生成脚本中... (debug_mode={ctx.debug_mode})")
        script = _generate_script(topic, materials, config, ctx)
        state["script"] = script
        ctx.log(f"脚本生成完成: {script.get('title', '')}")

        # Stage segmentation (merged from stages node)
        dialogue = script.get("dialogue", [])
        stages = []
        wpm = config.words_per_minute
        for i, line in enumerate(dialogue):
            text = line.get("text", "")
            word_count = len(text)
            duration = word_count / wpm * 60
            stages.append(
                {
                    "order": i,
                    "speaker": line.get("speaker", ""),
                    "text": text,
                    "estimated_duration": round(duration, 1),
                }
            )
        state["stages"] = stages
        total_dur = sum(s["estimated_duration"] for s in stages)
        ctx.log(f"分段完成: {len(stages)} segments, 预计时长 ~{total_dur:.0f}s")
    except Exception as e:
        ctx.add_error("script", str(e), detail=str(e))
        ctx.log(f"✗ 错误: {str(e)}")

    script = state.get("script", {})
    stages = state.get("stages", [])
    detail = (
        f"输出: script.title='{script.get('title', 'N/A')[:50]}', stages={len(stages)} segments"
    )
    if script:
        detail += (
            f" | content_type={script.get('content_type', 'N/A')}, "
            f"dialogue={len(script.get('dialogue', []))}"
        )
    ctx.log_end(detail)
    return ctx.finalize(state)


def _generate_script(
    topic: dict,
    materials: list,
    config: ScriptConfig,
    ctx: NodeContext,
) -> dict[str, Any]:
    api_key = config.api_key or os.environ.get("OPENAI_API_KEY", "")
    api_base = config.api_base or os.environ.get("OPENAI_API_BASE", "")

    if not api_key:
        raise ValueError(
            "API key is required for script generation. "
            "Please set api_key in script node config or OPENAI_API_KEY environment variable."
        )
    if not api_base:
        raise ValueError(
            "API base URL is required for script generation. "
            "Please set api_base in script node config or OPENAI_API_BASE environment variable."
        )

    materials_text = _build_materials_text(materials)
    content_type = config.content_type if config.content_type in PROMPT_BUILDERS else "story"

    if ctx.debug_mode:
        prompt = (
            f"[DEBUG MODE] 生成一个极简单的测试脚本。\n"
            f"主题: {topic.get('title', '')[:50]}\n"
            f'Return minimal JSON: {{"title":"测试标题","description":"测试",'
            f'"content_type":"{content_type}","sections":[],'
            f'"dialogue":[{{"speaker":"Host","text":"DEBUG MODE测试内容"}}]}}'
        )
    else:
        prompt = PROMPT_BUILDERS[content_type](topic, config, materials_text)

    system_content = SYSTEM_PROMPTS.get(content_type, SYSTEM_PROMPTS["story"])
    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": prompt},
    ]

    effective_timeout = min(config.timeout, 30) if ctx.debug_mode else config.timeout

    with LLMClient(
        api_base,
        api_key,
        config.llm_model,
        config.temperature,
        debug_mode=ctx.debug_mode,
    ) as client:
        ctx.log(f"LLM调用: model={config.llm_model}, timeout={effective_timeout}s")
        response = client.call(messages, timeout=effective_timeout, logs=ctx.logs)
        content = client.extract_content(response)

    json_match = re.search(r"\{.*\}", content, re.DOTALL)
    if json_match:
        try:
            parsed = json.loads(json_match.group())
            return _normalize_script(content_type, parsed, topic)
        except json.JSONDecodeError:
            ctx.log("⚠ JSON解析失败，使用降级输出")

    return _normalize_script(
        content_type,
        {
            "title": topic.get("title", "Untitled"),
            "description": "",
            "dialogue": [],
        },
        topic,
    )
