from typing import Any
from nodes.research.config import ResearchConfig
from protocol.llm_client import LLMClient
from protocol.node_runner import NodeContext
import json


def run(state: dict[str, Any], config: ResearchConfig = None) -> dict[str, Any]:
    config = config or ResearchConfig()
    ctx = NodeContext("ResearchNode", state)
    runtime_config = state.get("runtime_config", {})
    organize_config = runtime_config.get("organize", {})
    is_ai_mode = organize_config.get("mode") == "ai"
    cleaned = state.get("cleaned_contents", [])

    ctx.log_start(
        f"输入: cleaned_contents={len(cleaned)} items | "
        f"auto_execute={ctx.auto_execute}, is_ai_mode={is_ai_mode}",
        uses_llm=True,
    )

    # Get LLM config from script node if research node config is not set
    if ctx.auto_execute and is_ai_mode:
        script_config = runtime_config.get("script", {})
        if not config.api_key and script_config.get("api_key"):
            config.api_key = script_config.get("api_key")
            config.api_base = script_config.get("api_base", "")
            config.llm_model = script_config.get("llm_model", "gpt-4o-mini")
            config.temperature = script_config.get("temperature", 0.5)
            ctx.log(
                f"Using LLM config from script node: {config.api_base[:30]}... / {config.llm_model}"
            )

    ctx.log(
        f"LLM config: api_key={'SET' if config.api_key else 'NOT SET'}, api_base={config.api_base}"
    )
    researched = []

    try:
        if ctx.auto_execute:
            # In auto_execute mode, pass all items through without LLM calls.
            # topic_selection will do AI-powered filtering by topic on the full pool.
            ctx.log("Auto-execute模式: 直传所有条目 (topic_selection将按主题过滤)")
            for item in cleaned:
                researched.append(
                    {
                        **item,
                        "research_notes": "",
                        "key_points": [],
                        "verified": False,
                    }
                )
            ctx.log(f"直传完成: {len(researched)} items")
        elif is_ai_mode and config.api_key and config.api_base:
            ctx.log(f"启动LLM深度分析, 共 {len(cleaned)} 条内容...")
            researched = _ai_research_with_llm(cleaned, config, ctx.logs, debug_mode=ctx.debug_mode)
            ctx.log("LLM分析完成")
        else:
            ctx.log(
                f"基础模式 (无LLM, api_key={bool(config.api_key)}, api_base={bool(config.api_base)})"
            )
            for item in cleaned:
                researched.append(
                    {
                        **item,
                        "research_notes": "",
                        "key_points": [],
                        "verified": False,
                    }
                )
            ctx.log(f"处理完成: {len(researched)} items")
    except Exception as e:
        import traceback

        ctx.log(f"✗ 执行异常: {type(e).__name__}: {str(e)}")
        ctx.log(f"Traceback: {traceback.format_exc()}")
        ctx.add_error("research", str(e))

    state["researched_contents"] = researched
    verified_count = sum(1 for item in researched if item.get("verified"))
    ctx.log_end(
        f"输出: researched_contents={len(researched)} items | "
        f"AI验证={verified_count}, 未验证={len(researched) - verified_count}"
    )
    return ctx.finalize(state)


def _ai_research_with_llm(
    items: list, config: ResearchConfig, logs: list, debug_mode: bool = False
) -> list:
    """Use LLM to extract key points and research notes from content."""
    researched = []

    try:
        with LLMClient(
            config.api_base,
            config.api_key,
            config.llm_model,
            config.temperature,
            debug_mode=debug_mode,
        ) as client:
            for idx, item in enumerate(items):
                logs.append(
                    f"[ResearchNode] AI analyzing item {idx + 1}/{len(items)}: {item.get('title', 'Untitled')[:50]}..."
                )

                if debug_mode:
                    prompt = f"""标题：{item.get("title", "")[:50]}

提取1个关键点，输出JSON: {{"key_point":"一句话"}}"""
                else:
                    prompt = f"""Analyze the following content and extract:
1. 3-5 key points (important facts, insights, or findings)
2. A brief research note (2-3 sentences summary)

Content Title: {item.get("title", "")}
Content: {item.get("content", "")[:1000]}

Respond in JSON format:
{{
  "key_points": ["point1", "point2", "point3"],
  "research_notes": "summary text"
}}"""

                try:
                    response = client.call(
                        [{"role": "user", "content": prompt}],
                        timeout=20 if debug_mode else 30,
                        max_tokens=100 if debug_mode else None,
                        logs=logs,
                    )

                    content = client.extract_content(response)
                    result = json.loads(content)

                    if debug_mode:
                        researched_item = {
                            **item,
                            "research_notes": "",
                            "key_points": [result.get("key_point", "")],
                            "verified": True,
                        }
                    else:
                        researched_item = {
                            **item,
                            "research_notes": result.get("research_notes", ""),
                            "key_points": result.get("key_points", []),
                            "verified": True,
                        }
                    logs.append(
                        f"[ResearchNode] ✓ Extracted {len(researched_item['key_points'])} key points"
                    )
                except json.JSONDecodeError:
                    logs.append("[ResearchNode] ⚠ JSON parse failed, using raw response")
                    researched_item = {
                        **item,
                        "research_notes": content[:200] if content else "",
                        "key_points": [],
                        "verified": False,
                    }
                except Exception as e:
                    logs.append(f"[ResearchNode] ✗ LLM call failed for item {idx + 1}: {str(e)}")
                    researched_item = {
                        **item,
                        "research_notes": "",
                        "key_points": [],
                        "verified": False,
                    }

                researched.append(researched_item)
    except Exception as e:
        logs.append(f"[ResearchNode] LLM client error: {str(e)}")
        raise

    return researched
