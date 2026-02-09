from typing import Dict, Any
from nodes.manual.config import ManualConfig


def run(state: Dict[str, Any], config: ManualConfig = None) -> Dict[str, Any]:
    """Manual input node - 手动输入新闻内容"""
    config = config or ManualConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    # Check if we should skip this node based on source selection
    if state.get("selected_source_type") == "fetch":
        logs.append("[ManualNode] Skipping: 'fetch' source selected")
        state["logs"] = logs
        return state

    logs.append("[ManualNode] Starting manual input processing")
    
    # 处理手动输入的新闻
    raw_contents = []
    
    if not config.news_items:
        logs.append("[ManualNode] Warning: No manual news items provided")
    else:
        logs.append(f"[ManualNode] Processing {len(config.news_items)} manual news items")
        
        for idx, item in enumerate(config.news_items):
            if not isinstance(item, dict):
                logs.append(f"[ManualNode] Skipping invalid item at index {idx}")
                continue
            
            # 构建标准化的新闻条目
            news_item = {
                "title": item.get("title", f"Manual News {idx + 1}"),
                "content": item.get("content", ""),
                "url": item.get("url", ""),
                "published": item.get("published", ""),
                "source": "manual_input",
                "type": "manual",
            }
            raw_contents.append(news_item)
        
        logs.append(f"[ManualNode] Added {len(raw_contents)} manual news items")
    
    state["raw_contents"] = raw_contents
    state["logs"] = logs
    state["errors"] = errors
    return state
