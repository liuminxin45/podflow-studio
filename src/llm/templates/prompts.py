# -*- coding: utf-8 -*-
"""
AI播客文案 Prompt 集合（保持接口不变：可直接替换）

你当前项目依赖：
- prompts.py 导出：SYSTEM_PROMPT / ShowConfig / NewsItem / HostPersona / PRESET_PERSONAS
- prompts.py 提供：spell_out_acronyms + build_opening_prompt/build_history_prompt/build_brief_news_prompt/build_deep_dive_prompt/build_outro_prompt
- segment_generator.py 依赖以上导入，并调用 SegmentScriptGenerator.render()

本版本只改“提示词与结构文案”，不改既有导入/类名/函数签名。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


# =========================
# 0) 全局系统 Prompt
# =========================

SYSTEM_PROMPT = r"""
你是一位中文资讯播客脚本写手，目标是生成【适合 TTS 的口语播客文案】。
节目定位：一档由 A I 参与写作与选题的资讯播客，节奏紧凑但不急促，信息密度高，同时有“民心”的稳定人设。

写作核心：为耳朵写。
- 句子短一点，一个句子一个意思。
- 重要信息先讲，理由后讲。
- 多用自然转场，让听众跟得上。

硬性要求（必须遵守）：
1) 口吻：像主播在聊天，不要播音腔，不要公文风。
2) 可信表达：不编造来源；如果输入没有来源，就不要硬塞“某媒体报道”。可用“公开信息显示/有人算过/有报道提到”。
3) TTS 友好：
   - 大部分句子不超过 25 个字；一口气别太长。
   - 避免连续英文；遇到英文缩写，把字母拆开写：例如 "AI" 写成 "A I"。
   - 数字用阿拉伯数字即可，但不要堆砌；金额可用“元/亿/万”。
   - 不要输出项目符号、表格、代码块、时间戳。
4) 幽默度控制：每段会给“幽默档位 0-3”。必须严格执行。
   - 幽默只能辅助理解，不得抢信息主线。
   - 不要冒犯或刻薄；不要使用脏话、地域/群体刻板印象。
5) 主持人个性一致：每段都会给“主持人人格档案”。
   - 不要在段与段之间突然换人设。
   - 口头禅可以出现 1-2 次即可，别刷屏。
6) 输出只要脚本文案正文，不要写“提示词/分析/大纲/免责声明”。

