import os
import re
from pathlib import Path
from typing import Any

from nodes.assets.config import AssetsConfig
from protocol.node_runner import NodeContext
from protocol.path_utils import safe_path_part as _safe_path_part


_CJK_PATTERN = re.compile(r"[\u3400-\u9fff]")


def _font_candidates(bold: bool) -> list[str]:
    windows_dir = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    preferred = [
        os.environ.get("PODFLOW_COVER_FONT", ""),
        str(windows_dir / ("SourceHanSansSC-Bold.otf" if bold else "SourceHanSansSC-Regular.otf")),
        str(windows_dir / ("msyhbd.ttc" if bold else "msyh.ttc")),
        str(windows_dir / ("simhei.ttf" if bold else "Deng.ttf")),
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/source-han-sans/SourceHanSansSC-Bold.otf" if bold else
        "/usr/share/fonts/opentype/source-han-sans/SourceHanSansSC-Regular.otf",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
    ]
    return [candidate for candidate in preferred if candidate]


def _load_cover_font(size: int, *, bold: bool, sample_text: str):
    from PIL import ImageFont

    has_cjk = bool(_CJK_PATTERN.search(sample_text))
    for candidate in _font_candidates(bold):
        try:
            font = ImageFont.truetype(candidate, size)
            if has_cjk and "DejaVuSans" in candidate:
                continue
            return font
        except OSError:
            continue
    if has_cjk:
        raise RuntimeError(
            "No CJK-capable font was found. Install Microsoft YaHei, Source Han Sans, "
            "or Noto Sans CJK."
        )
    return ImageFont.load_default()


def _text_width(draw, text: str, font) -> int:
    box = draw.textbbox((0, 0), text or " ", font=font)
    return box[2] - box[0]


def _wrap_title(draw, title: str, font, max_width: int) -> list[str]:
    tokens = re.findall(r"\s+|[\u3400-\u9fff]|[^\s\u3400-\u9fff]+", title.strip())
    lines: list[str] = []
    current = ""

    def append_token(token: str) -> None:
        nonlocal current
        if token.isspace():
            if current and not current.endswith(" "):
                current += " "
            return
        candidate = f"{current}{token}".strip() if current else token.strip()
        if not candidate:
            return
        if _text_width(draw, candidate, font) <= max_width:
            current = candidate
            return
        if current:
            lines.append(current.rstrip())
            current = ""
        if _text_width(draw, token.strip(), font) <= max_width:
            current = token.strip()
            return
        for character in token.strip():
            candidate_character = f"{current}{character}"
            if current and _text_width(draw, candidate_character, font) > max_width:
                lines.append(current)
                current = character
            else:
                current = candidate_character

    for token in tokens:
        append_token(token)
    if current:
        lines.append(current.rstrip())
    return lines or ["Podcast"]


def _fit_title(draw, title: str, max_width: int, max_lines: int = 4):
    maximum_size = max(42, round(max_width * 0.105))
    minimum_size = max(28, round(max_width * 0.053))
    size_step = max(2, round(maximum_size * 0.035))
    for size in range(maximum_size, minimum_size - 1, -size_step):
        font = _load_cover_font(size, bold=True, sample_text=title)
        lines = _wrap_title(draw, title, font, max_width)
        if len(lines) <= max_lines:
            return font, lines

    font = _load_cover_font(minimum_size, bold=True, sample_text=title)
    lines = _wrap_title(draw, title, font, max_width)[:max_lines]
    if len(_wrap_title(draw, title, font, max_width)) > max_lines:
        last = lines[-1]
        while last and _text_width(draw, f"{last}…", font) > max_width:
            last = last[:-1]
        lines[-1] = f"{last.rstrip()}…"
    return font, lines


def _cover_date(value: Any) -> str:
    match = re.search(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", str(value or ""))
    if not match:
        return "DAILY EDITION"
    year, month, day = (int(part) for part in match.groups())
    return f"{year:04d}.{month:02d}.{day:02d}"


def run(state: dict[str, Any], config: AssetsConfig = None) -> dict[str, Any]:
    config = config or AssetsConfig()
    ctx = NodeContext("AssetsNode", state)
    ctx.log_start(f"配置: generate_cover={config.generate_cover}, output_dir={config.output_dir}")
    # Do not keep a cover from an earlier run when generation is disabled or fails.
    state["cover_path"] = ""

    try:
        Path(config.output_dir).mkdir(parents=True, exist_ok=True)
        episode_id = _safe_path_part(state.get("episode_id", "unknown"), "unknown")

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
    from PIL import Image, ImageDraw

    w, h = config.cover_size
    if w < 320 or h < 320:
        raise ValueError("cover_size must be at least 320 x 320 pixels")

    background = (244, 241, 234)
    ink = (35, 38, 36)
    muted = (102, 105, 99)
    accent = (218, 104, 72)
    img = Image.new("RGB", (w, h), color=background)
    draw = ImageDraw.Draw(img)

    title = str(
        state.get("edited_script", {}).get("title")
        or state.get("script", {}).get("title")
        or state.get("selected_topic", {}).get("title")
        or "Podcast"
    )
    padding = max(72, round(w * 0.105))
    content_width = w - padding * 2
    label_font = _load_cover_font(max(24, round(w * 0.025)), bold=True, sample_text="晨间简报")
    meta_font = _load_cover_font(max(20, round(w * 0.021)), bold=False, sample_text="每日通勤")
    title_font, title_lines = _fit_title(draw, title, content_width)

    draw.rectangle((0, 0, max(26, round(w * 0.026)), h), fill=ink)
    marker_size = max(30, round(w * 0.032))
    draw.rectangle(
        (padding, padding, padding + marker_size, padding + marker_size),
        fill=accent,
    )
    draw.text(
        (padding + marker_size + round(w * 0.022), padding - 2),
        "PODFLOW · 晨间简报",
        fill=ink,
        font=label_font,
    )
    date_text = _cover_date(state.get("created_at"))
    date_width = _text_width(draw, date_text, meta_font)
    draw.text((w - padding - date_width, padding + 2), date_text, fill=muted, font=meta_font)

    title_y = round(h * 0.31)
    sample_box = draw.textbbox((0, 0), "国Ag", font=title_font)
    line_height = sample_box[3] - sample_box[1]
    line_gap = max(16, round(line_height * 0.22))
    for index, line in enumerate(title_lines):
        draw.text(
            (padding, title_y + index * (line_height + line_gap)),
            line,
            fill=ink,
            font=title_font,
        )

    footer_y = h - padding - round(h * 0.12)
    draw.line((padding, footer_y, w - padding, footer_y), fill=(190, 187, 178), width=2)
    draw.text(
        (padding, footer_y + round(h * 0.035)),
        "单人新闻早报 · 为通勤而作",
        fill=muted,
        font=meta_font,
    )
    brand = "PODFLOW STUDIO"
    brand_width = _text_width(draw, brand, meta_font)
    draw.text(
        (w - padding - brand_width, footer_y + round(h * 0.035)),
        brand,
        fill=ink,
        font=meta_font,
    )

    episode_dir = Path(config.output_dir) / episode_id
    episode_dir.mkdir(parents=True, exist_ok=True)
    cover_path = os.path.join(episode_dir, "cover.png")
    img.save(cover_path)
    return cover_path
