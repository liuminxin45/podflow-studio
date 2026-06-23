# coding=utf-8
"""
TrendRadar Bridge — 桥接层

职责：
1. 隔离导入 TrendRadar 的 DataFetcher（自动处理 sys.path）
2. 读取 TrendRadar 自身的 config.yaml 获取平台列表
3. 调用 DataFetcher.crawl_websites() 拉取热榜原始数据
4. 将原始数据转换为 auto-podcast fetch 节点的标准格式

本模块是 TrendRadar 与 auto-podcast 之间的 **唯一接触点**。
TrendRadar 代码库保持完全隔离，不做任何修改。
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import importlib.util
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple


def _log(msg: str):
    """日志输出到 stderr，避免污染 fetch 节点的 JSON stdout。"""
    print(msg, file=sys.stderr)


ENGINE_DIR = Path(__file__).resolve().parent
TRENDRADAR_ROOT = ENGINE_DIR / "trendradar"
LOCK_FILE = ENGINE_DIR / "trendradar.lock.json"
_FETCHER_PATH = TRENDRADAR_ROOT / "trendradar" / "crawler" / "fetcher.py"


def get_data_fetcher():
    """
    直接加载 TrendRadar 的 fetcher.py，绕过 trendradar 包的 __init__.py。

    这样做是因为 trendradar.__init__ 会触发完整的依赖链
    (litellm, boto3, feedparser 等)，而我们只需要 DataFetcher 类，
    它仅依赖 requests + json + random + time（都是已有依赖）。
    """
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "_trendradar_fetcher", str(_FETCHER_PATH)
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.DataFetcher


def load_trendradar_platforms() -> List[Dict[str, str]]:
    """
    从 TrendRadar 的 config.yaml 读取平台列表。

    Returns:
        [{"id": "toutiao", "name": "今日头条"}, ...]
    """
    import yaml

    config_path = TRENDRADAR_ROOT / "config" / "config.yaml"
    if not config_path.exists():
        _log(f"[bridge] config.yaml not found: {config_path}")
        return []

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    platforms_cfg = cfg.get("platforms", {})
    if not platforms_cfg.get("enabled", True):
        return []

    sources = platforms_cfg.get("sources", [])
    return [
        {
            "id": s["id"],
            "name": s.get("name", s["id"]),
            "enabled": s.get("enabled", True),
            "expected_domain": s.get("expected_domain", ""),
        }
        for s in sources
    ]


def _ensure_trendradar_path():
    root = str(TRENDRADAR_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)


def _read_json(path: Path, default: Any) -> Any:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        _log(f"[bridge] Failed to read json {path}: {exc}")
    return default


def _write_json(path: Path, data: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    try:
        repaired = text.encode("latin1").decode("gbk")
        if repaired and repaired != text:
            return repaired
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    return text


def _load_yaml(path: Path) -> Dict[str, Any]:
    import yaml

    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _extract_version(path: Path) -> Optional[str]:
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8", errors="ignore")
    match = re.search(r"Version:\s*([0-9.]+)", text, re.IGNORECASE)
    return match.group(1) if match else None


def _parse_version_tuple(value: str) -> Tuple[int, ...]:
    return tuple(int(p) for p in re.findall(r"\d+", value or "0")[:3]) or (0,)


def _python_satisfies(requirement: str, version: str) -> bool:
    if not requirement or not version:
        return True
    match = re.match(r">=\s*([0-9.]+)", requirement)
    if not match:
        return True
    return _parse_version_tuple(version) >= _parse_version_tuple(match.group(1))


def _read_local_version() -> Optional[str]:
    version_file = TRENDRADAR_ROOT / "version"
    if version_file.exists():
        return version_file.read_text(encoding="utf-8", errors="ignore").strip()
    pyproject = TRENDRADAR_ROOT / "pyproject.toml"
    if pyproject.exists():
        match = re.search(r'version\s*=\s*"([^"]+)"', pyproject.read_text(encoding="utf-8", errors="ignore"))
        if match:
            return match.group(1)
    return None


def _read_pyproject_requirement(path: Path) -> str:
    if not path.exists():
        return ""
    match = re.search(r'requires-python\s*=\s*"([^"]+)"', path.read_text(encoding="utf-8", errors="ignore"))
    return match.group(1) if match else ""


def _get_runtime_requirement() -> str:
    lock = get_lock_info()
    return lock.get("python") or _read_pyproject_requirement(TRENDRADAR_ROOT / "pyproject.toml")


def _missing_runtime_modules() -> List[str]:
    # DataFetcher only needs requests and works in the thin adapter. These are
    # the modules required by the fuller TrendRadar 6.10 RSS/AI/report chain.
    required = {
        "feedparser": "feedparser",
        "litellm": "litellm",
        "json-repair": "json_repair",
        "boto3": "boto3",
        "tenacity": "tenacity",
        "fastmcp": "fastmcp",
        "websockets": "websockets",
    }
    missing = []
    for package_name, module_name in required.items():
        if importlib.util.find_spec(module_name) is None:
            missing.append(package_name)
    return missing


def _runtime_health() -> Dict[str, Any]:
    requirement = _get_runtime_requirement()
    python_version = ".".join(map(str, sys.version_info[:3]))
    python_compatible = _python_satisfies(requirement, python_version)
    missing_modules = _missing_runtime_modules()
    blocker_parts = []
    if not python_compatible:
        blocker_parts.append(f"TrendRadar {_read_local_version() or ''} 要求 Python {requirement}，当前为 {python_version}")
    if missing_modules:
        blocker_parts.append(f"缺少依赖：{', '.join(missing_modules)}")
    return {
        "pythonRequirement": requirement,
        "pythonVersion": python_version,
        "pythonExecutable": sys.executable,
        "pythonCompatible": python_compatible,
        "missingDependencies": missing_modules,
        "fullRuntimeAvailable": python_compatible and not missing_modules,
        "runtimeBlocked": bool(blocker_parts),
        "runtimeBlocker": "；".join(blocker_parts),
        "adapterAvailable": TRENDRADAR_ROOT.exists() and _FETCHER_PATH.exists(),
    }


def _fetch_text(url: str, timeout: int = 15) -> str:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def _get_user_paths(user_data_dir: Optional[str] = None) -> Dict[str, Path]:
    base = Path(user_data_dir or os.environ.get("AUTO_PODCAST_USER_DATA") or (ENGINE_DIR / "trendradar_data"))
    root = base / "trendradar"
    return {
        "root": root,
        "config": root / "config.json",
        "latest": root / "latest.json",
        "status": root / "status.json",
        "ai_filter_cache": root / "ai_filter_cache.json",
        "reports": root / "reports",
        "backup": root / "backups",
    }


def get_lock_info() -> Dict[str, Any]:
    return _read_json(LOCK_FILE, {})


def _first_non_empty(*values: Any) -> Any:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str):
            if value.strip():
                return value.strip()
            continue
        return value
    return ""


def _coerce_int(value: Any, default: int, minimum: Optional[int] = None, maximum: Optional[int] = None) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError):
        result = default
    if minimum is not None:
        result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def _coerce_float(value: Any, default: float, minimum: Optional[float] = None, maximum: Optional[float] = None) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        result = default
    if minimum is not None:
        result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    if value is None:
        return default
    return bool(value)


def _coerce_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return [str(value).strip()] if str(value).strip() else []


def _ai_provider_source(ai_key: str, ai_model: str, source_ai_cfg: Dict[str, Any]) -> str:
    explicit_source = os.environ.get("AUTO_PODCAST_TRENDRADAR_AI_SOURCE", "").strip()
    if explicit_source:
        return explicit_source
    if os.environ.get("AI_API_KEY") or os.environ.get("AI_MODEL"):
        return "env"
    if ai_key or ai_model:
        return "trendradar" if source_ai_cfg.get("api_key") or source_ai_cfg.get("model") else "app"
    return "none"


def _build_ai_runtime_config(config: Dict[str, Any], source_cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    source_cfg = source_cfg or _load_yaml(TRENDRADAR_ROOT / "config" / "config.yaml")
    ai_cfg = source_cfg.get("ai", {})
    return {
        "MODEL": _first_non_empty(config.get("ai_model"), os.environ.get("AI_MODEL"), ai_cfg.get("model")),
        "API_KEY": _first_non_empty(config.get("ai_api_key"), os.environ.get("AI_API_KEY"), ai_cfg.get("api_key")),
        "API_BASE": _first_non_empty(config.get("ai_api_base"), os.environ.get("AI_API_BASE"), ai_cfg.get("api_base")),
        "TIMEOUT": _coerce_int(config.get("ai_timeout"), ai_cfg.get("timeout", 120), minimum=1),
        "TEMPERATURE": _coerce_float(config.get("ai_temperature"), ai_cfg.get("temperature", 1.0), minimum=0.0, maximum=2.0),
        "MAX_TOKENS": _coerce_int(config.get("ai_max_tokens"), ai_cfg.get("max_tokens", 5000), minimum=0),
        "NUM_RETRIES": _coerce_int(config.get("ai_num_retries"), ai_cfg.get("num_retries", 1), minimum=0),
        "FALLBACK_MODELS": _coerce_list(config.get("ai_fallback_models") or ai_cfg.get("fallback_models", [])),
        "EXTRA_PARAMS": config.get("ai_extra_params") or ai_cfg.get("extra_params", {}),
    }


def _build_ai_filter_runtime_config(config: Dict[str, Any], source_cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    source_cfg = source_cfg or _load_yaml(TRENDRADAR_ROOT / "config" / "config.yaml")
    ai_filter = source_cfg.get("ai_filter", {})
    return {
        "BATCH_SIZE": _coerce_int(config.get("ai_filter_batch_size"), ai_filter.get("batch_size", 200), minimum=1, maximum=500),
        "BATCH_INTERVAL": _coerce_float(config.get("ai_filter_batch_interval"), ai_filter.get("batch_interval", 2), minimum=0, maximum=60),
        "INTERESTS_FILE": _first_non_empty(config.get("ai_interests_file"), ai_filter.get("interests_file")) or None,
        "PROMPT_FILE": _first_non_empty(config.get("ai_filter_prompt_file"), ai_filter.get("prompt_file"), "prompt.txt"),
        "EXTRACT_PROMPT_FILE": _first_non_empty(config.get("ai_filter_extract_prompt_file"), ai_filter.get("extract_prompt_file"), "extract_prompt.txt"),
        "UPDATE_TAGS_PROMPT_FILE": _first_non_empty(config.get("ai_filter_update_tags_prompt_file"), ai_filter.get("update_tags_prompt_file"), "update_tags_prompt.txt"),
        "RECLASSIFY_THRESHOLD": _coerce_float(config.get("ai_filter_reclassify_threshold"), ai_filter.get("reclassify_threshold", 0.6), minimum=0.0, maximum=1.0),
        "MIN_SCORE": _coerce_float(config.get("ai_filter_min_score"), ai_filter.get("min_score", 0), minimum=0.0, maximum=1.0),
    }


def get_config_view(user_data_dir: Optional[str] = None) -> Dict[str, Any]:
    source_cfg = _load_yaml(TRENDRADAR_ROOT / "config" / "config.yaml")
    user_cfg = _read_json(_get_user_paths(user_data_dir)["config"], {})

    platforms_cfg = source_cfg.get("platforms", {})
    rss_cfg = source_cfg.get("rss", {})
    advanced = source_cfg.get("advanced", {})
    ai_cfg = source_cfg.get("ai", {})
    ai_filter_cfg = source_cfg.get("ai_filter", {})
    filter_cfg = source_cfg.get("filter", {})
    app_cfg = source_cfg.get("app", {})
    schedule_cfg = source_cfg.get("schedule", {})
    report_cfg = source_cfg.get("report", {})
    display_cfg = source_cfg.get("display", {})
    display_regions = display_cfg.get("regions", {})
    standalone_cfg = display_cfg.get("standalone", {})
    advanced_crawler = advanced.get("crawler", {})
    advanced_rss = advanced.get("rss", {})
    ai_runtime = _build_ai_runtime_config(user_cfg, source_cfg)
    ai_filter_runtime = _build_ai_filter_runtime_config(user_cfg, source_cfg)

    platform_sources = [
        p for p in platforms_cfg.get("sources", []) if p.get("enabled", True)
    ]
    rss_sources = [
        f for f in rss_cfg.get("feeds", []) if f.get("enabled", True)
    ]

    view = {
        "timezone": app_cfg.get("timezone", "Asia/Shanghai"),
        "show_version_update": app_cfg.get("show_version_update", True),
        "platforms_enabled": platforms_cfg.get("enabled", True),
        "rss_enabled": rss_cfg.get("enabled", True),
        "enabled_platforms": [p.get("id") for p in platform_sources if p.get("id")],
        "enabled_rss_feeds": [f.get("id") for f in rss_sources if f.get("id")],
        "max_items_per_source": 30,
        "freshness_days": rss_cfg.get("freshness_filter", {}).get("max_age_days", 3),
        "rss_freshness_enabled": rss_cfg.get("freshness_filter", {}).get("enabled", True),
        "rss_request_interval": advanced_rss.get("request_interval", 1000),
        "rss_timeout": advanced_rss.get("timeout", 15),
        "rss_proxy_enabled": advanced_rss.get("use_proxy", False),
        "rss_proxy_url": advanced_rss.get("proxy_url", ""),
        "crawler_request_interval": advanced_crawler.get("request_interval", 2000),
        "filter_method": filter_cfg.get("method", "keyword"),
        "filter_priority_sort_enabled": filter_cfg.get("priority_sort_enabled", True),
        "ai_available": bool(ai_runtime.get("MODEL")),
        "ai_api_key_set": bool(ai_runtime.get("API_KEY")),
        "ai_provider_source": _ai_provider_source(str(ai_runtime.get("API_KEY") or ""), str(ai_runtime.get("MODEL") or ""), ai_cfg),
        "ai_model": ai_runtime.get("MODEL", ""),
        "ai_api_base": ai_runtime.get("API_BASE", ""),
        "ai_timeout": ai_runtime.get("TIMEOUT", 120),
        "ai_temperature": ai_runtime.get("TEMPERATURE", 1.0),
        "ai_max_tokens": ai_runtime.get("MAX_TOKENS", 5000),
        "ai_num_retries": ai_runtime.get("NUM_RETRIES", 1),
        "ai_fallback_models": ai_runtime.get("FALLBACK_MODELS", []),
        "ai_filter_batch_size": ai_filter_runtime["BATCH_SIZE"],
        "ai_filter_batch_interval": ai_filter_runtime["BATCH_INTERVAL"],
        "ai_filter_min_score": ai_filter_runtime["MIN_SCORE"],
        "ai_filter_reclassify_threshold": ai_filter_runtime["RECLASSIFY_THRESHOLD"],
        "ai_interests_file": ai_filter_runtime.get("INTERESTS_FILE") or ai_filter_cfg.get("interests_file", "") or "",
        "ai_filter_prompt_file": ai_filter_runtime.get("PROMPT_FILE", ""),
        "ai_filter_extract_prompt_file": ai_filter_runtime.get("EXTRACT_PROMPT_FILE", ""),
        "ai_filter_update_tags_prompt_file": ai_filter_runtime.get("UPDATE_TAGS_PROMPT_FILE", ""),
        "api_url": platforms_cfg.get("api_url", ""),
        "proxy_enabled": advanced_crawler.get("use_proxy", False),
        "proxy_url": advanced_crawler.get("default_proxy", ""),
        "schedule_preset": schedule_cfg.get("preset", "morning_evening"),
        "report_mode": report_cfg.get("mode", "current"),
        "report_display_mode": report_cfg.get("display_mode", "keyword"),
        "sort_by_position_first": report_cfg.get("sort_by_position_first", True),
        "rank_threshold": report_cfg.get("rank_threshold", 30),
        "max_news_per_keyword": report_cfg.get("max_news_per_keyword", 3),
        "display_standalone_enabled": display_regions.get("standalone", False),
        "standalone_platforms": standalone_cfg.get("platforms", []),
        "standalone_rss_feeds": standalone_cfg.get("rss_feeds", []),
        "standalone_max_items": standalone_cfg.get("max_items", 5),
        "debug": advanced.get("debug", False),
        "raw": user_cfg.get("raw", {}),
    }
    derived_keys = {"ai_available", "ai_api_key_set", "ai_provider_source", "ai_disabled_reason"}
    view.update({k: v for k, v in user_cfg.items() if k != "raw" and k not in derived_keys})
    return view


def save_config_view(config: Dict[str, Any], user_data_dir: Optional[str] = None) -> Dict[str, Any]:
    paths = _get_user_paths(user_data_dir)
    current = get_config_view(user_data_dir)
    next_config = {**current, **(config or {})}
    derived_keys = {
        "ai_available",
        "ai_api_key_set",
        "ai_provider_source",
        "ai_disabled_reason",
    }
    persisted = {k: v for k, v in next_config.items() if k not in derived_keys}
    _write_json(paths["config"], persisted)
    return get_config_view(user_data_dir)


def list_sources(user_data_dir: Optional[str] = None) -> List[Dict[str, Any]]:
    cfg = get_config_view(user_data_dir)
    source_cfg = _load_yaml(TRENDRADAR_ROOT / "config" / "config.yaml")
    platforms = source_cfg.get("platforms", {}).get("sources", [])
    rss_feeds = source_cfg.get("rss", {}).get("feeds", [])
    enabled_platforms = set(cfg.get("enabled_platforms", []))
    enabled_rss = set(cfg.get("enabled_rss_feeds", []))
    sources: List[Dict[str, Any]] = []
    for p in platforms:
        pid = p.get("id")
        if not pid:
            continue
        sources.append({
            "id": pid,
            "name": _normalize_text(p.get("name", pid)),
            "kind": "platform",
            "enabled": pid in enabled_platforms,
            "description": _normalize_text(p.get("expected_domain", "")),
        })
    for feed in rss_feeds:
        fid = feed.get("id")
        if not fid:
            continue
        sources.append({
            "id": fid,
            "name": _normalize_text(feed.get("name", fid)),
            "kind": "rss",
            "enabled": fid in enabled_rss,
            "url": feed.get("url", ""),
        })
    return sources


def _make_item_id(kind: str, source_id: str, title: str, url: str) -> str:
    digest = hashlib.sha1(f"{kind}|{source_id}|{title}|{url}".encode("utf-8")).hexdigest()[:16]
    return f"tr_{kind}_{source_id}_{digest}"


def _normalize_platform_results(
    results: Dict[str, Dict],
    id_to_name: Dict[str, str],
    max_items_per_source: int,
) -> List[Dict[str, Any]]:
    now_iso = datetime.now(timezone.utc).isoformat()
    items: List[Dict[str, Any]] = []
    for platform_id, titles_data in results.items():
        platform_name = _normalize_text(id_to_name.get(platform_id, platform_id))
        for idx, (title, title_info) in enumerate((titles_data or {}).items(), 1):
            if idx > max_items_per_source:
                break
            title_text = _normalize_text(title)
            url = str(title_info.get("url") or title_info.get("mobileUrl") or "")
            ranks = title_info.get("ranks", [])
            rank = ranks[0] if ranks else idx
            item_id = _make_item_id("platform", platform_id, str(title), url)
            items.append({
                "trendradar_id": item_id,
                "title": title_text,
                "content": f"[{platform_name} #{rank}] {title_text}",
                "url": url,
                "published": now_iso,
                "source": f"trendradar_{platform_id}",
                "type": "hotlist",
                "source_kind": "platform",
                "source_id": platform_id,
                "source_name": platform_name,
                "platform_id": platform_id,
                "platform_name": platform_name,
                "rank": rank,
                "score": max(0, 101 - int(rank)),
                "first_seen": now_iso,
                "last_seen": now_iso,
                "matched_reason": f"{platform_name} 热榜第 {rank} 位",
            })
    return items


def _fetch_rss_items(config: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str]]:
    enabled_feeds = set(config.get("enabled_rss_feeds") or [])
    if not enabled_feeds or not config.get("rss_enabled", True):
        return [], []
    try:
        _ensure_trendradar_path()
        from trendradar.crawler.rss.fetcher import RSSFetcher
    except Exception as exc:
        _log(f"[bridge] RSSFetcher unavailable: {exc}")
        return [], ["rss"]

    source_cfg = _load_yaml(TRENDRADAR_ROOT / "config" / "config.yaml")
    rss_cfg = source_cfg.get("rss", {})
    advanced_rss = source_cfg.get("advanced", {}).get("rss", {})
    feeds = []
    for feed in rss_cfg.get("feeds", []):
        if feed.get("id") in enabled_feeds:
            feeds.append({**feed, "enabled": True, "max_items": config.get("max_items_per_source", 30)})
    if not feeds:
        return [], []
    fetcher_cfg = {
        **rss_cfg,
        **advanced_rss,
        "request_interval": _coerce_int(config.get("rss_request_interval"), advanced_rss.get("request_interval", 1000), minimum=0),
        "timeout": _coerce_int(config.get("rss_timeout"), advanced_rss.get("timeout", 15), minimum=1),
        "use_proxy": _coerce_bool(config.get("rss_proxy_enabled"), advanced_rss.get("use_proxy", False)),
        "proxy_url": _first_non_empty(config.get("rss_proxy_url"), advanced_rss.get("proxy_url")),
        "feeds": feeds,
        "freshness_filter": {
            "enabled": _coerce_bool(config.get("rss_freshness_enabled"), rss_cfg.get("freshness_filter", {}).get("enabled", True)),
            "max_age_days": _coerce_int(config.get("freshness_days"), rss_cfg.get("freshness_filter", {}).get("max_age_days", 3), minimum=0),
        },
    }
    try:
        old_stdout = sys.stdout
        sys.stdout = sys.stderr
        try:
            data = RSSFetcher.from_config(fetcher_cfg).fetch_all()
        finally:
            sys.stdout = old_stdout
    except Exception as exc:
        _log(f"[bridge] RSS fetch failed: {exc}")
        return [], [f.get("id", "rss") for f in feeds]

    now_iso = datetime.now(timezone.utc).isoformat()
    items: List[Dict[str, Any]] = []
    for feed_id, feed_items in data.items.items():
        feed_name = _normalize_text(data.id_to_name.get(feed_id, feed_id))
        for idx, rss_item in enumerate(feed_items[: int(config.get("max_items_per_source", 30))], 1):
            title = _normalize_text(getattr(rss_item, "title", ""))
            url = getattr(rss_item, "url", "")
            published = getattr(rss_item, "published_at", "") or now_iso
            item_id = _make_item_id("rss", feed_id, title, url)
            summary = _normalize_text(getattr(rss_item, "summary", "") or title)
            items.append({
                "trendradar_id": item_id,
                "title": title,
                "content": summary,
                "url": url,
                "published": published,
                "source": f"trendradar_rss_{feed_id}",
                "type": "rss",
                "source_kind": "rss",
                "source_id": feed_id,
                "source_name": feed_name,
                "rank": idx,
                "score": max(0, 80 - idx),
                "first_seen": published,
                "last_seen": now_iso,
                "matched_reason": f"{feed_name} RSS",
            })
    return items, list(data.failed_ids or [])


def _load_cached_ai_tags(ai_filter: Any, interests_content: str, interests_file: str, user_data_dir: Optional[str]) -> List[Dict[str, Any]]:
    paths = _get_user_paths(user_data_dir)
    current_hash = ai_filter.compute_interests_hash(interests_content, interests_file)
    cache = _read_json(paths["ai_filter_cache"], {})
    cached_tags = cache.get("tags") if cache.get("interests_hash") == current_hash else None
    if isinstance(cached_tags, list) and cached_tags:
        return [
            {
                "id": idx,
                "tag": str(tag.get("tag", "")).strip(),
                "description": str(tag.get("description", "")).strip(),
                "priority": _coerce_int(tag.get("priority"), idx, minimum=1),
            }
            for idx, tag in enumerate(cached_tags, 1)
            if str(tag.get("tag", "")).strip()
        ]

    tags = ai_filter.extract_tags(interests_content)
    normalized = [
        {
            "id": idx,
            "tag": str(tag.get("tag", "")).strip(),
            "description": str(tag.get("description", "")).strip(),
            "priority": idx,
        }
        for idx, tag in enumerate(tags or [], 1)
        if str(tag.get("tag", "")).strip()
    ]
    if normalized:
        _write_json(paths["ai_filter_cache"], {
            "interests_hash": current_hash,
            "interests_file": interests_file,
            "tags": normalized,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    return normalized


def _apply_ai_filter(items: List[Dict[str, Any]], config: Dict[str, Any], user_data_dir: Optional[str]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    if not items:
        return [], {"enabled": True, "total_processed": 0, "total_matched": 0, "tags": []}

    _ensure_trendradar_path()
    try:
        from trendradar.ai.filter import AIFilter
    except Exception as exc:
        raise ValueError(f"TrendRadar AI 筛选运行时不可用：{exc}") from exc

    source_cfg = _load_yaml(TRENDRADAR_ROOT / "config" / "config.yaml")
    ai_config = _build_ai_runtime_config(config, source_cfg)
    if not ai_config.get("MODEL"):
        raise ValueError("AI 筛选需要模型配置：请在 Settings 的发现/搜索能力中配置模型，或设置 AI_MODEL。")

    filter_config = _build_ai_filter_runtime_config(config, source_cfg)
    interests_file = filter_config.get("INTERESTS_FILE") or "ai_interests.txt"
    debug = _coerce_bool(config.get("debug"), source_cfg.get("advanced", {}).get("debug", False))

    old_stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        ai_filter = AIFilter(ai_config, filter_config, lambda: datetime.now(timezone.utc), debug)
        interests_content = ai_filter.load_interests_content(filter_config.get("INTERESTS_FILE"))
        if not interests_content:
            raise ValueError(f"AI 筛选兴趣描述文件不可用：{interests_file}")

        tags = _load_cached_ai_tags(ai_filter, interests_content, interests_file, user_data_dir)
        if not tags:
            raise ValueError("AI 筛选未能提取兴趣标签，请检查 Settings 的模型配置和 TrendRadar ai_filter 提示词。")

        title_payload: List[Dict[str, Any]] = []
        id_to_item: Dict[int, Dict[str, Any]] = {}
        for idx, item in enumerate(items, 1):
            title = _normalize_text(item.get("title") or item.get("content") or "")
            if not title:
                continue
            id_to_item[idx] = item
            title_payload.append({
                "id": idx,
                "title": title,
                "source": _normalize_text(item.get("source_name") or item.get("source") or ""),
            })

        batch_size = _coerce_int(filter_config.get("BATCH_SIZE"), 200, minimum=1, maximum=500)
        batch_interval = _coerce_float(filter_config.get("BATCH_INTERVAL"), 0, minimum=0)
        failed_batches = 0
        all_results: List[Dict[str, Any]] = []
        for start in range(0, len(title_payload), batch_size):
            if start > 0 and batch_interval > 0:
                import time
                time.sleep(batch_interval)
            batch = title_payload[start:start + batch_size]
            batch_results = ai_filter.classify_batch(batch, tags, interests_content)
            if batch_results is None:
                failed_batches += 1
                continue
            all_results.extend(batch_results)
    finally:
        sys.stdout = old_stdout

    min_score = _coerce_float(filter_config.get("MIN_SCORE"), 0, minimum=0.0, maximum=1.0)
    tag_by_id = {tag["id"]: tag for tag in tags}
    best_by_item: Dict[int, Dict[str, Any]] = {}
    for result in all_results:
        item_id = result.get("news_item_id")
        tag_id = result.get("tag_id")
        if item_id not in id_to_item or tag_id not in tag_by_id:
            continue
        score = _coerce_float(result.get("relevance_score"), 0.0, minimum=0.0, maximum=1.0)
        if score < min_score:
            continue
        existing = best_by_item.get(item_id)
        if not existing or score > existing["relevance_score"]:
            best_by_item[item_id] = {"tag_id": tag_id, "relevance_score": score}

    filtered: List[Dict[str, Any]] = []
    tag_counts: Dict[int, int] = {}
    for item_id, match in best_by_item.items():
        tag = tag_by_id[match["tag_id"]]
        score = match["relevance_score"]
        tag_counts[tag["id"]] = tag_counts.get(tag["id"], 0) + 1
        item = dict(id_to_item[item_id])
        item["ai_filter_tag"] = tag["tag"]
        item["ai_filter_score"] = score
        item["_ai_filter_priority"] = tag.get("priority", 9999)
        item["matched_reason"] = f"AI 筛选：{tag['tag']}（score {score:.2f}）"
        item["score"] = max(_coerce_int(item.get("score"), 0), int(score * 100))
        filtered.append(item)

    if _coerce_bool(config.get("filter_priority_sort_enabled"), True):
        filtered.sort(key=lambda item: (
            item.get("_ai_filter_priority") or 9999,
            -float(item.get("ai_filter_score") or 0),
            item.get("rank") or 9999,
        ))
    else:
        filtered.sort(key=lambda item: (
            -float(item.get("ai_filter_score") or 0),
            item.get("rank") or 9999,
            item.get("source_name") or "",
        ))
    for item in filtered:
        item.pop("_ai_filter_priority", None)

    tag_summary = [
        {"tag": tag["tag"], "count": tag_counts.get(tag["id"], 0)}
        for tag in sorted(tags, key=lambda tag: tag.get("priority", 9999))
        if tag_counts.get(tag["id"], 0) > 0
    ]
    return filtered, {
        "enabled": True,
        "total_processed": len(title_payload),
        "total_matched": len(filtered),
        "failed_batches": failed_batches,
        "model": ai_config.get("MODEL", ""),
        "interests_file": interests_file,
        "tags": tag_summary,
    }


def _apply_report_limits(items: List[Dict[str, Any]], config: Dict[str, Any]) -> List[Dict[str, Any]]:
    max_per_topic = _coerce_int(config.get("max_news_per_keyword"), 0, minimum=0, maximum=100)
    if max_per_topic <= 0:
        return items
    counts: Dict[str, int] = {}
    limited: List[Dict[str, Any]] = []
    has_ai_topics = any(item.get("ai_filter_tag") for item in items)
    if not has_ai_topics:
        return items
    for item in items:
        topic = str(item.get("ai_filter_tag") or "")
        if not topic:
            limited.append(item)
            continue
        current = counts.get(topic, 0)
        if current >= max_per_topic:
            continue
        counts[topic] = current + 1
        limited.append(item)
    return limited


def _append_standalone_items(
    filtered_items: List[Dict[str, Any]],
    all_items: List[Dict[str, Any]],
    config: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    if not _coerce_bool(config.get("display_standalone_enabled"), False):
        return filtered_items, {"enabled": False, "added": 0}

    platform_ids = set(_coerce_list(config.get("standalone_platforms")))
    rss_ids = set(_coerce_list(config.get("standalone_rss_feeds")))
    max_items = _coerce_int(config.get("standalone_max_items"), 5, minimum=1, maximum=50)
    if not platform_ids and not rss_ids:
        return filtered_items, {"enabled": True, "added": 0}

    existing_ids = {item.get("trendradar_id") for item in filtered_items if item.get("trendradar_id")}
    additions: List[Dict[str, Any]] = []
    sorted_candidates = sorted(
        all_items,
        key=lambda item: (
            -(item.get("score") or 0),
            item.get("rank") or 9999,
            item.get("source_name") or "",
        ),
    )
    for item in sorted_candidates:
        item_id = item.get("trendradar_id")
        if item_id in existing_ids:
            continue
        source_id = str(item.get("source_id") or "")
        source_kind = item.get("source_kind")
        if source_kind == "platform" and source_id not in platform_ids:
            continue
        if source_kind == "rss" and source_id not in rss_ids:
            continue
        next_item = dict(item)
        next_item["standalone"] = True
        next_item["matched_reason"] = f"独立展示：{next_item.get('source_name') or source_id}"
        additions.append(next_item)
        if item_id:
            existing_ids.add(item_id)
        if len(additions) >= max_items:
            break

    return filtered_items + additions, {
        "enabled": True,
        "added": len(additions),
        "platforms": sorted(platform_ids),
        "rss_feeds": sorted(rss_ids),
        "max_items": max_items,
    }


def _apply_light_filters(items: List[Dict[str, Any]], config: Dict[str, Any], user_data_dir: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    # TrendRadar owns the data source; this adapter applies UI-facing limits and v6.10 AI filtering.
    sorted_items = sorted(
        items,
        key=lambda item: (
            -(item.get("score") or 0),
            item.get("rank") or 9999,
            item.get("source_name") or "",
        ),
    )
    if config.get("filter_method") == "ai":
        filtered, meta = _apply_ai_filter(sorted_items, config, user_data_dir)
        limited = _apply_report_limits(filtered, config)
        if len(limited) != len(filtered):
            meta = {**meta, "report_limited": len(filtered) - len(limited), "total_returned": len(limited)}
        return limited, meta
    return sorted(
        items,
        key=lambda item: (
            -(item.get("score") or 0),
            item.get("rank") or 9999,
            item.get("source_name") or "",
        ),
    ), {"enabled": False, "method": "keyword"}


def run_once(config_override: Optional[Dict[str, Any]] = None, user_data_dir: Optional[str] = None) -> Dict[str, Any]:
    config = get_config_view(user_data_dir)
    config.update(config_override or {})

    platform_items: List[Dict[str, Any]] = []
    failed_sources: List[str] = []
    if config.get("platforms_enabled", True) and config.get("enabled_platforms"):
        results, id_to_name, failed_ids = fetch_trending(
            platform_ids=config.get("enabled_platforms"),
            proxy_url=config.get("proxy_url") if config.get("proxy_enabled") else None,
            api_url=config.get("api_url") or None,
            request_interval=_coerce_int(config.get("crawler_request_interval"), 2000, minimum=0),
        )
        platform_items = _normalize_platform_results(
            results,
            id_to_name,
            int(config.get("max_items_per_source", 30) or 30),
        )
        failed_sources.extend(failed_ids or [])

    rss_items, rss_failed = _fetch_rss_items(config)
    failed_sources.extend(rss_failed)
    all_items = platform_items + rss_items
    items, filter_meta = _apply_light_filters(all_items, config, user_data_dir)
    items, standalone_meta = _append_standalone_items(items, all_items, config)
    generated_at = datetime.now(timezone.utc).isoformat()
    if filter_meta.get("enabled") and filter_meta.get("tags"):
        topics = [{"name": tag["tag"], "count": tag["count"]} for tag in filter_meta["tags"]]
    else:
        topics = get_topics_from_items(items)
    meta = {
        "generated_at": generated_at,
        "failed_sources": failed_sources,
        "platform_count": len(set(i.get("source_id") for i in platform_items)),
        "rss_count": len(set(i.get("source_id") for i in rss_items)),
        "item_count": len(items),
        "topics": topics,
        "ai_filter": filter_meta,
        "standalone": standalone_meta,
        "config": {k: config.get(k) for k in [
            "filter_method", "max_items_per_source", "freshness_days", "rss_freshness_enabled",
            "enabled_platforms", "enabled_rss_feeds", "crawler_request_interval",
            "rss_request_interval", "rss_timeout", "ai_filter_min_score",
            "ai_filter_batch_size", "ai_interests_file", "report_mode", "report_display_mode",
            "max_news_per_keyword", "display_standalone_enabled", "standalone_platforms",
            "standalone_rss_feeds", "standalone_max_items",
        ]},
    }
    result = {"success": True, "items": items, "fetch_contents": items, "meta": meta}
    paths = _get_user_paths(user_data_dir)
    _write_json(paths["latest"], result)
    _write_json(paths["status"], {
        "status": "idle",
        "updated_at": generated_at,
        "latestRunAt": generated_at,
        "latestItemCount": len(items),
        "lastError": None,
    })
    return result


def get_latest(user_data_dir: Optional[str] = None) -> Dict[str, Any]:
    return _read_json(_get_user_paths(user_data_dir)["latest"], {"success": True, "items": [], "fetch_contents": [], "meta": {}})


def get_topics_from_items(items: List[Dict[str, Any]], top_n: int = 12) -> List[Dict[str, Any]]:
    counts: Dict[str, int] = {}
    for item in items:
        name = _normalize_text(item.get("source_name") or item.get("source") or "未知来源")
        counts[name] = counts.get(name, 0) + 1
    return [
        {"name": name, "count": count}
        for name, count in sorted(counts.items(), key=lambda pair: pair[1], reverse=True)[:top_n]
    ]


def get_topics(user_data_dir: Optional[str] = None) -> Dict[str, Any]:
    latest = get_latest(user_data_dir)
    return {"success": True, "topics": get_topics_from_items(latest.get("items", []))}


def get_status(user_data_dir: Optional[str] = None) -> Dict[str, Any]:
    lock = get_lock_info()
    paths = _get_user_paths(user_data_dir)
    status = _read_json(paths["status"], {})
    runtime = _runtime_health()
    return {
        "available": TRENDRADAR_ROOT.exists(),
        "adapterAvailable": runtime.get("adapterAvailable", False),
        "fullRuntimeAvailable": runtime.get("fullRuntimeAvailable", False),
        "runtimeBlocked": runtime.get("runtimeBlocked", False),
        "runtimeBlocker": runtime.get("runtimeBlocker", ""),
        "pythonRequirement": runtime.get("pythonRequirement", ""),
        "pythonCompatible": runtime.get("pythonCompatible", True),
        "missingDependencies": runtime.get("missingDependencies", []),
        "processRunning": False,
        "status": status.get("status", "ready" if TRENDRADAR_ROOT.exists() else "missing"),
        "localVersion": _read_local_version(),
        "lockedVersion": lock.get("version"),
        "lockedCommit": lock.get("commit"),
        "pythonVersion": runtime.get("pythonVersion"),
        "pythonExecutable": runtime.get("pythonExecutable"),
        "userDataDir": str(paths["root"]),
        "latestRunAt": status.get("latestRunAt"),
        "latestItemCount": status.get("latestItemCount"),
        "lastError": status.get("lastError"),
    }


def check_update() -> Dict[str, Any]:
    lock = get_lock_info()
    local_version = _read_local_version()
    local_commit = ""
    try:
        local_commit = subprocess.check_output(
            ["git", "-C", str(TRENDRADAR_ROOT), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        pass
    try:
        remote_version = _fetch_text("https://raw.githubusercontent.com/sansan0/TrendRadar/master/version").strip()
        remote_configs_text = _fetch_text("https://raw.githubusercontent.com/sansan0/TrendRadar/master/version_configs")
        pyproject_text = _fetch_text("https://raw.githubusercontent.com/sansan0/TrendRadar/master/pyproject.toml")
        remote_req_match = re.search(r'requires-python\s*=\s*"([^"]+)"', pyproject_text)
        remote_requirement = remote_req_match.group(1) if remote_req_match else ""
        remote_configs = {}
        for line in remote_configs_text.splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                remote_configs[k.strip()] = v.strip()
        runtime = _runtime_health()
        python_version = runtime["pythonVersion"]
        blocked = not _python_satisfies(remote_requirement, python_version)
        blockers = []
        if blocked:
            blockers.append(f"TrendRadar {remote_version} 要求 Python {remote_requirement}，当前为 {python_version}")
        if runtime.get("missingDependencies"):
            blockers.append(f"当前 TrendRadar 完整运行时缺少依赖：{', '.join(runtime['missingDependencies'])}")
        return {
            "success": True,
            "localVersion": local_version,
            "remoteVersion": remote_version,
            "lockedVersion": lock.get("version"),
            "localCommit": local_commit,
            "lockedCommit": lock.get("commit"),
            "remoteConfigVersions": remote_configs,
            "pythonVersion": python_version,
            "pythonRequirement": runtime.get("pythonRequirement", ""),
            "pythonCompatible": runtime.get("pythonCompatible", True),
            "missingDependencies": runtime.get("missingDependencies", []),
            "fullRuntimeAvailable": runtime.get("fullRuntimeAvailable", False),
            "remotePythonRequirement": remote_requirement,
            "updateAvailable": bool(remote_version and local_version and remote_version != local_version),
            "blocked": bool(blockers),
            "blocker": "；".join(blockers),
        }
    except Exception as exc:
        return {
            "success": False,
            "localVersion": local_version,
            "lockedVersion": lock.get("version"),
            "localCommit": local_commit,
            "lockedCommit": lock.get("commit"),
            "updateAvailable": False,
            "blocked": False,
            "error": str(exc),
        }


def update_dependency(ref: str = "latest", install_deps: bool = False, dry_run: bool = False) -> Dict[str, Any]:
    update = check_update()
    runtime = _runtime_health()
    if not runtime.get("pythonCompatible", True):
        return {**update, "success": False}
    if update.get("blocked") and not install_deps:
        return {**update, "success": False}
    if dry_run:
        return {**update, "dryRun": True}
    if not TRENDRADAR_ROOT.exists():
        return {"success": False, "error": "engine/trendradar 不存在，请先运行同步脚本"}
    status = subprocess.run(
        ["git", "-C", str(TRENDRADAR_ROOT), "status", "--porcelain"],
        text=True,
        capture_output=True,
    )
    if status.stdout.strip():
        backup_dir = _get_user_paths(None)["backup"] / datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir.mkdir(parents=True, exist_ok=True)
        (backup_dir / "dirty-status.txt").write_text(status.stdout, encoding="utf-8")
        return {"success": False, "error": f"TrendRadar 有本地改动，已记录到 {backup_dir}", "dirty": True}
    target = "origin/master" if ref == "latest" else ref
    subprocess.check_call(["git", "-C", str(TRENDRADAR_ROOT), "fetch", "origin"])
    subprocess.check_call(["git", "-C", str(TRENDRADAR_ROOT), "checkout", target])
    if install_deps:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-e", str(TRENDRADAR_ROOT)])
    return {**check_update(), "success": True}


def fetch_trending(
    platform_ids: Optional[List[str]] = None,
    proxy_url: Optional[str] = None,
    api_url: Optional[str] = None,
    request_interval: int = 100,
) -> Tuple[Dict[str, Dict], Dict[str, str], List[str]]:
    """
    使用 TrendRadar 的 DataFetcher 拉取热榜原始数据。

    TrendRadar 的 fetcher.py 内部有 print() 调用，
    这里临时将 stdout 重定向到 stderr，避免污染 fetch 节点的 JSON 输出。

    Args:
        platform_ids: 要拉取的平台 ID 列表。None 时使用 config.yaml 中的全部平台。
        proxy_url: 代理地址（可选）
        api_url: 自定义 API 地址（可选）
        request_interval: 请求间隔（毫秒）

    Returns:
        (results, id_to_name, failed_ids)
        - results:  {platform_id: {title: {"ranks": [...], "url": "", "mobileUrl": ""}}}
        - id_to_name: {platform_id: display_name}
        - failed_ids: 拉取失败的平台 ID 列表
    """
    DataFetcher = get_data_fetcher()
    fetcher = DataFetcher(proxy_url=proxy_url, api_url=api_url)

    # 构建 ids_list：[(id, name), ...]
    platforms = load_trendradar_platforms()
    platform_map = {p["id"]: p["name"] for p in platforms}

    if platform_ids is None:
        platform_ids = [p["id"] for p in platforms]

    ids_list = [(pid, platform_map.get(pid, pid)) for pid in platform_ids]

    # 临时重定向 stdout → stderr，因为 TrendRadar fetcher.py 内部有 print()
    # 而 fetch 节点通过 stdout 返回 JSON 给 Electron
    old_stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        results, id_to_name, failed_ids = fetcher.crawl_websites(
            ids_list=ids_list,
            request_interval=request_interval,
        )
    finally:
        sys.stdout = old_stdout

    return results, id_to_name, failed_ids


def fetch_trending_as_items(
    platform_ids: Optional[List[str]] = None,
    max_items_per_platform: int = 30,
    use_cache: bool = True,
    cache_max_age_seconds: int = 3600,
    **kwargs,
) -> List[Dict[str, Any]]:
    """
    拉取热榜并转换为 auto-podcast fetch 节点的标准格式。

    优先从 daemon 缓存读取（如果 daemon 正在运行且数据新鲜），
    缓存不可用时回退到实时 API 调用。

    Args:
        platform_ids: 要拉取的平台 ID 列表
        max_items_per_platform: 每个平台最多返回的条目数
        use_cache: 是否优先使用 daemon 缓存（默认 True）
        cache_max_age_seconds: 缓存最大有效期（秒，默认 1 小时）
        **kwargs: 传递给 fetch_trending 的其他参数

    Returns:
        标准格式的热榜条目列表
    """
    # 尝试从 daemon 缓存读取
    if use_cache:
        items = _try_read_daemon_cache(platform_ids, max_items_per_platform, cache_max_age_seconds)
        if items is not None:
            return items

    # 回退：实时 API 调用
    results, id_to_name, failed_ids = fetch_trending(
        platform_ids=platform_ids, **kwargs
    )

    return convert_raw_to_items(results, id_to_name, max_items_per_platform)


def convert_raw_to_items(
    results: Dict[str, Dict],
    id_to_name: Dict[str, str],
    max_items_per_platform: int = 30,
) -> List[Dict[str, Any]]:
    """
    将 TrendRadar 原始爬取结果转换为 fetch 节点标准格式。

    这是 bridge 和 daemon 共用的转换逻辑（DRY 提取）。
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    items: List[Dict[str, Any]] = []

    for platform_id, titles_data in results.items():
        platform_name = _normalize_text(id_to_name.get(platform_id, platform_id))
        rank = 0

        for title, title_info in titles_data.items():
            title_text = _normalize_text(title)
            rank += 1
            if rank > max_items_per_platform:
                break

            url = title_info.get("url", "") or title_info.get("mobileUrl", "")
            ranks = title_info.get("ranks", [])
            rank_str = f"#{ranks[0]}" if ranks else f"#{rank}"

            items.append({
                "title": title_text,
                "content": f"[{platform_name} {rank_str}] {title_text}",
                "url": str(url),
                "published": now_iso,
                "source": f"trendradar_{platform_id}",
                "type": "hotlist",
                "platform_id": platform_id,
                "platform_name": platform_name,
                "rank": ranks[0] if ranks else rank,
            })

    return items


