"""
Script Step

脚本生成步骤
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import TYPE_CHECKING

from src.app.pipelines.base_step import BaseStep
from src.llm.client.api_client import ScriptInputItem, ScriptOutput

if TYPE_CHECKING:
    from src.app.core.context import EpisodeContext


class ScriptStep(BaseStep):
    """脚本生成步骤"""
    
    def execute(self, ctx: EpisodeContext) -> None:
        """执行 Script 步骤"""
        cfg = ctx.config
        
        # 检查是否有选中的 items
        if not ctx.items_selected:
            self.logger.warning("没有选中的 items，跳过脚本生成")
            ctx.script_text = ""
            return
        
        self.logger.info(f"开始脚本生成：{len(ctx.items_selected)} items")
        
        # 准备输入数据
        input_items = [
            ScriptInputItem(
                id=item.get("id", ""),
                title=item.get("title", ""),
                summary=item.get("summary", ""),
                content=item.get("content", ""),
                url=item.get("url", ""),
                published_at=item.get("published_at"),
            )
            for item in ctx.items_selected
        ]
        
        # 获取 LLM 配置
        provider = (os.environ.get("LLM_PROVIDER") or "moonshot").strip().lower()
        if provider not in {"moonshot", "deepseek"}:
            self.logger.warning(f"未知的 LLM_PROVIDER={provider}，回退到 moonshot")
            provider = "moonshot"
        
        timeout_s = int(cfg.get("llm", {}).get("timeout_seconds", 120))
        temperature = float(cfg.get("deepseek", {}).get("temperature", 0.7))
        channel = cfg.get("channel", {})
        
        # 调用 LLM 生成脚本
        if provider == "deepseek":
            out = self._generate_with_deepseek(
                channel=channel,
                items=input_items,
                temperature=temperature,
                timeout_s=timeout_s,
            )
        else:
            out = self._generate_with_moonshot(
                channel=channel,
                items=input_items,
                temperature=temperature,
                timeout_s=timeout_s,
            )
        
        # 保存结果到 context
        ctx.script_text = out.ssml or ""
        ctx.script_output = {
            "title": out.title,
            "ssml": out.ssml,
            "shownotes": out.shownotes,
            "tags": out.tags,
        }
        
        # 保存到文件
        script_dir = ctx.run_dir / "2_script"
        script_dir.mkdir(parents=True, exist_ok=True)
        
        script_json_path = script_dir / f"{ctx.episode_date}.script.json"
        ssml_path = script_dir / f"{ctx.episode_date}.ssml.txt"
        shownotes_path = script_dir / f"{ctx.episode_date}.shownotes.md"
        
        script_json_path.write_text(
            json.dumps(out.model_dump(), ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        ssml_path.write_text(out.ssml or "", encoding="utf-8")
        shownotes_path.write_text(out.shownotes or "", encoding="utf-8")
        
        self.logger.info(f"脚本生成完成: {out.title}")
        self.logger.info(f"标签: {','.join(out.tags)}")
        
        ctx.add_event("script_generated",
                     title=out.title,
                     tags_count=len(out.tags),
                     ssml_chars=len(out.ssml or ""))
    
    def _generate_with_deepseek(
        self,
        channel: dict,
        items: list,
        temperature: float,
        timeout_s: int,
    ) -> ScriptOutput:
        """使用 DeepSeek 生成脚本"""
        from src.llm.client.api_client import DeepSeekClient
        
        base_url = os.environ.get("DEEPSEEK_BASE_URL", "").strip()
        api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
        model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip()
        
        if not base_url or not api_key:
            raise RuntimeError("DeepSeek 未配置: 需要设置 DEEPSEEK_BASE_URL 和 DEEPSEEK_API_KEY")
        
        client = DeepSeekClient(
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout_seconds=timeout_s
        )
        
        return client.generate(channel=channel, items=items, temperature=temperature)
    
    def _generate_with_moonshot(
        self,
        channel: dict,
        items: list,
        temperature: float,
        timeout_s: int,
    ) -> ScriptOutput:
        """使用 Moonshot 生成脚本"""
        from src.llm.client.api_client import MoonshotClient
        
        base_url = os.environ.get("MOONSHOT_BASE_URL", "https://api.moonshot.cn/v1").strip()
        api_key = os.environ.get("MOONSHOT_API_KEY", "").strip()
        model = os.environ.get("MOONSHOT_MODEL", "kimi-k2-turbo-preview").strip()
        
        if not api_key:
            raise RuntimeError("Moonshot 未配置: 需要设置 MOONSHOT_API_KEY")
        
        client = MoonshotClient(
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout_seconds=timeout_s
        )
        
        return client.generate(channel=channel, items=items, temperature=temperature)
