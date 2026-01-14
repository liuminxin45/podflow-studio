"""
Stage CLI

命令行入口，支持单独运行各个 Stage 或完整 Pipeline
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


def setup_logging(verbose: bool = False):
    """设置日志"""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def load_config(config_path: Optional[str] = None) -> dict:
    """加载配置"""
    if config_path:
        config_file = Path(config_path)
    else:
        # 默认配置路径
        config_file = Path("config/settings.yaml")
    
    if not config_file.exists():
        logging.warning(f"配置文件不存在: {config_file}")
        return {}
    
    import yaml
    with open(config_file, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def cmd_run(args):
    """运行完整 Pipeline"""
    from src.stages.orchestrator import run_pipeline
    
    config = load_config(args.config)
    output_dir = Path(args.output_dir)
    
    result = run_pipeline(
        episode_id=args.episode_id or f"episode:{args.date}",
        episode_date=args.date,
        config=config,
        output_dir=output_dir,
        start_stage=args.start,
        end_stage=args.end,
        skip_stages=args.skip.split(",") if args.skip else None,
    )
    
    print(f"\n{'='*60}")
    print(f"Pipeline 执行{'成功' if result.status == 'success' else '失败'}")
    print(f"{'='*60}")
    print(f"Episode: {result.episode_id}")
    print(f"Run ID: {result.run_id}")
    print(f"Run Dir: {result.run_dir}")
    print(f"Duration: {result.duration_seconds:.1f}s")
    print(f"Stages Executed: {', '.join(result.stages_executed)}")
    if result.stages_skipped:
        print(f"Stages Skipped: {', '.join(result.stages_skipped)}")
    if result.error:
        print(f"Error: {result.error}")
    print(f"{'='*60}\n")
    
    return 0 if result.status == "success" else 1


def cmd_stage(args):
    """运行单个 Stage"""
    from src.stages.registry import StageRegistry
    from src.stages.impl import (
        FetchStage, ClusterStage, SelectionStage,
        ResearchStage, ScriptStage, AudioStage, PublishStage,
    )
    
    stage_name = args.name
    
    # 验证 Stage 存在
    available = StageRegistry.list_all()
    if stage_name not in available:
        print(f"错误: Stage '{stage_name}' 不存在")
        print(f"可用的 Stage: {', '.join(available)}")
        return 1
    
    # 读取输入
    if args.input:
        input_path = Path(args.input)
        if not input_path.exists():
            print(f"错误: 输入文件不存在: {input_path}")
            return 1
        with open(input_path, "r", encoding="utf-8") as f:
            input_data = json.load(f)
    else:
        print("错误: 必须提供 --input 参数")
        return 1
    
    # 获取 Stage 实例
    config = load_config(args.config)
    stage = StageRegistry.get(stage_name, config)
    
    # 运行
    print(f">>> 运行 Stage: {stage_name}")
    result = stage.run_from_json(input_data)
    
    # 保存输出
    if args.output:
        output_path = Path(args.output)
        stage.save_result(result, output_path)
        print(f"结果已保存: {output_path}")
    else:
        # 输出到 stdout
        result_dict = {
            "status": result.status.value,
            "output": result.output.model_dump() if result.output else None,
            "error": result.error,
        }
        print(json.dumps(result_dict, ensure_ascii=False, indent=2))
    
    return 0 if result.status.value == "success" else 1


def cmd_list(args):
    """列出所有 Stage"""
    from src.stages.registry import StageRegistry
    from src.stages.impl import (
        FetchStage, ClusterStage, SelectionStage,
        ResearchStage, ScriptStage, AudioStage, PublishStage,
    )
    
    stages = StageRegistry.list_all()
    
    print("\n可用的 Stage:")
    print("-" * 40)
    for name in stages:
        stage = StageRegistry.get(name, {})
        print(f"  {name:15} v{stage.version}")
    print("-" * 40)
    print(f"共 {len(stages)} 个 Stage\n")
    
    return 0


def cmd_schema(args):
    """显示 Stage 的输入/输出 Schema"""
    from src.stages.registry import StageRegistry
    from src.stages.impl import (
        FetchStage, ClusterStage, SelectionStage,
        ResearchStage, ScriptStage, AudioStage, PublishStage,
    )
    
    stage_name = args.name
    
    available = StageRegistry.list_all()
    if stage_name not in available:
        print(f"错误: Stage '{stage_name}' 不存在")
        return 1
    
    stage = StageRegistry.get(stage_name, {})
    
    print(f"\n=== {stage_name} Stage Schema ===\n")
    
    print("Input Schema:")
    print("-" * 40)
    input_schema = stage.input_schema.model_json_schema()
    print(json.dumps(input_schema, ensure_ascii=False, indent=2))
    
    print("\nOutput Schema:")
    print("-" * 40)
    output_schema = stage.output_schema.model_json_schema()
    print(json.dumps(output_schema, ensure_ascii=False, indent=2))
    
    return 0


def main():
    """主入口"""
    load_dotenv()
    
    parser = argparse.ArgumentParser(
        prog="stage",
        description="Podcast Pipeline Stage CLI",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="详细输出")
    
    subparsers = parser.add_subparsers(dest="command", help="子命令")
    
    # run 命令 - 运行完整 Pipeline
    run_parser = subparsers.add_parser("run", help="运行完整 Pipeline")
    run_parser.add_argument("-d", "--date", required=True, help="Episode 日期 (YYYY-MM-DD)")
    run_parser.add_argument("-i", "--episode-id", help="Episode ID")
    run_parser.add_argument("-o", "--output-dir", default="out", help="输出目录")
    run_parser.add_argument("-c", "--config", help="配置文件路径")
    run_parser.add_argument("--start", help="从哪个 Stage 开始")
    run_parser.add_argument("--end", help="到哪个 Stage 结束")
    run_parser.add_argument("--skip", help="跳过的 Stage (逗号分隔)")
    run_parser.set_defaults(func=cmd_run)
    
    # stage 命令 - 运行单个 Stage
    stage_parser = subparsers.add_parser("stage", help="运行单个 Stage")
    stage_parser.add_argument("name", help="Stage 名称")
    stage_parser.add_argument("-i", "--input", required=True, help="输入 JSON 文件")
    stage_parser.add_argument("-o", "--output", help="输出 JSON 文件")
    stage_parser.add_argument("-c", "--config", help="配置文件路径")
    stage_parser.set_defaults(func=cmd_stage)
    
    # list 命令 - 列出所有 Stage
    list_parser = subparsers.add_parser("list", help="列出所有 Stage")
    list_parser.set_defaults(func=cmd_list)
    
    # schema 命令 - 显示 Schema
    schema_parser = subparsers.add_parser("schema", help="显示 Stage Schema")
    schema_parser.add_argument("name", help="Stage 名称")
    schema_parser.set_defaults(func=cmd_schema)
    
    args = parser.parse_args()
    
    setup_logging(args.verbose)
    
    if not args.command:
        parser.print_help()
        return 0
    
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
