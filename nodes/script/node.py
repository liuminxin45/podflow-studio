import os
import json
import re
from typing import Dict, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from nodes.script.config import ScriptConfig


def run(state: Dict[str, Any], config: ScriptConfig = None) -> Dict[str, Any]:
    config = config or ScriptConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    logs.append("[ScriptNode] Starting script generation")
    topic = state.get("selected_topic", {})
    materials = state.get("selected_materials", [])

    try:
        if not topic or not materials:
            errors.append({"node": "script", "message": "Missing topic or materials"})
            state["logs"] = logs
            state["errors"] = errors
            return state

        script = _generate_script(topic, materials, config)
        state["script"] = script
        logs.append(f"[ScriptNode] Script done: {script.get('title', '')}")

        # Stage segmentation (merged from stages node)
        dialogue = script.get("dialogue", [])
        stages = []
        wpm = config.words_per_minute
        for i, line in enumerate(dialogue):
            text = line.get("text", "")
            word_count = len(text)
            duration = word_count / wpm * 60
            stages.append({
                "order": i,
                "speaker": line.get("speaker", ""),
                "text": text,
                "estimated_duration": round(duration, 1),
            })
        state["stages"] = stages
        total_dur = sum(s["estimated_duration"] for s in stages)
        logs.append(f"[ScriptNode] {len(stages)} segments, ~{total_dur:.0f}s total")
    except Exception as e:
        errors.append({"node": "script", "message": str(e), "detail": str(e)})

    state["logs"] = logs
    state["errors"] = errors
    return state


def _generate_script(topic: Dict, materials: list, config: ScriptConfig) -> Dict[str, Any]:
    api_key = config.api_key or os.environ.get("OPENAI_API_KEY", "")
    api_base = config.api_base or os.environ.get("OPENAI_API_BASE", None)

    # 检查API密钥
    if not api_key:
        raise ValueError(
            "API key is required for script generation. "
            "Please set api_key in script node config or OPENAI_API_KEY environment variable."
        )

    kwargs = {
        "model": config.llm_model, 
        "api_key": api_key, 
        "temperature": config.temperature,
        "timeout": config.timeout,
        "max_retries": config.max_retries
    }
    if api_base:
        kwargs["base_url"] = api_base
    
    llm = ChatOpenAI(**kwargs)

    materials_text = "\n\n".join([
        f"- {m.get('title', '')}: {m.get('content', '')[:500]}"
        for m in materials[:5]
    ])

    prompt = f"""Generate a {config.target_duration_minutes}-minute podcast dialogue script.

Topic: {topic.get('title', '')}
Description: {topic.get('description', '')}

Materials:
{materials_text}

Requirements:
1. {config.num_hosts} hosts dialogue
2. Style: {config.dialogue_style}
3. Include opening, body, closing
4. Mark each speaker

Return JSON:
{{
    "title": "Episode title",
    "description": "Episode description",
    "dialogue": [
        {{"speaker": "Host A", "text": "dialogue content"}},
        {{"speaker": "Host B", "text": "dialogue content"}}
    ]
}}
"""
    messages = [
        SystemMessage(content="You are a professional podcast script writer."),
        HumanMessage(content=prompt),
    ]
    response = llm.invoke(messages)
    content = response.content
    json_match = re.search(r'\{.*\}', content, re.DOTALL)

    if json_match:
        return json.loads(json_match.group())

    return {"title": topic.get("title", "Untitled"), "description": "", "dialogue": []}
