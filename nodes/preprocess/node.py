from typing import Any
from nodes.preprocess.config import PreprocessConfig
from protocol.node_runner import NodeContext
from protocol.dedup import deduplicate_by_title


def run(state: dict[str, Any], config: PreprocessConfig = None) -> dict[str, Any]:
    config = config or PreprocessConfig()
    ctx = NodeContext("PreprocessNode", state)
    effective_min_length = 0 if ctx.auto_execute else config.min_content_length
    raw = state.get("fetch_contents", [])
    ctx.log_start(
        f"输入: fetch_contents={len(raw)} items | "
        f"min_length={effective_min_length}, max_length={config.max_content_length}, dedup={config.remove_duplicates}"
    )
    if ctx.auto_execute:
        ctx.log("Auto-execute mode: min_content_length set to 0 (hotlist items allowed)")
    cleaned = []

    try:
        for item in raw:
            content = item.get("content", "")
            if len(content) < effective_min_length:
                continue
            if len(content) > config.max_content_length:
                content = content[: config.max_content_length]
                item = {**item, "content": content}
            cleaned.append(item)

        if config.remove_duplicates and len(cleaned) > 1:
            cleaned = deduplicate_by_title(cleaned, config.similarity_threshold)
    except Exception as e:
        ctx.add_error("preprocess", str(e))

    state["cleaned_contents"] = cleaned
    filtered_count = len(raw) - len(cleaned)
    ctx.log_end(
        f"输出: cleaned_contents={len(cleaned)} items | 输入{len(raw)}, 保留{len(cleaned)}, 过滤{filtered_count}"
    )
    return ctx.finalize(state)
