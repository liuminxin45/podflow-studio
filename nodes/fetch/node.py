from typing import Dict, Any, List
from pathlib import Path
import importlib.util
import sys
from nodes.fetch.config import FetchConfig


def run(state: Dict[str, Any], config: FetchConfig = None) -> Dict[str, Any]:
    """Run fetch node with dynamic source loading."""
    config = config or FetchConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    # Check if we should skip this node based on source selection
    if state.get("selected_source_type") == "manual":
        logs.append("[FetchNode] Skipping: 'manual' source selected")
        state["logs"] = logs
        return state

    logs.append("[FetchNode] Starting fetch")
    logs.append(f"[FetchNode] Enabled sources: {config.enabled_sources}")
    
    # 获取sources目录路径
    sources_dir = Path(__file__).parent / "sources"
    
    if not sources_dir.exists():
        errors.append({
            "node": "fetch",
            "message": "Sources directory not found",
            "detail": f"Directory {sources_dir} does not exist"
        })
        state["raw_contents"] = []
        state["logs"] = logs
        state["errors"] = errors
        return state
    
    # 收集所有数据
    all_contents = []
    
    # 遍历启用的数据源
    for source_name in config.enabled_sources:
        source_file = sources_dir / f"{source_name}.py"
        
        if not source_file.exists():
            logs.append(f"[FetchNode] Warning: Source file '{source_name}.py' not found, skipping")
            continue
        
        try:
            # 动态加载数据源模块
            logs.append(f"[FetchNode] Loading source: {source_name}")
            source_module = _load_source_module(source_name, source_file)
            
            if not hasattr(source_module, 'source'):
                logs.append(f"[FetchNode] Warning: Source '{source_name}' has no 'source' instance, skipping")
                continue
            
            source_instance = source_module.source
            
            # 执行fetch
            logs.append(f"[FetchNode] Fetching from: {source_instance.name}")
            items = source_instance.fetch()
            
            logs.append(f"[FetchNode] Fetched {len(items)} items from {source_name}")
            all_contents.extend(items)
            
        except Exception as e:
            error_msg = f"Failed to fetch from {source_name}: {str(e)}"
            logs.append(f"[FetchNode] Error: {error_msg}")
            errors.append({
                "node": "fetch",
                "source": source_name,
                "message": error_msg,
                "detail": str(e)
            })
    
    state["raw_contents"] = all_contents
    logs.append(f"[FetchNode] Total items fetched: {len(all_contents)}")
    state["logs"] = logs
    state["errors"] = errors
    return state


def _load_source_module(source_name: str, source_file: Path):
    """Dynamically load a source module."""
    spec = importlib.util.spec_from_file_location(f"nodes.fetch.sources.{source_name}", source_file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def get_available_sources() -> List[Dict[str, Any]]:
    """Get list of available data sources."""
    sources_dir = Path(__file__).parent / "sources"
    
    if not sources_dir.exists():
        return []
    
    available = []
    
    for source_file in sources_dir.glob("*.py"):
        # 跳过特殊文件
        if source_file.name.startswith("_") or source_file.name == "base.py":
            continue
        
        source_name = source_file.stem
        
        try:
            # 尝试加载模块获取元数据
            module = _load_source_module(source_name, source_file)
            
            if hasattr(module, 'source'):
                source_instance = module.source
                available.append({
                    "id": source_name,
                    "name": source_instance.name,
                    "description": source_instance.description,
                })
            else:
                # 如果没有source实例，只返回基本信息
                available.append({
                    "id": source_name,
                    "name": source_name,
                    "description": "No description available",
                })
        except Exception as e:
            # 加载失败，返回基本信息
            available.append({
                "id": source_name,
                "name": source_name,
                "description": f"Error loading: {str(e)}",
            })
    
    return available