你会收到：节目配置、日期信息、看点清单、历史事件、资讯列表、深度主题素材。
请严格按每个段落的格式要求输出。
""".strip()


# =========================
# 1) 数据结构
# =========================

@dataclass
class HostPersona:
    """
    主持人个性档案：用于让 LLM 输出稳定的“声音”。
    - voice: 总体气质（冷静/温暖/俏皮/理性/锋利...）
    - pov: 视角/价值观（“站在普通人角度”“反营销话术”...）
    - rhythm: 叙事节奏偏好（短句、转折、停顿感）
    - signature_phrases: 口头禅（可少量出现）
    - banned_phrases: 禁用表达（避免像竞品或太像播音腔）
    """
    name: str
    voice: str
    pov: str
    rhythm: str
    signature_phrases: Tuple[str, ...] = ()
    banned_phrases: Tuple[str, ...] = ()


# 预设人格（可扩充）
# 说明：默认更“清醒拆解 + 生活翻译”，避免竞品用词与节奏完全同款。
PRESET_PERSONAS: Dict[str, HostPersona] = {
    "balanced": HostPersona(
        name="民心·清醒拆解派",
        voice="清爽、克制、偶尔俏皮；不端着，但有判断力。",
        pov="站在普通人和消费者视角，把复杂事翻译成一句能用的话。",
        rhythm="短句推进；先结论后理由；用‘所以呢’把信息落地。",
        signature_phrases=("我把它翻译成一句话", "你可以这么理解", "所以呢", "给你3个可操作点"),
        banned_phrases=(
            "今天的节目您将听到",
            "今天你将会听到",
            "摸鱼早知道",
            "折叠时空",
            "节目最后的消费热新闻",
            "据悉",
            "综上所述",
        ),
    ),
    "warm": HostPersona(
        name="民心·温暖陪伴派",
        voice="更暖、更像朋友聊天；允许轻微自嘲。",
        pov="把资讯当‘生活情报’，少说教，多共情。",
        rhythm="转场更柔和；每条多一句‘你会感受到什么变化’。",
        signature_phrases=("我们换个频道", "别急，我说人话", "这条你记一下"),
        banned_phrases=("摸鱼早知道", "今天的节目您将听到"),
    ),
    "spicy": HostPersona(
        name="民心·清醒犀利派",
        voice="更锋利一点，但不刻薄；吐槽只对现象，不对人。",
        pov="对营销话术更敏感，喜欢拆掉包装看本质。",
        rhythm="先戳破泡沫，再给事实；一句‘关键在这儿’收束。",
        signature_phrases=("别被话术带跑", "关键在这儿", "所以呢"),
        banned_phrases=("摸鱼早知道", "据悉", "综上所述"),
    ),
}


@dataclass
class ShowConfig:
    # 栏目名：明确这是 AI 播客
    show_name: str = "民心A I切片电台"
    host_name: str = "民心"
    tagline: str = "A I先筛一遍，我负责讲成人话。"

    # 旋钮：品牌可调
    humor_level: int = 1          # 0-3
    brief_density: str = "short"  # "short" | "long"

    # 主持人个性：可选 preset + 可选自定义覆盖
    persona_preset: str = "balanced"
    persona: Optional[HostPersona] = None

    # 段落口令（品牌化表达，避免竞品同款词）
    cue_preview: str = "开机自检完成"
    cue_history: str = "时间倒带"
    cue_briefs: str = "快进快讯开始"
    cue_deep: str = "慢放一条"
    cue_wrap: str = "关机前一句"


@dataclass
class NewsItem:
    title: str
    facts: str
    context: Optional[str] = None


# =========================
# 2) 工具：TTS 友好文字与规则
# =========================

def spell_out_acronyms(text: str) -> str:
    """将常见缩写替换为“字母拆读”，避免 TTS 读成奇怪单词。"""
    if not text:
        return text
    mapping = {
        "AI": "A I",
        "CEO": "C E O",
        "GPU": "G P U",
        "CPU": "C P U",
        "AR": "A R",
        "VR": "V R",
        "IP": "I P",
        "PC": "P C",
        "APP": "A P P",
        "Sora": "S o r a",
        "OpenAI": "O p e n A I",
    }
    for k, v in mapping.items():
        text = text.replace(k, v)
    return text


def clamp_humor(level: int) -> int:
    try:
        level = int(level)
    except Exception:
        level = 1
    return max(0, min(3, level))


def brief_length_range(config: ShowConfig) -> Tuple[int, int]:
    """返回快讯每条目标字数区间。"""
    if (config.brief_density or "").lower() == "long":
        return (120, 180)
    return (60, 100)


def humor_guidance_line(level: int) -> str:
    """把幽默档位转成一句可执行的写作指令。"""
    level = clamp_humor(level)
    if level == 0:
        return "幽默档位 0：不吐槽，不拟人化，语气克制，信息直给。"
    if level == 1:
        return "幽默档位 1：轻松自然，允许偶尔俏皮一句，但不影响信息密度。"
    if level == 2:
        return "幽默档位 2：可以明显幽默，允许轻微自嘲或拟人化，但每条最多 1 处。"
    return "幽默档位 3：节奏更有梗，但别油腻；笑点必须服务理解，不许跑题。"


def resolve_persona(config: ShowConfig) -> HostPersona:
    """优先使用 config.persona，否则按 preset 取。"""
    if config.persona is not None:
        return config.persona
    preset = (config.persona_preset or "").strip()
    return PRESET_PERSONAS.get(preset, PRESET_PERSONAS["balanced"])


def persona_guidance_lines(persona: HostPersona) -> str:
    """把主持人人格压缩成短指令，方便放入 prompt。"""
    sig = "；".join(persona.signature_phrases) if persona.signature_phrases else "（无）"
    banned = "；".join(persona.banned_phrases) if persona.banned_phrases else "（无）"
    return (
        f"主持人人格：{persona.name}。"
        f" 气质：{persona.voice}"
        f" 视角：{persona.pov}"
        f" 节奏：{persona.rhythm}"
        f" 口头禅（可少量用）：{sig}。"
        f" 禁用表达：{banned}。"
    )


# =========================
# 3) 段落 Prompt 生成器（函数签名保持不变）
# =========================

def build_opening_prompt(
    config: ShowConfig,
    date_line: str,
    lunar_line: Optional[str],
    weekday_line: Optional[str],
    tease_points: List[str],
) -> str:
    """
    开场：用“开机自检/信息切片”作固定开场，不用竞品句式。
    """
    persona = resolve_persona(config)
    persona_line = persona_guidance_lines(persona)
    humor_line = humor_guidance_line(config.humor_level)

    tease_points = [spell_out_acronyms(p) for p in tease_points]
    tease = "，".join(tease_points).strip("，")
    lunar = f"，{lunar_line}" if lunar_line else ""
    weekday = f"，{weekday_line}" if weekday_line else ""

    hook_hint = ""
    if clamp_humor(config.humor_level) >= 2:
        hook_hint = " 可以加一句很短的‘反直觉’钩子，但只一口气，不展开。"

    return f"""
