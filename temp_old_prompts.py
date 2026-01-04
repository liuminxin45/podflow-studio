"""
LLM Prompts Configuration

这个文件包含了用于播客脚本生成的各种提示词模板和配置。

功能概述：
- 提供多种播客脚本生成提示词模板
- 支持新闻、研究、详细内容等不同场景
- 包含SSML优化和语音合成提示
- 可配置的内容风格和格式设置

主要函数：
- build_news_script_prompt(): 基础新闻脚本提示词
- build_research_script_prompt(): 研究型脚本提示词
- build_detailed_news_script_prompt(): 详细新闻脚本提示词
- build_enhanced_script_prompt(): 增强型脚本提示词
- get_content_style_prompt(): 内容风格提示词

提示词特性：
- 支持中英文混合内容
- 包含语音停顿和语调控制
- 可配置的输出格式要求
- 优化的SSML输出支持

使用示例：
    system_prompt, user_prompt = build_news_script_prompt(
        channel=config, items=news_items
    )

作者：Auto-Podcast Team
版本：2.0.0
更新：2025-12-25
"""

from __future__ import annotations

import os

# =============================
# 基础系统提示词
# =============================

BASE_SYSTEM_PROMPT = """你是一名中文播客脚本作者。
你要把内容改写成口语化、节奏明快的单口播。
整体气质轻松自然，但对事实非常严谨。
输出必须是严格 JSON，不能输出多余文字。"""

BASE_SYSTEM_PROMPT_V2 = """你是一名中文播客脚本作者。
你要把新闻内容改写成口语化、节奏明快、像真人聊天的播客。
不要写成新闻稿，不要像公文。
输出必须是严格 JSON，不能输出多余文字。"""

# =============================
# 研究内容生成提示词
# =============================

def build_research_script_prompt(
    *,
    channel: dict,
    items: list,
    research_content: str,
    citations: list[dict],
) -> tuple[str, str]:
    """
    基于研究内容生成播客脚本的提示词
    
    Args:
        channel: 频道配置信息
        items: 新闻条目列表
        research_content: 研究内容正文
        citations: 引用资料列表
    
    Returns:
        (system_prompt, user_prompt) 元组
    """
    max_research_chars = int(os.environ.get("SCRIPT_PROMPT_MAX_RESEARCH_CHARS", "6000"))
    max_items = int(os.environ.get("SCRIPT_PROMPT_MAX_ITEMS", "8"))
    max_citations = int(os.environ.get("SCRIPT_PROMPT_MAX_CITATIONS", "3"))
    max_citation_snippet_chars = int(os.environ.get("SCRIPT_PROMPT_MAX_CITATION_SNIPPET_CHARS", "120"))

    style = (channel.get("style") or {}) if isinstance(channel, dict) else {}
    tone = style.get("tone") or "口语化、生动、像朋友聊天"
    audience = style.get("audience") or "普通听众"

    item_lines = []
    for i, it in enumerate((items or [])[:max_items], start=1):
        source_label = f"[来源: {it.source}]" if hasattr(it, 'source') and it.source else ""
        item_lines.append(f"{i}. {source_label} {it.title}\n{it.url}".strip())

    citation_lines = []
    for i, c in enumerate((citations or [])[:max_citations], start=1):
        if not isinstance(c, dict):
            continue
        title = (c.get("title") or "") if isinstance(c.get("title"), str) else ""
        link = (c.get("link") or "") if isinstance(c.get("link"), str) else ""
        snippet = (c.get("snippet") or "") if isinstance(c.get("snippet"), str) else ""
        snippet2 = snippet.strip().replace("\n", " ")
        if len(snippet2) > max_citation_snippet_chars:
            snippet2 = snippet2[:max_citation_snippet_chars] + "..."
        if title or link or snippet2:
            citation_lines.append(f"{i}. {title}\n{link}\n{snippet2}".strip())

    research_content2 = (research_content or "").strip()
    if max_research_chars > 0 and len(research_content2) > max_research_chars:
        research_content2 = research_content2[:max_research_chars] + "\n...(truncated)"

    system = BASE_SYSTEM_PROMPT

    user = f"""
栏目: {channel.get('name') if isinstance(channel, dict) else ''}
受众: {audience}
风格: {tone}

请基于【网络调查结果】生成一期单口播播客脚本（不要对话体，不要分角色）。结构固定：
- 10 秒开场（欢迎 + 今日主题）
- 3~5 条内容（每条都要包含：发生了什么 / 对普通人影响 / 建议）
- 结尾总结（复盘 + 行动建议 + 下期预告一句）

事实约束（必须严格遵守）：
- 你的所有事实性陈述必须能够在下方【网络调查结果（正文）】或【引用资料】中找到依据。
- 禁止使用常识补全、禁止推测、禁止编造来源、禁止引入未提供的新事实。
- 如果资料不足以得出结论，必须明确说"资料未给出/尚无法确认"，并保持谨慎措辞。

输出约束：
- 输出 JSON，字段为：title, ssml, shownotes, tags
- ssml 必须是可用于 TTS 的 SSML，包含 <break time="500ms"/> 等停顿
- shownotes 用 Markdown，列出每条新闻的要点与链接，**必须注明来源**
- tags 3~8 个中文标签
- **重要**：在播客内容中提及新闻时，必须说明来源（如"根据XX报道"、"来自XX消息"）

新闻清单（仅用于链接与 shownotes，已做精简）：
{chr(10).join(item_lines)}

网络调查结果（正文）：
{research_content2}

引用资料（如有）：
{chr(10).join(citation_lines) if citation_lines else '(none)'}

现在输出 JSON：
""".strip()

    return system, user

