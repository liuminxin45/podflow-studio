"""
Auto-Podcast Main Runner (Phase 1 - Refactored)

主入口：纯调度器，负责参数解析、配置加载、调用 orchestrator

使用方式：
    python run_new.py --date 2025-12-29 --step all
    python run_new.py --step fetch
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

from src.app.core.orchestrator import run_episode


class _JsonFormatter(logging.Formatter):
    """JSON 格式日志"""
    def format(self, record: logging.LogRecord) -> str:
        base = {
            "ts": dt.datetime.fromtimestamp(record.created, tz=dt.timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
        }
        
        if isinstance(record.msg, dict):
            base.update(record.msg)
        else:
            base["message"] = record.getMessage()
        
        return json.dumps(base, ensure_ascii=False)


def _setup_logging(log_level: str = "INFO"):
    """配置日志"""
    root = logging.getLogger()
    root.setLevel(log_level)
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(_JsonFormatter())
    root.addHandler(console_handler)


def _load_config(config_path: str | None = None) -> dict:
    """加载配置文件"""
    if config_path:
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    
    # 默认配置：合并 settings.yaml 和 pipeline.yaml
    import yaml
    
    config = {}
    
    # 加载 settings.yaml
    settings_path = Path("config/base/settings.yaml")
    if settings_path.exists():
        with open(settings_path, "r", encoding="utf-8") as f:
            config.update(yaml.safe_load(f) or {})
    
    # 加载 pipeline.yaml
    pipeline_path = Path("config/base/pipeline.yaml")
    if pipeline_path.exists():
        with open(pipeline_path, "r", encoding="utf-8") as f:
            pipeline_cfg = yaml.safe_load(f) or {}
            config.update(pipeline_cfg)
    
    return config


def main():
    """主函数"""
    # 解析命令行参数
    parser = argparse.ArgumentParser(description="Auto-Podcast Runner (Phase 1)")
    parser.add_argument("--date", type=str, help="Episode date (YYYY-MM-DD)")
    parser.add_argument("--channel", type=str, default="life-consumer", help="Channel name")
    parser.add_argument("--config", type=str, help="Config file path")
    parser.add_argument("--step", type=str, default="all", 
                       choices=["all", "fetch", "script", "audio", "publish"],
                       help="Which step to run")
    parser.add_argument("--log-level", type=str, default="INFO",
                       choices=["DEBUG", "INFO", "WARNING", "ERROR"],
                       help="Log level")
    parser.add_argument("--timeout-seconds", type=int, default=180,
                       help="Timeout in seconds")
    
    args = parser.parse_args()
    
    # 配置日志
    _setup_logging(args.log_level)
    log = logging.getLogger("run")
    
    # 加载环境变量
    load_dotenv()
    
    # 加载配置
    log.info("加载配置...")
    config = _load_config(args.config)
    
    # 确定 episode_date
    if args.date:
        episode_date = args.date
    else:
        episode_date = dt.date.today().isoformat()
    
    # 构建 episode_id
    episode_id = f"{args.channel}:{episode_date}"
    
    # 输出目录
    output_dir = Path(config.get("output", {}).get("out_dir", "./out"))
    
    log.info("=" * 80)
    log.info("开始工作流执行")
    log.info(f"Episode ID: {episode_id} | 日期: {episode_date} | 步骤: {args.step} | 超时: {args.timeout_seconds}s")
    log.info("=" * 80)
    
    try:
        # 调用 orchestrator
        if args.step == "all" or args.step == "fetch":
            log.info(">>> 步骤 1/5: 数据获取 (FETCH)")
            ctx = run_episode(
                episode_id=episode_id,
                episode_date=episode_date,
                config=config,
                output_dir=output_dir,
            )
            log.info(f"<<< 步骤 1/5 完成")
            
            # 检查是否有选中的 items
            if not ctx.items_selected:
                log.error("=" * 80)
                log.error("工作流执行失败: no items available to script")
                log.error("=" * 80)
                return 1
            
            log.info(f"成功选中 {len(ctx.items_selected)} 个 items")
            
            # 检查是否有音频输出
            if hasattr(ctx, 'audio_outputs') and ctx.audio_outputs:
                log.info(f"生成了 {len(ctx.audio_outputs)} 个音频文件")
            
            # 检查是否有脚本输出
            if hasattr(ctx, 'script_segments') and ctx.script_segments:
                log.info(f"生成了 {len(ctx.script_segments)} 个脚本段落")
        
        log.info("=" * 80)
        log.info("工作流执行成功")
        log.info("=" * 80)
        return 0
        
    except Exception as e:
        log.error("=" * 80)
        log.error(f"工作流执行失败: {e}")
        log.error("=" * 80)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
