from typing import Any
from nodes.merge.config import MergeConfig
from protocol.node_runner import NodeContext
from protocol.dedup import deduplicate_by_title


def run(state: dict[str, Any], config: MergeConfig = None) -> dict[str, Any]:
    """Merge node - 创作素材池：整合 Fetch 与 Manual 两侧的内容"""
    config = config or MergeConfig()
    ctx = NodeContext("MergeNode", state)
    fetch_contents = state.get("fetch_contents", [])
    manual_contents = state.get("manual_contents", [])
    ctx.log_start(
        f"输入: fetch={len(fetch_contents)}, manual={len(manual_contents)}, "
        f"deduplicate={config.deduplicate}, threshold={config.similarity_threshold}"
    )

    for item in fetch_contents:
        item["_source_channel"] = "auto"
    for item in manual_contents:
        item["_source_channel"] = "manual"

    merged = list(fetch_contents) + list(manual_contents)

    if config.deduplicate and len(merged) > 1:
        before = len(merged)
        merged = deduplicate_by_title(merged, config.similarity_threshold)
        removed = before - len(merged)
        if removed > 0:
            ctx.log(f"Removed {removed} duplicate(s)")

    if len(merged) == 0:
        ctx.log("Warning: No content from either source. Pipeline may produce empty results.")
    else:
        ctx.log(f"Final merged pool: {len(merged)} items")

    state["raw_contents"] = merged
    auto_count = sum(1 for item in merged if item.get("_source_channel") == "auto")
    manual_count = sum(1 for item in merged if item.get("_source_channel") == "manual")
    ctx.log_end(
        f"输出: raw_contents={len(merged)} items | auto={auto_count}, manual={manual_count}"
    )
    return ctx.finalize(state)
