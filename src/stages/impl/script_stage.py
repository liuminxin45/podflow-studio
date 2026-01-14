"""
Script Stage Implementation

脚本生成阶段：基于选中的内容生成播客脚本
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import List

from src.stages.base import BaseStage
from src.stages.registry import StageRegistry
from src.stages.schemas.script import (
    ScriptInput,
    ScriptOutput,
    ScriptSegment,
    ScriptStats,
)
from src.stages.schemas.common import ItemSchema


@StageRegistry.register
class ScriptStage(BaseStage[ScriptInput, ScriptOutput]):
    """脚本生成 Stage"""
    
    @property
    def name(self) -> str:
        return "script"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    @property
    def input_schema(self) -> type[ScriptInput]:
        return ScriptInput
    
    @property
    def output_schema(self) -> type[ScriptOutput]:
        return ScriptOutput
    
    def execute(self, input_data: ScriptInput) -> ScriptOutput:
        """执行脚本生成"""
        run_dir = Path(input_data.run_dir)
        artifacts_dir = run_dir / "4_script"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        
        if not input_data.items:
            self.logger.warning("没有 items，跳过脚本生成")
            return ScriptOutput(
                run_id=input_data.run_id,
                episode_date=input_data.episode_date,
                artifacts_dir=str(artifacts_dir),
            )
        
        cfg = input_data.script_config
        channel = input_data.channel
        
        self.logger.info(f"开始脚本生成: {len(input_data.items)} items")
        
        # 准备输入数据
        from src.llm.client.api_client import ScriptInputItem
        
        input_items = []
        for item in input_data.items:
            input_items.append(ScriptInputItem(
                id=item.id,
                title=item.title,
                summary=item.summary or "",
                content=item.content or "",
                url=item.url or "",
                published_at=item.published_at,
                source=item.source_name or "",
                source_name=item.source_name or "",
            ))
        
        # 获取 LLM 配置
        provider = cfg.provider.lower()
        
        if provider == "deepseek":
            result = self._generate_with_deepseek(
                channel=channel.model_dump(),
                items=input_items,
                temperature=cfg.temperature,
                timeout_s=cfg.timeout_seconds,
            )
        else:
            result = self._generate_with_moonshot(
                channel=channel.model_dump(),
                items=input_items,
                temperature=cfg.temperature,
                timeout_s=cfg.timeout_seconds,
            )
        
        # 保存结果
        script_json_path = artifacts_dir / f"{input_data.episode_date}.script.json"
        ssml_path = artifacts_dir / f"{input_data.episode_date}.ssml.txt"
        shownotes_path = artifacts_dir / f"{input_data.episode_date}.shownotes.md"
        
        script_json_path.write_text(
            json.dumps(result.model_dump(), ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        ssml_path.write_text(result.ssml or "", encoding="utf-8")
        shownotes_path.write_text(result.shownotes or "", encoding="utf-8")
        
        self.logger.info(f"脚本生成完成: {result.title}")
        
        return ScriptOutput(
            run_id=input_data.run_id,
            episode_date=input_data.episode_date,
            artifacts_dir=str(artifacts_dir),
            title=result.title or "",
            ssml=result.ssml or "",
            shownotes=result.shownotes or "",
            tags=result.tags or [],
            segments=[],  # TODO: 支持分段
            stats=ScriptStats(
                run_id=input_data.run_id,
                episode_date=input_data.episode_date,
                run_dir=input_data.run_dir,
                total_segments=1,
                total_chars=len(result.ssml or ""),
            ),
        )
    
    def _generate_with_deepseek(self, channel, items, temperature, timeout_s):
        """使用 DeepSeek 生成脚本"""
        from src.llm.client.api_client import DeepSeekClient
        
        base_url = os.environ.get("DEEPSEEK_BASE_URL", "").strip()
        api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
        model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip()
        
        if not base_url or not api_key:
            raise RuntimeError("DeepSeek 未配置")
        
        client = DeepSeekClient(
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout_seconds=timeout_s,
        )
        
        return client.generate(channel=channel, items=items, temperature=temperature)
    
    def _generate_with_moonshot(self, channel, items, temperature, timeout_s):
        """使用 Moonshot 生成脚本"""
        from src.llm.client.api_client import MoonshotClient
        
        base_url = os.environ.get("MOONSHOT_BASE_URL", "https://api.moonshot.cn/v1").strip()
        api_key = os.environ.get("MOONSHOT_API_KEY", "").strip()
        model = os.environ.get("MOONSHOT_MODEL", "moonshot-v1-8k").strip()
        
        if not api_key:
            raise RuntimeError("Moonshot 未配置")
        
        client = MoonshotClient(
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout_seconds=timeout_s,
        )
        
        return client.generate(channel=channel, items=items, temperature=temperature)
