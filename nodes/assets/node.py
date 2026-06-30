import os
from pathlib import Path
from typing import Any
from nodes.assets.config import AssetsConfig
from protocol.node_runner import NodeContext


def run(state: dict[str, Any], config: AssetsConfig = None) -> dict[str, Any]:
    config = config or AssetsConfig()
    ctx = NodeContext("AssetsNode", state)
    ctx.log_start(f"配置: generate_cover={config.generate_cover}, output_dir={config.output_dir}")

    try:
        Path(config.output_dir).mkdir(parents=True, exist_ok=True)
        episode_id = state.get("episode_id", "unknown")

        if config.generate_cover:
            ctx.log("生成封面中...")
            cover_path = _generate_cover(episode_id, state, config)
            state["cover_path"] = cover_path
            ctx.log(f"封面生成完成: {cover_path}")
        else:
            ctx.log("跳过封面生成 (generate_cover=False)")
    except Exception as e:
        ctx.add_error("assets", str(e))
        ctx.log(f"✗ 错误: {str(e)}")

    ctx.log_end(f"输出: cover_path={state.get('cover_path', 'N/A')}")
    return ctx.finalize(state)


def _generate_cover(episode_id: str, state: dict, config: AssetsConfig) -> str:
    from PIL import Image, ImageDraw, ImageFont

    w, h = config.cover_size
    img = Image.new("RGB", (w, h), color=(30, 30, 60))
    draw = ImageDraw.Draw(img)

    title = state.get("script", {}).get(
        "title", state.get("selected_topic", {}).get("title", "Podcast")
    )

    try:
        font = ImageFont.truetype("arial.ttf", 60)
    except OSError:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), title, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((w - tw) / 2, (h - th) / 2), title, fill="white", font=font)

    cover_path = os.path.join(config.output_dir, f"{episode_id}_cover.png")
    img.save(cover_path)
    return cover_path
