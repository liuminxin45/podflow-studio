from typing import Any
from nodes.manual.config import ManualConfig
from protocol.node_runner import NodeContext


def run(state: dict[str, Any], config: ManualConfig = None) -> dict[str, Any]:
    """Manual input node - 灵感收集箱：手动输入素材"""
    config = config or ManualConfig()
    ctx = NodeContext("ManualNode", state)
    ctx.log_start(f"配置: news_items={len(config.news_items)} items")

    manual_contents = []

    if not config.news_items:
        ctx.log("No manual items provided (this is fine, merge will handle it)")
    else:
        ctx.log(f"Processing {len(config.news_items)} manual news items")
        for idx, item in enumerate(config.news_items):
            if not isinstance(item, dict):
                ctx.log(f"Skipping invalid item at index {idx}")
                continue
            news_item = {
                "title": item.get("title", f"Manual News {idx + 1}"),
                "content": item.get("content", ""),
                "url": item.get("url", ""),
                "published": item.get("published", ""),
                "source": "manual_input",
                "type": "manual",
            }
            manual_contents.append(news_item)
        ctx.log(f"Added {len(manual_contents)} manual news items")

    state["manual_contents"] = manual_contents

    detail = f"输出: manual_contents={len(manual_contents)} items"
    if manual_contents:
        sample_titles = [item.get("title", "Untitled")[:40] for item in manual_contents[:3]]
        detail += f"\n[ManualNode] 样本标题: {sample_titles}"
    ctx.log_end(detail)
    return ctx.finalize(state)