# =============================
# 新闻内容生成提示词
# =============================

def build_news_script_prompt(
    *,
    channel: dict,
    items: list,
) -> tuple[str, str]:
    """
    基于新闻内容生成播客脚本的提示词
    
    Args:
        channel: 频道配置信息
        items: 新闻条目列表
    
    Returns:
        (system_prompt, user_prompt) 元组
    """
    max_items = int(os.environ.get("SCRIPT_PROMPT_MAX_ITEMS", "8"))

    style = (channel.get("style") or {}) if isinstance(channel, dict) else {}
    tone = style.get("tone") or "口语化、生动、像朋友聊天"
    audience = style.get("audience") or "普通听众"

    item_lines = []
    for i, it in enumerate((items or [])[:max_items], start=1):
        source_label = f"[来源: {it.source}]" if hasattr(it, 'source') and it.source else ""
        item_lines.append(f"{i}. {source_label} {it.title}\n{it.url}".strip())

    system = BASE_SYSTEM_PROMPT_V2

    user = f"""
栏目: {channel.get('name') if isinstance(channel, dict) else ''}
受众: {audience}
风格: {tone}

请根据以下新闻素材，生成一期播客脚本。结构固定：
- 10 秒开场（欢迎 + 今日主题）
- 3~5 条内容（每条都要包含：发生了什么 / 对普通人影响 / 建议）
- 结尾总结（复盘 + 行动建议 + 下期预告一句）

强约束：
- 输出 JSON，字段为：title, ssml, shownotes, tags
- ssml 必须是可用于 TTS 的 SSML，包含 <break time=\"500ms\"/> 等停顿
- shownotes 用 Markdown，列出每条新闻的要点与链接，**必须注明来源**
- tags 3~8 个中文标签
- **重要**：在播客内容中提及新闻时，必须说明来源（如"根据XX报道"、"来自XX消息"）

新闻素材（已做精简）：
{chr(10).join(item_lines)}

现在输出 JSON：
""".strip()

    return system, user

# =============================
# 详细新闻内容生成提示词
# =============================

def build_detailed_news_script_prompt(
    *,
    channel: dict,
    items: list,
) -> tuple[str, str]:
    """
    基于详细新闻内容生成播客脚本的提示词
    
    Args:
        channel: 频道配置信息  
        items: 新闻条目列表（包含完整信息）
    
    Returns:
        (system_prompt, user_prompt) 元组
    """
    max_items = int(os.environ.get("SCRIPT_PROMPT_MAX_ITEMS", "8"))

    style = (channel.get("style") or {}) if isinstance(channel, dict) else {}
    tone = style.get("tone") or "口语化、生动、像朋友聊天"
    audience = style.get("audience") or "普通听众"

    item_lines = []
    for i, it in enumerate((items or [])[:max_items], start=1):
        source_label = f"来源: {it.source}" if hasattr(it, 'source') and it.source else "来源: 未知"
        item_lines.append(
            f"{i}. 标题: {it.title}\n"
            f"{source_label}\n"
            f"摘要: {it.summary}\n"
            f"链接: {it.url}\n"
            f"发布时间: {it.published_at or ''}"
        )

    system = BASE_SYSTEM_PROMPT_V2

    user = f"""
栏目: {channel.get('name') if isinstance(channel, dict) else ''}
受众: {audience}
风格: {tone}

请根据以下新闻素材，生成一期播客脚本。结构固定：
- 10 秒开场（欢迎 + 今日主题）
- 3~5 条内容（每条都要包含：发生了什么 / 对普通人影响 / 建议）
- 结尾总结（复盘 + 行动建议 + 下期预告一句）

强约束：
- 输出 JSON，字段为：title, ssml, shownotes, tags
- ssml 必须是可用于 TTS 的 SSML，包含 <break time=\"500ms\"/> 等停顿
- shownotes 用 Markdown，列出每条新闻的要点与链接
- tags 3~8 个中文标签

新闻素材：
{chr(10).join(item_lines)}

现在输出 JSON：
""".strip()

    return system, user

