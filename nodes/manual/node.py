from typing import Dict, Any
from nodes.manual.config import ManualConfig


def run(state: Dict[str, Any], config: ManualConfig = None) -> Dict[str, Any]:
    """Manual input node - 灵感收集箱：手动输入素材"""
    config = config or ManualConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    logs.append("[ManualNode] Starting manual input processing")
    
    # 处理手动输入的新闻
    manual_contents = []
    
    if not config.news_items:
        logs.append("[ManualNode] No manual items provided (this is fine, merge will handle it)")
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
            manual_contents.append(news_item)
        
        logs.append(f"[ManualNode] Added {len(manual_contents)} manual news items")
    
    state["manual_contents"] = manual_contents
    state["logs"] = logs
    state["errors"] = errors
    return state