DAEMON_DATA_DIR = ENGINE_DIR / "trendradar_data"
_DAEMON_LATEST_FILE = DAEMON_DATA_DIR / "latest.json"


def _try_read_daemon_cache(
    platform_ids: Optional[List[str]],
    max_items_per_platform: int,
    max_age_seconds: int,
) -> Optional[List[Dict[str, Any]]]:
    """
    尝试从 daemon 的 latest.json 读取缓存数据。
    如果缓存不存在或过期，返回 None（调用方回退到实时爬取）。
    """
    if not _DAEMON_LATEST_FILE.exists():
        return None

    try:
        data = json.loads(_DAEMON_LATEST_FILE.read_text(encoding="utf-8"))

        crawled_at = data.get("crawled_at", "")
        if crawled_at:
            crawl_time = datetime.fromisoformat(crawled_at)
            age = (datetime.now(timezone.utc) - crawl_time).total_seconds()
            if age > max_age_seconds:
                _log(f"[bridge] Daemon cache expired ({age:.0f}s > {max_age_seconds}s), falling back to live fetch")
                return None

        raw_items = data.get("items", [])
        if not raw_items:
            return None

        # 过滤平台和条目数
        platform_ids_set = set(platform_ids) if platform_ids else None
        platform_counts: Dict[str, int] = {}
        items: List[Dict[str, Any]] = []

        for item in raw_items:
            pid = item.get("platform_id", "")
            if platform_ids_set and pid not in platform_ids_set:
                continue
            count = platform_counts.get(pid, 0)
            if count >= max_items_per_platform:
                continue
            platform_counts[pid] = count + 1

            items.append({
                "title": item["title"],
                "content": item["content"],
                "url": item["url"],
                "published": item["published"],
                "source": item["source"],
                "type": item["type"],
            })

        _log(f"[bridge] Using daemon cache ({len(items)} items, crawled {crawled_at})")
        return items

    except Exception as e:
        _log(f"[bridge] Failed to read daemon cache: {e}")
        return None


def get_daemon_status() -> Dict[str, Any]:
    """获取 daemon 守护进程状态，供前端/Electron 查询。"""
    status_file = DAEMON_DATA_DIR / "status.json"
    if not status_file.exists():
        return {"status": "not_running"}
    try:
        return json.loads(status_file.read_text(encoding="utf-8"))
    except Exception:
        return {"status": "unknown"}
