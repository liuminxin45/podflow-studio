"""build_history_podcasts.py

从已有产物中构建历史播客库（out/history_podcasts）。

目的：为 Retrieval#2 的历史播客检索提供可用语料。

扫描来源：
- out/runs/** 目录下的各种 json 产物（research/script/publish 等）
- out/script/** 目录下的脚本 json

输出格式（HistoryPodcastSearcher 可索引）：
{
  "episode_id": "...",
  "date": "YYYY-MM-DD",
  "title": "...",
  "topics": [...],
  "script": "...",
  "source_path": "..."
}
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, Optional, Tuple


def _safe_read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _extract_script_text(payload: Dict[str, Any]) -> Optional[str]:
    # 1) 常见字段
    for k in (
        "final_podcast_script",
        "final_script",
        "script",
        "podcast_script",
        "ssml",
        "content",
        "text",
    ):
        v = payload.get(k)
        if isinstance(v, str) and v.strip():
            if k == "ssml":
                # 最小可用：去掉标签作为纯文本
                txt = re.sub(r"<[^>]+>", "", v)
                txt = re.sub(r"\s+", " ", txt).strip()
                return txt if txt else None
            return v.strip()

    # 2) 深层字段：enhanced_results 里每个 topic 的 final_script
    enhanced = payload.get("enhanced_results")
    if isinstance(enhanced, dict):
        parts = []
        for _, v in enhanced.items():
            if not isinstance(v, dict):
                continue
            s = v.get("final_script")
            if isinstance(s, str) and s.strip():
                parts.append(s.strip())
        if parts:
            return "\n\n".join(parts)

    # 3) 旧结构：pipeline_v2_enhanced_results
    enhanced2 = payload.get("pipeline_v2_enhanced_results")
    if isinstance(enhanced2, dict):
        parts = []
        for _, v in enhanced2.items():
            if not isinstance(v, dict):
                continue
            s = v.get("final_script")
            if isinstance(s, str) and s.strip():
                parts.append(s.strip())
        if parts:
            return "\n\n".join(parts)

    return None


def _extract_meta(payload: Dict[str, Any], fallback_path: Path) -> Tuple[str, str, str, list]:
    # episode_id
    episode_id = payload.get("episode_id")
    if not isinstance(episode_id, str) or not episode_id.strip():
        episode_id = payload.get("id") if isinstance(payload.get("id"), str) else ""
    episode_id = (episode_id or "").strip() or fallback_path.stem

    # date
    date = payload.get("episode_date") or payload.get("date")
    if not isinstance(date, str) or not date.strip():
        m = re.search(r"(\d{4}-\d{2}-\d{2})", str(fallback_path))
        date = m.group(1) if m else ""
    date = (date or "").strip() or "unknown"

    # title
    title = payload.get("title")
    if not isinstance(title, str) or not title.strip():
        title = payload.get("name") if isinstance(payload.get("name"), str) else ""
    title = (title or "").strip() or fallback_path.stem

    # topics
    topics = payload.get("topics") or payload.get("tags")
    if isinstance(topics, list):
        topics2 = [str(x) for x in topics if str(x).strip()]
    else:
        topics2 = []

    return episode_id, date, title, topics2


def iter_candidate_json_files(base_dirs: Iterable[Path]) -> Iterable[Path]:
    for base in base_dirs:
        if not base.exists():
            continue
        for p in base.rglob("*.json"):
            yield p


def build_history(
    *,
    out_dir: Path,
    max_files: int,
    dry_run: bool,
) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)

    # 扫描 out/runs 和 out/script
    repo_root = Path(__file__).resolve().parent.parent
    scan_dirs = [repo_root / "out" / "runs", repo_root / "out" / "script"]

    written = 0
    seen_keys = set()

    for i, path in enumerate(iter_candidate_json_files(scan_dirs)):
        if max_files > 0 and i >= max_files:
            break

        payload = _safe_read_json(path)
        if not isinstance(payload, dict):
            continue

        script = _extract_script_text(payload)
        if not script:
            continue

        episode_id, date, title, topics = _extract_meta(payload, path)
        key = f"{date}::{episode_id}"
        if key in seen_keys:
            continue
        seen_keys.add(key)

        out_payload = {
            "episode_id": episode_id,
            "date": date,
            "title": title,
            "topics": topics,
            "script": script,
            "source_path": str(path),
        }

        out_name = f"{date}_{episode_id}".replace(":", "-").replace("/", "-")
        out_path = out_dir / f"{out_name}.json"

        if dry_run:
            print(f"[dry-run] would write: {out_path}")
        else:
            try:
                with out_path.open("w", encoding="utf-8") as f:
                    json.dump(out_payload, f, ensure_ascii=False, indent=2)
                written += 1
            except Exception as e:
                print(f"failed to write {out_path}: {e}")

    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="Build out/history_podcasts from existing outputs")
    parser.add_argument("--out-dir", default="out/history_podcasts", help="output dir")
    parser.add_argument("--max-files", type=int, default=0, help="scan at most N json files (0=all)")
    parser.add_argument("--dry-run", action="store_true", help="do not write files")

    args = parser.parse_args()
    out_dir = Path(args.out_dir)

    written = build_history(out_dir=out_dir, max_files=args.max_files, dry_run=bool(args.dry_run))
    print(f"done. written={written} out_dir={out_dir}")


if __name__ == "__main__":
    main()
