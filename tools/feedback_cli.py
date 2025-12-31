"""
CLI 反馈收集工具 - 独立运行模式

用于事后补充反馈，或独立测试反馈功能
"""

import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import click
from src.topic_selection.feedback.collector import FeedbackCollector


@click.command()
@click.option(
    '--report',
    required=True,
    type=click.Path(exists=True),
    help='选题报告 JSON 路径'
)
@click.option(
    '--episode-date',
    help='期数日期（如果未指定，从路径自动提取）'
)
@click.option(
    '--storage-dir',
    default='feedback_history',
    help='反馈数据存储目录'
)
@click.option(
    '--standalone',
    is_flag=True,
    default=True,
    help='独立模式（不触发后续流程）'
)
def main(report: str, episode_date: str, storage_dir: str, standalone: bool):
    """
    交互式审核选题结果
    
    示例：
        python tools/feedback_cli.py --report out/runs/.../report_*.json
    """
    report_path = Path(report)
    
    # 自动提取日期
    if not episode_date:
        # 从路径提取: out/runs/20251231/...
        try:
            episode_date = report_path.parts[-3]
            click.echo(f"自动提取期数日期: {episode_date}")
        except IndexError:
            click.echo("❌ 无法从路径提取期数日期，请使用 --episode-date 指定", err=True)
            sys.exit(1)
    
    # 创建收集器
    collector = FeedbackCollector(
        storage_dir=storage_dir,
        auto_continue=False,  # CLI 模式总是不自动继续
        min_feedback_threshold=0,
    )
    
    try:
        # 收集反馈
        session = collector.collect_feedback(
            report_path=str(report_path),
            episode_date=episode_date,
            standalone=standalone,
        )
        
        click.echo(f"\n✅ 反馈收集完成！")
        click.echo(f"   会话ID: {session.session_id}")
        click.echo(f"   审核数: {session.total_reviewed}")
        click.echo(f"   反馈数: {len(session.feedbacks)}")
        
    except KeyboardInterrupt:
        click.echo("\n\n⚠️  用户中断，反馈已保存。")
        sys.exit(130)
    except Exception as e:
        click.echo(f"\n❌ 错误: {e}", err=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