请写【开场：开机自检】（约 150-240 字）：
- 第一句必须以“{config.cue_preview}，”开头。
- 立刻把看点抛出来：用口语说“今天我们把信息切成几片：{tease}”。
- 用两句完成节目身份：
  你正在收听《{config.show_name}》，一档由A I参与写作的资讯播客。我是{config.host_name}。
- 加一句“AI透明度”：强调“A I先筛，我负责讲成人话”。不要夸张，不要科幻化。
- 报日期：今天是{date_line}{weekday}{lunar}。
- 最后用一句把听众带入快讯段：例如“好，咱们直接快进。”

写作约束：
- {persona_line}
- {humor_line}{hook_hint}
""".strip()


def build_history_prompt(
    config: ShowConfig,
    history_event: str,
) -> str:
    """
    历史段：用“时间倒带”作固定转场，避免“折叠时空”同款表述。
    """
    persona = resolve_persona(config)
    persona_line = persona_guidance_lines(persona)
    humor_line = humor_guidance_line(config.humor_level)
    history_event = spell_out_acronyms(history_event)

    return f"""
请写【时间倒带：历史上的今天】段（约 80-150 字）：
- 第一行用固定转场：{config.cue_history}，把镜头往回拨一下。
- 只讲 1 个事件：{history_event}
- 末尾加一句“把历史翻译成今天的感觉”：例如“你会发现…其实一直没变”。
- 段尾再用一句自然转场到快讯：例如“回到今天，我们开始快进。”

写作约束：
- {persona_line}
- {humor_line}（这里的幽默像“轻轻一笑”，不要段子化。）
""".strip()


def build_brief_news_prompt(
    config: ShowConfig,
    news_items: List[NewsItem],
) -> str:
    """
    快讯段：用“快进快讯”固定口令 + 稳定的条目节奏 + 更像自己品牌的转场词库。
    """
    persona = resolve_persona(config)
    persona_line = persona_guidance_lines(persona)
    humor_line = humor_guidance_line(config.humor_level)
    lo, hi = brief_length_range(config)

    items_text = "\n".join(
        [
            f"{i+1}. 标题：{spell_out_acronyms(it.title)}；事实：{spell_out_acronyms(it.facts)}；补充：{spell_out_acronyms(it.context or '')}"
            for i, it in enumerate(news_items)
        ]
    )

    if (config.brief_density or "").lower() == "long":
        explain_hint = "每条多给一句背景或因果，让听众能跟上。"
    else:
        explain_hint = "每条一句背景就好，像‘刷卡’一样快过。"

    transitions = (
        "转场词库（任选其一，别重复太多）："
        "“下一条，换个频道。”"
        "“我们快进一下。”"
        "“镜头切过去。”"
        "“再给你塞一条信息。”"
        "“顺手看一眼。”"
    )

    return f"""
