from __future__ import annotations

import os
import json
import logging
import time
from typing import Any

import requests
from pydantic import BaseModel, Field


class ScriptInputItem(BaseModel):
    id: str
    title: str
    summary: str = ""
    content: str = ""
    url: str
    published_at: str | None = None


class ScriptOutput(BaseModel):
    title: str
    ssml: str
    shownotes: str
    tags: list[str] = Field(default_factory=list)


def build_research_script_prompt(
    *,
    channel: dict,
    items: list[ScriptInputItem],
    research_content: str,
    citations: list[dict],
) -> tuple[str, str]:
    max_research_chars = int(os.environ.get("SCRIPT_PROMPT_MAX_RESEARCH_CHARS", "6000"))
    max_items = int(os.environ.get("SCRIPT_PROMPT_MAX_ITEMS", "8"))
    max_citations = int(os.environ.get("SCRIPT_PROMPT_MAX_CITATIONS", "3"))
    max_citation_snippet_chars = int(os.environ.get("SCRIPT_PROMPT_MAX_CITATION_SNIPPET_CHARS", "120"))

    style = (channel.get("style") or {}) if isinstance(channel, dict) else {}
    tone = style.get("tone") or "口语化、生动、像朋友聊天"
    audience = style.get("audience") or "普通听众"

    item_lines = []
    for i, it in enumerate((items or [])[:max_items], start=1):
        item_lines.append(f"{i}. {it.title}\n{it.url}".strip())

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

    system = (
        "你是一名中文播客脚本作者。"
        "你要把内容改写成口语化、节奏明快的单口播。"
        "整体气质轻松自然，但对事实非常严谨。"
        "输出必须是严格 JSON，不能输出多余文字。"
    )

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
- 如果资料不足以得出结论，必须明确说“资料未给出/尚无法确认”，并保持谨慎措辞。

输出约束：
- 输出 JSON，字段为：title, ssml, shownotes, tags
- ssml 必须是可用于 TTS 的 SSML，包含 <break time=\"500ms\"/> 等停顿
- shownotes 用 Markdown，列出每条新闻的要点与链接
- tags 3~8 个中文标签

新闻清单（仅用于链接与 shownotes，已做精简）：
{chr(10).join(item_lines)}

网络调查结果（正文）：
{research_content2}

引用资料（如有）：
{chr(10).join(citation_lines) if citation_lines else '(none)'}

现在输出 JSON：
""".strip()

    return system, user


class DeepSeekClient:
    def __init__(self, base_url: str, api_key: str, model: str, timeout_seconds: int):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.log = logging.getLogger("script.deepseek")

    def _endpoint(self) -> str:
        return f"{self.base_url}/chat/completions"

    def _timeout(self) -> tuple[float, float]:
        connect_timeout = float(min(10, max(1, int(self.timeout_seconds // 3) or 1)))
        read_timeout = float(max(5, int(self.timeout_seconds)))
        return connect_timeout, read_timeout

    def _post_json(self, payload: dict) -> dict[str, Any]:
        last_err: Exception | None = None
        for i in range(3):
            try:
                resp = requests.post(
                    self._endpoint(),
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                    timeout=self._timeout(),
                )
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()
                return data
            except (requests.Timeout, requests.ConnectionError) as e:
                last_err = e
                sleep_s = 1.5 * (2**i)
                self.log.warning("request failed (attempt=%s/3): %s; retry in %.1fs", i + 1, e, sleep_s)
                time.sleep(sleep_s)
        assert last_err is not None
        raise last_err

    def generate_from_research(
        self,
        *,
        channel: dict,
        items: list[ScriptInputItem],
        research_content: str,
        citations: list[dict],
        temperature: float,
    ) -> ScriptOutput:
        system, user = build_research_script_prompt(
            channel=channel,
            items=items,
            research_content=research_content,
            citations=citations,
        )

        payload = {
            "model": self.model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
        }

        data = self._post_json(payload)

        content = ((((data.get("choices") or [])[0] or {}).get("message") or {}).get("content") or "")

        try:
            obj = json.loads(content)
        except json.JSONDecodeError as e:
            self.log.error("LLM returned non-JSON: %s", content)
            raise RuntimeError("DeepSeek output is not valid JSON") from e

        try:
            return ScriptOutput.model_validate(obj)
        except Exception as e:  # noqa: BLE001
            self.log.error("LLM JSON schema invalid: %s", content)
            raise RuntimeError("DeepSeek output JSON schema invalid") from e

    def generate(self, channel: dict, items: list[ScriptInputItem], temperature: float) -> ScriptOutput:
        style = (channel.get("style") or {}) if isinstance(channel, dict) else {}
        tone = style.get("tone") or "口语化、生动、像朋友聊天"
        audience = style.get("audience") or "普通听众"

        item_lines = []
        for i, it in enumerate(items, start=1):
            item_lines.append(
                f"{i}. 标题: {it.title}\n摘要: {it.summary}\n链接: {it.url}\n发布时间: {it.published_at or ''}"  # noqa: E501
            )

        system = (
            "你是一名中文播客脚本作者。"
            "你要把新闻内容改写成口语化、节奏明快、像真人聊天的播客。"
            "不要写成新闻稿，不要像公文。"
            "输出必须是严格 JSON，不能输出多余文字。"
        )

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

        payload = {
            "model": self.model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
        }

        data = self._post_json(payload)

        content = (
            (((data.get("choices") or [])[0] or {}).get("message") or {}).get("content")
            or ""
        )

        try:
            obj = json.loads(content)
        except json.JSONDecodeError as e:
            self.log.error("LLM returned non-JSON: %s", content)
            raise RuntimeError("DeepSeek output is not valid JSON") from e

        try:
            return ScriptOutput.model_validate(obj)
        except Exception as e:  # noqa: BLE001
            self.log.error("LLM JSON schema invalid: %s", content)
            raise RuntimeError("DeepSeek output JSON schema invalid") from e