# =============================
# SSML优化提示词
# =============================

def get_ssml_optimization_hints() -> str:
    """
    获取SSML优化建议，可以在提示词中加入这些指导
    
    Returns:
        SSML优化建议字符串
    """
    return """
SSML生成建议：
1. 停顿控制：
   - 开场白后：<break time=\"500ms\"/>\n   - 段落转换：<break time=\"1s\"/>\n   - 句子内停顿：<break time=\"300ms\"/>\n   - 重点信息前：<break time=\"400ms\"/>\n\n2. 语速建议：\n   - 开场：正常语速\n   - 重点信息：可稍慢\n   - 结尾总结：正常语速\n\n3. 情感表达：\n   - 惊讶内容：可适当提高音调\n   - 重要信息：可加强重音\n   - 轻松内容：保持自然语调\n\n4. 结构清晰：\n   - 使用<p>标签包裹段落\n   - 保持一致的停顿模式\n   - 避免过度使用标记"""

# =============================
# 内容风格提示词模板
# =============================

CONTENT_STYLE_TEMPLATES = {
    "news": {
        "tone": "新闻播报风格：专业、清晰、客观",
        "ssml_hints": "使用标准停顿，语速适中，重点信息清晰",
        "structure_hints": "倒金字塔结构，先重要后次要"
    },
    
    "story": {
        "tone": "故事讲述风格：温暖、生动、有代入感", 
        "ssml_hints": "语速稍慢，停顿丰富，情感充沛",
        "structure_hints": "时间顺序，起承转合，情感递进"
    },
    
    "chat": {
        "tone": "聊天对话风格：轻松、自然、亲切",
        "ssml_hints": "语速自然，停顿随意，像朋友聊天",
        "structure_hints": "话题式结构，跳跃性思维，互动感"
    },
    
    "teaching": {
        "tone": "教学讲解风格：清晰、耐心、逻辑性强",
        "ssml_hints": "语速较慢，重点重复，停顿明确",
        "structure_hints": "总分总结构，循序渐进，反复强调"
    },
    
    "emotion": {
        "tone": "情感表达风格：真诚、感人、有共鸣",
        "ssml_hints": "语速变化丰富，停顿有感染力",
        "structure_hints": "情感递进，高潮迭起，首尾呼应"
    }
}

def get_content_style_prompt(style_type: str) -> dict:
    """
    获取指定类型的内容风格提示词
    
    Args:
        style_type: 风格类型 (news, story, chat, teaching, emotion)
    
    Returns:
        风格配置字典
    """
    return CONTENT_STYLE_TEMPLATES.get(style_type, CONTENT_STYLE_TEMPLATES["chat"])

# =============================
# 高级SSML控制提示词
# =============================

ADVANCED_SSML_PROMPTS = {
    "prosody_control": """
高级语音控制：
- 语速：<prosody rate="90%">慢速内容</prosody>
- 音调：<prosody pitch="+5%">提高音调</prosody>
- 音量：<prosody volume="+3dB">增大音量</prosody>
- 综合：<prosody rate="95%" pitch="+2%" volume="+2dB">综合控制</prosody>
""",

    "emphasis_control": """
强调控制：
- 轻度强调：<emphasis level="moderate">重要内容</emphasis>
- 重度强调：<emphasis level="strong">关键信息</emphasis>
- 对比强调：<emphasis level="strong">对比信息</emphasis> vs 普通信息
""",

    "break_control": """
停顿控制：
- 短暂停顿：<break time="200ms"/>
- 中等停顿：<break time="500ms"/>
- 较长停顿：<break time="800ms"/>
- 段落停顿：<break time="1s"/>
- 章节停顿：<break time="1.5s"/>
""",

    "paragraph_control": """
段落控制：
- 段落开始：<p>段落内容</p>
- 重点段落：<p><emphasis level="moderate">重点段落</emphasis></p>
- 过渡段落：<p><break time="500ms"/>过渡内容</p>
"""
}