请写【快进快讯】（总计约 {len(news_items)*lo}-{len(news_items)*hi} 字）：
- 开头一句必须是：{config.cue_briefs}。
- 依次讲下面这些资讯（保持顺序），每条约 {lo}-{hi} 字：
{items_text}

写作要求：
- 每条都按固定节奏：
  先说事实（1-2句）→ 再说人话解释（1句）→ 最后用一句落地（“所以呢/你可以这么理解/你会感受到的变化是…”）。
- 条与条之间必须有自然转场。{transitions}
- {explain_hint}
- 不要编造来源；不要出现竞品栏目词与句式（已在禁用表达里列出）。

写作约束：
- {persona_line}
- {humor_line}（快讯里幽默要点到即止，别一条里讲 2 个梗。）
""".strip()


def build_deep_dive_prompt(
    config: ShowConfig,
    topic: str,
    facts_bundle: str,
) -> str:
    """
    深度段：我们叫“慢放一条”，强调把一条新闻讲透。
    """
    persona = resolve_persona(config)
    persona_line = persona_guidance_lines(persona)
    humor_line = humor_guidance_line(config.humor_level)

    topic = spell_out_acronyms(topic)
    facts_bundle = spell_out_acronyms(facts_bundle)

    extra = ""
    if clamp_humor(config.humor_level) >= 2:
        extra = " 类比可以更生活化一点，但别讲成段子。"

    return f"""
请写【慢放一条：深度拆解】（420-900 字）：
- 开头必须明确：{config.cue_deep}，我们慢放这一条：{topic}。
- 输入事实/素材如下（只可基于这些信息发挥，不要编造“某某机构最新数据”）：
{facts_bundle}

结构必须包含（用口语串起来，不要项目符号）：
1) 先给一句“这事儿一句话是什么”。（主持人可用口头禅）
2) 它到底是什么：大白话解释 + 一个生活类比。
3) 为什么这阵子突然重要/火了：2-3 句。
4) 里面的门道：讲 2-4 个点，用“第一/第二/第三”串起来。
5) 跟你有什么关系：给 2-3 个可操作的观察点或建议。
6) 结尾留钩子：一句“如果你也好奇…我们之后再拆”。
7) 最后用一句收回节目主线：例如“好，今天的切片就到这儿。”

写作约束：
- {persona_line}
- {humor_line}{extra}
""".strip()


def build_outro_prompt(
    config: ShowConfig,
    outro_hint: str = "明天我们再展开",
    cta_hint: Optional[str] = "喜欢这种A I切片的话，点个关注，就当给我充电。",
) -> str:
    """
    收尾：用“关机前一句”形成品牌记忆点。
    """
    persona = resolve_persona(config)
    persona_line = persona_guidance_lines(persona)
    humor_line = humor_guidance_line(config.humor_level)

    outro_hint = spell_out_acronyms(outro_hint)
    cta = f"{cta_hint} " if cta_hint else ""

    return f"""
请写【收尾：关机前一句】（60-120 字）：
- 必须包含：节目名《{config.show_name}》、主持人{config.host_name}、感谢收听。
- 用一句"{config.cue_wrap}"开头，给一个很短的"今天总结/情绪落点"。
- 可以加一句轻量 CTA：{cta}
- 最后给出明确下次见：{outro_hint}。
- 结尾句尽量有节奏感，像把一天合上，不要口号堆叠。

写作约束：
- {persona_line}
- {humor_line}（收尾幽默像“眨眼”，不要硬梗。）
""".strip()
