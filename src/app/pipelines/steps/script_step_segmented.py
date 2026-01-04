"""
Script Step (Segmented Version)

脚本生成步骤 - 分段版本
按段落生成脚本：S0-S5
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import TYPE_CHECKING, List
from datetime import datetime

from src.app.pipelines.base_step import BaseStep
from src.models.segment import SegmentScript, SEGMENT_ORDER
from src.llm.segment_generator import SegmentScriptGenerator
from src.llm.templates.prompts import NewsItem, ShowConfig

if TYPE_CHECKING:
    from src.app.core.context import EpisodeContext


class ScriptStepSegmented(BaseStep):
    """脚本生成步骤（分段版本）"""
    
    def execute(self, ctx: EpisodeContext) -> None:
        """执行 Script 步骤"""
        cfg = ctx.config
        
        # 检查是否有选中的 items
        if not ctx.items_selected:
            self.logger.warning("没有选中的 items，跳过脚本生成")
            ctx.script_segments = []
            return
        
        from src.utils.logging_config import log_operation
        
        log_operation(
            self.logger,
            step="Script",
            operation="start",
            result=f"{len(ctx.items_selected)} items, {len(SEGMENT_ORDER)} segments to generate"
        )
        
        # 准备上下文
        render_params = self._prepare_render_params(ctx)
        
        # 获取 LLM 客户端适配器
        llm_adapter = self._get_llm_adapter(cfg)
        
        # 创建配置
        show_config = ShowConfig(
            show_name=cfg.get("channel", {}).get("name", "民心A I切片电台"),
            host_name="民心",
            humor_level=1,
            brief_density="short",
        )
        
        # 生成所有段落
        log_operation(
            self.logger,
            step="Script",
            operation="generate_all",
            result="starting"
        )
        
        generator = SegmentScriptGenerator(llm=llm_adapter, config=show_config)
        
        try:
            outputs = generator.render(**render_params)
        except Exception as e:
            self.logger.error(f"脚本生成失败: {e}")
            raise RuntimeError(f"脚本生成失败: {e}") from e
        
        # 将输出转换为 SegmentScript 对象
        segments = self._convert_outputs_to_segments(outputs)
        
        # 保存每个段落
        for segment in segments:
            self._save_segment(ctx, segment)
        
        # 保存到 context
        ctx.script_segments = segments
        
        # 保存汇总
        self._save_summary(ctx, segments)
        
        self.logger.info(f"脚本生成完成: {len(segments)} 个段落")
        ctx.add_event("script_segments_generated", segments_count=len(segments))
    
    def _prepare_render_params(self, ctx: EpisodeContext) -> dict:
        """准备 render 方法的参数"""
        # 获取日期信息
        date_str = str(ctx.episode_date)
        weekday_map = {0: "一", 1: "二", 2: "三", 3: "四", 4: "五", 5: "六", 6: "日"}
        
        try:
            dt_obj = datetime.strptime(date_str, "%Y-%m-%d")
            weekday = f"星期{weekday_map.get(dt_obj.weekday(), '')}"
        except:
            weekday = None
        
        # 准备新闻列表，转换为 NewsItem 对象
        news_items = []
        for item in ctx.items_selected:
            title = item.get("title", "")
            text = item.get("text", "")
            
            # 如果是合并新闻，使用叙述提示
            if item.get("is_merged"):
                narrative_hint = item.get("narrative_hint", "")
                facts = narrative_hint if narrative_hint else text
            else:
                facts = text
            
            news_item = NewsItem(
                title=title,
                facts=facts,
                context=item.get("source_name", "")
            )
            news_items.append(news_item)
        
        # 选择 deep dive 主题（第一条新闻）
        deep_topic = news_items[0].title if news_items else "今日热点"
        deep_facts = news_items[0].facts if news_items else ""
        
        # 历史事件（暂时使用占位符）
        history_event = "历史上的今天发生了一些重要事件"
        
        return {
            "date_line": date_str,
            "weekday_line": weekday,
            "lunar_line": None,
            "tease_points": [item.title for item in news_items[:4]],
            "history_event": history_event,
            "news_items": news_items,
            "deep_topic": deep_topic,
            "deep_facts": deep_facts,
            "outro_hint": "明天我们再展开",
            "cta_hint": "喜欢这种A I切片的话，点个关注，就当给我充电。",
        }
    
    def _get_llm_adapter(self, cfg: dict):
        """获取 LLM 客户端适配器"""
        provider = (os.environ.get("LLM_PROVIDER") or "moonshot").strip().lower()
        if provider not in {"moonshot", "deepseek"}:
            self.logger.warning(f"未知的 LLM_PROVIDER={provider}，回退到 moonshot")
            provider = "moonshot"
        
        timeout_s = int(cfg.get("llm", {}).get("timeout_seconds", 120))
        
        if provider == "deepseek":
            client = self._create_deepseek_client(timeout_s)
        else:
            client = self._create_moonshot_client(timeout_s)
        
        # 包装为适配器
        from src.llm.client.segment_adapter import LLMClientAdapter
        return LLMClientAdapter(client)
    
    def _create_deepseek_client(self, timeout_s: int):
        """创建 DeepSeek 客户端"""
        from src.llm.client.api_client import DeepSeekClient
        
        base_url = os.environ.get("DEEPSEEK_BASE_URL", "").strip()
        api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
        model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip()
        
        if not base_url or not api_key:
            raise RuntimeError("DeepSeek 未配置: 需要设置 DEEPSEEK_BASE_URL 和 DEEPSEEK_API_KEY")
        
        return DeepSeekClient(
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout_seconds=timeout_s
        )
    
    def _create_moonshot_client(self, timeout_s: int):
        """创建 Moonshot 客户端"""
        from src.llm.client.api_client import MoonshotClient
        
        base_url = os.environ.get("MOONSHOT_BASE_URL", "https://api.moonshot.cn/v1").strip()
        api_key = os.environ.get("MOONSHOT_API_KEY", "").strip()
        model = os.environ.get("MOONSHOT_MODEL", "moonshot-v1-8k").strip()
        
        if not api_key:
            raise RuntimeError("Moonshot 未配置: 需要设置 MOONSHOT_API_KEY")
        
        return MoonshotClient(
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout_seconds=timeout_s
        )
    
    def _convert_outputs_to_segments(self, outputs: dict) -> List[SegmentScript]:
        """将 render() 的输出转换为 SegmentScript 对象列表"""
        # 段落映射：新版本的 segment_id -> 旧版本的 id 和 type
        segment_mapping = {
            "opening": ("S0", "OPENING", "开场", 30),
            "history": ("S1", "HISTORY", "历史上的今天", 20),
            "briefs": ("S2", "DETAIL_NEWS", "快讯", 120),
            "deep_dive": ("S3", "DEEP_DIVE", "深度", 180),
            "outro": ("S4", "CLOSING", "结尾", 20),
        }
        
        segments = []
        for new_id, (old_id, seg_type, title, default_duration) in segment_mapping.items():
            text = outputs.get(new_id, "")
            if not text:
                self.logger.warning(f"段落 {new_id} 没有生成内容")
                continue
            
            # 估算时长（按每秒3个字计算）
            duration_sec = max(default_duration, len(text) // 3)
            
            segment = SegmentScript(
                id=old_id,
                type=seg_type,
                title=title,
                text=text,
                duration_sec=duration_sec,
                facts_used=[],
            )
            segments.append(segment)
        
        return segments
    
    def _save_segment(self, ctx: EpisodeContext, segment: SegmentScript) -> None:
        """保存单个段落"""
        script_dir = ctx.run_dir / "3_script" / "segments"
        script_dir.mkdir(parents=True, exist_ok=True)
        
        segment_path = script_dir / f"{segment.id}.json"
        segment_path.write_text(
            json.dumps(segment.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
    
    def _save_summary(self, ctx: EpisodeContext, segments: List[SegmentScript]) -> None:
        """保存汇总"""
        script_dir = ctx.run_dir / "3_script"
        script_dir.mkdir(parents=True, exist_ok=True)
        
        # 保存所有段落的汇总
        summary = {
            "episode_id": ctx.episode_id,
            "date": str(ctx.episode_date),
            "segments": [s.to_dict() for s in segments],
            "total_duration_sec": sum(s.duration_sec for s in segments),
            "generated_at": datetime.now().isoformat(),
        }
        
        summary_path = script_dir / f"{ctx.episode_date}.segments.json"
        summary_path.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        
        # 保存合并的文本（用于查看）
        full_text = "\n\n".join([
            f"=== {s.id}: {s.title} ({s.duration_sec}秒) ===\n{s.text}"
            for s in segments
        ])
        
        text_path = script_dir / f"{ctx.episode_date}.full_script.txt"
        text_path.write_text(full_text, encoding="utf-8")