# =============================
# 提示词构建工具函数
# =============================

def build_enhanced_script_prompt(
    *,
    channel: dict,
    items: list,
    content_type: str = "chat",
    include_research: bool = False,
    research_content: str = "",
    citations: list[dict] | None = None,
    enable_advanced_ssml: bool = False,
) -> tuple[str, str]:
    """
    构建增强版播客脚本生成提示词
    
    Args:
        channel: 频道配置信息
        items: 新闻条目列表
        content_type: 内容类型 (news, story, chat, teaching, emotion)
        include_research: 是否包含研究内容
        research_content: 研究内容
        citations: 引用资料
        enable_advanced_ssml: 是否启用高级SSML控制
    
    Returns:
        (system_prompt, user_prompt) 元组
    """
    
    # 获取内容风格配置
    style_config = get_content_style_prompt(content_type)
    
    # 构建基础提示词
    if include_research:
        system, user = build_research_script_prompt(
            channel=channel,
            items=items,
            research_content=research_content,
            citations=citations or [],
        )
    else:
        system, user = build_news_script_prompt(
            channel=channel,
            items=items,
        )
    
    # 增强系统提示词
    enhanced_system = f"""{system}

内容风格要求：{style_config['tone']}
结构要求：{style_config['structure_hints']}
"""

    # 如果启用高级SSML，添加相关提示
    if enable_advanced_ssml:
        enhanced_system += f"""

SSML高级控制：
{ADVANCED_SSML_PROMPTS['prosody_control']}
{ADVANCED_SSML_PROMPTS['emphasis_control']}
{ADVANCED_SSML_PROMPTS['break_control']}
{ADVANCED_SSML_PROMPTS['paragraph_control']}
"""
    
    # 添加基础SSML提示
    enhanced_system += f"""

SSML基础要求：
{get_ssml_optimization_hints()}

风格化SSML：{style_config['ssml_hints']}
"""
    
    return enhanced_system, user

# =============================
# 提示词版本管理
# =============================

PROMPT_VERSIONS = {
    "v1.0": {
        "description": "基础版本，包含基本SSML要求",
        "system": BASE_SYSTEM_PROMPT,
        "features": ["基础SSML", "JSON输出", "事实约束"]
    },
    
    "v1.1": {
        "description": "增强版本，添加内容风格支持",
        "system": BASE_SYSTEM_PROMPT_V2, 
        "features": ["风格化SSML", "高级控制", "内容分类"]
    },
    
    "v2.0": {
        "description": "高级版本，完整SSML控制",
        "system": "综合所有高级特性",
        "features": ["完整SSML", "情感控制", "语音优化"]
    }
}

def get_prompt_version(version: str = "v1.1") -> dict:
    """
    获取指定版本的提示词配置
    
    Args:
        version: 版本号
    
    Returns:
        版本配置信息
    """
    return PROMPT_VERSIONS.get(version, PROMPT_VERSIONS["v1.1"])

# =============================
# 环境变量配置
# =============================

def get_prompt_env_vars() -> dict:
    """
    获取提示词相关的环境变量配置
    
    Returns:
        环境变量配置字典
    """
    return {
        "SCRIPT_PROMPT_MAX_RESEARCH_CHARS": os.environ.get("SCRIPT_PROMPT_MAX_RESEARCH_CHARS", "6000"),
        "SCRIPT_PROMPT_MAX_ITEMS": os.environ.get("SCRIPT_PROMPT_MAX_ITEMS", "8"),
        "SCRIPT_PROMPT_MAX_CITATIONS": os.environ.get("SCRIPT_PROMPT_MAX_CITATIONS", "3"),
        "SCRIPT_PROMPT_MAX_CITATION_SNIPPET_CHARS": os.environ.get("SCRIPT_PROMPT_MAX_CITATION_SNIPPET_CHARS", "120"),
        "SCRIPT_PROMPT_CONTENT_TYPE": os.environ.get("SCRIPT_PROMPT_CONTENT_TYPE", "chat"),
        "SCRIPT_PROMPT_ENABLE_ADVANCED_SSML": os.environ.get("SCRIPT_PROMPT_ENABLE_ADVANCED_SSML", "false"),
        "SCRIPT_PROMPT_VERSION": os.environ.get("SCRIPT_PROMPT_VERSION", "v1.1"),
    }