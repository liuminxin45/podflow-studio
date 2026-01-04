# -*- coding: utf-8 -*-
"""
Segment Script Generator（保持接口不变：可直接替换）

注意：本文件只负责“分段组装 + 逐段调用 LLM”。
你项目里如果已经有自己的 LLMClient，请保持 generate(system,user,temperature) 接口一致即可。

支持三类可调参数（全部为可选覆盖，不影响旧调用）：
- humor_level: 0-3
- brief_density: short/long
- persona_preset: 使用 prompts.py 内置预设（balanced/warm/spicy）
- persona: 自定义 HostPersona（优先级最高）
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, replace
from typing import List, Optional, Protocol, Dict

from src.llm.templates.prompts import (
    ShowConfig,
    NewsItem,
    HostPersona,
    PRESET_PERSONAS,
    SYSTEM_PROMPT,
    build_opening_prompt,
    build_history_prompt,
    build_brief_news_prompt,
    build_deep_dive_prompt,
    build_outro_prompt,
)


# =========================
# 0) LLM Client 接口
# =========================

class LLMClient(Protocol):
    def generate(self, *, system: str, user: str, temperature: float = 0.7) -> str:
        ...


class MockLLMClient:
    """开发时占位：不调用模型，仅回显 user prompt。"""
    def generate(self, *, system: str, user: str, temperature: float = 0.7) -> str:
        return (
            "【Mock 输出】\n"
            "（这里应替换为真实 L L M 输出）\n\n"
            f"--- user prompt ---\n{user}\n"
        )


# =========================
# 1) 段落定义
# =========================

@dataclass
class Segment:
    segment_id: str
    title: str
    prompt: str
    temperature: float = 0.7


# =========================
# 2) 生成器
# =========================

class SegmentScriptGenerator:
    def __init__(
        self,
        llm: LLMClient,
        config: Optional[ShowConfig] = None,
    ) -> None:
        self.llm = llm
        self.config = config or ShowConfig()

    def _config_with_overrides(
        self,
        *,
        humor_level: Optional[int] = None,
        brief_density: Optional[str] = None,
        persona_preset: Optional[str] = None,
        persona: Optional[HostPersona] = None,
    ) -> ShowConfig:
        cfg = self.config

        if humor_level is not None:
            cfg = replace(cfg, humor_level=int(humor_level))

        if brief_density is not None:
            bd = str(brief_density).lower().strip()
            if bd not in ("short", "long"):
                bd = cfg.brief_density
            cfg = replace(cfg, brief_density=bd)

        if persona is not None:
            cfg = replace(cfg, persona=persona)

        if persona_preset is not None:
            pp = str(persona_preset).strip()
            if pp and pp in PRESET_PERSONAS:
                cfg = replace(cfg, persona_preset=pp, persona=None)
            elif pp:
                cfg = replace(cfg, persona_preset=cfg.persona_preset)

        return cfg

    def build_segments(
        self,
        *,
        cfg: ShowConfig,
        date_line: str,
        weekday_line: Optional[str],
        lunar_line: Optional[str],
        tease_points: List[str],
        history_event: str,
        news_items: List[NewsItem],
        deep_topic: str,
        deep_facts: str,
        outro_hint: str,
        cta_hint: Optional[str] = None,
    ) -> List[Segment]:
        segs: List[Segment] = []

        segs.append(
            Segment(
                segment_id="opening",
                title="开机自检（开场）",
                prompt=build_opening_prompt(cfg, date_line, lunar_line, weekday_line, tease_points),
                temperature=0.6,
            )
        )

        segs.append(
            Segment(
                segment_id="history",
                title="时间倒带（历史上的今天）",
                prompt=build_history_prompt(cfg, history_event),
                temperature=0.7,
            )
        )

        segs.append(
            Segment(
                segment_id="briefs",
                title="快进快讯（资讯串讲）",
                prompt=build_brief_news_prompt(cfg, news_items),
                temperature=0.6,
            )
        )

        segs.append(
            Segment(
                segment_id="deep_dive",
                title="慢放一条（深度拆解）",
                prompt=build_deep_dive_prompt(cfg, deep_topic, deep_facts),
                temperature=0.7,
            )
        )

        segs.append(
            Segment(
                segment_id="outro",
                title="关机前一句（收尾）",
                prompt=build_outro_prompt(cfg, outro_hint, cta_hint=cta_hint),
                temperature=0.6,
            )
        )

        return segs

    def render(
        self,
        *,
        date_line: str,
        weekday_line: Optional[str] = None,
        lunar_line: Optional[str] = None,
        tease_points: Optional[List[str]] = None,
        history_event: str,
        news_items: List[NewsItem],
        deep_topic: str,
        deep_facts: str,
        outro_hint: str = "明天我们再展开",
        cta_hint: Optional[str] = "喜欢这种A I切片的话，点个关注，就当给我充电。",
        # 旋钮：可按每一期覆盖（不影响旧调用）
        humor_level: Optional[int] = None,
        brief_density: Optional[str] = None,
        persona_preset: Optional[str] = None,
        persona: Optional[HostPersona] = None,
    ) -> Dict[str, str]:
        """
        返回：
          {
            "full_script": "...",
            "opening": "...",
            ...
          }
        """
        cfg = self._config_with_overrides(
            humor_level=humor_level,
            brief_density=brief_density,
            persona_preset=persona_preset,
            persona=persona,
        )

        # 如果未提供 tease_points，就从 news_items 标题里取前 6 条做信息地图
        if not tease_points:
            tease_points = [it.title.strip() for it in news_items[:6]]

        segments = self.build_segments(
            cfg=cfg,
            date_line=date_line,
            weekday_line=weekday_line,
            lunar_line=lunar_line,
            tease_points=tease_points,
            history_event=history_event,
            news_items=news_items,
            deep_topic=deep_topic,
            deep_facts=deep_facts,
            outro_hint=outro_hint,
            cta_hint=cta_hint,
        )

        outputs: Dict[str, str] = {}
        parts: List[str] = []

        for seg in segments:
            text = self.llm.generate(
                system=SYSTEM_PROMPT,
                user=seg.prompt,
                temperature=seg.temperature,
            ).strip()
            outputs[seg.segment_id] = text
            parts.append(text)

        outputs["full_script"] = "\n\n".join([p for p in parts if p])
        return outputs


# =========================
# 3) Demo 数据（保留）
# =========================

def demo_inputs() -> Dict:
    news_items = [
        NewsItem(
            title="智能眼镜首次纳入国补",
            facts="首批625亿国补资金下达，明年补贴范围扩大到智能眼镜等。",
            context="对消费者来说，可能意味着入手门槛下降；对品牌来说，是一波抢位战。",
        ),
        NewsItem(
            title="宇树科技线下首店北京开业",
            facts="线下门店集中展示四足机器狗与人形机器人等产品。",
            context="机器人从展会走进商场，是‘能看见的商业化’。",
        ),
        NewsItem(
            title="必胜客开始卖烤串做夜宵",
            facts="部分门店新增夜宵时段与烤串菜单，价格贴近连锁烧烤。",
            context="餐饮巨头在用‘第二曲线’对抗存量竞争。",
        ),
        NewsItem(
            title="国产载人飞艇拿到生产许可证",
            facts="祥云A700取得全国首张国产载人飞艇生产许可证。",
            context="低空经济从概念走向交付，接下来拼的是场景。",
        ),
    ]

    return dict(
        date_line="2026年1月4日",
        weekday_line="星期日",
        lunar_line=None,
        tease_points=[
            "国补把智能眼镜也算进来了",
            "机器人开店，离日常更近一步",
            "必胜客卖烤串，夜宵开始内卷",
            "飞艇拿到准生证，低空要进城",
        ],
        history_event="在1996年的12月31日，波音与麦道宣布合并，这被很多人视作行业格局的一次改写，也给后来的文化磨合埋下伏笔。",
        news_items=news_items,
        deep_topic="载人飞艇为什么突然火了",
        deep_facts=(
            "素材要点：取得生产许可证；可载10人，航时可达10小时；"
            "优势是低空慢速、短距起降；安全依赖材料、冗余与试飞验证；"
            "主要场景包括低空观光、城市安保与巡检、应急通信与物资投送。"
        ),
        outro_hint="明天我们再展开",
        cta_hint="如果你觉得有用，点个关注，咱们每天一起把信息切一下。",
    )


# =========================
# 4) CLI（保留）
# =========================

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="运行 demo（使用 MockLLM）")
    parser.add_argument("--humor", type=int, default=None, help="幽默度 0-3（覆盖 config）")
    parser.add_argument("--density", type=str, default=None, help="快讯密度 short/long（覆盖 config）")
    parser.add_argument(
        "--persona",
        type=str,
        default=None,
        help=f"主持人个性预设（覆盖 config）。可选：{', '.join(PRESET_PERSONAS.keys())}",
    )
    args = parser.parse_args()

    if args.demo:
        llm = MockLLMClient()
        gen = SegmentScriptGenerator(llm=llm, config=ShowConfig())
        out = gen.render(**demo_inputs(), humor_level=args.humor, brief_density=args.density, persona_preset=args.persona)
        print(out["full_script"])
        return

    print("请在你的工程中引入 SegmentScriptGenerator，并传入真实的 LLMClient。")


if __name__ == "__main__":
    main()
