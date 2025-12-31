"""
策略优化器工具 - Phase 2 主入口

用法：
    # 基础分析（不应用）
    python tools/optimize_strategy.py --dry-run
    
    # 生成优化配置
    python tools/optimize_strategy.py
    
    # 自动应用优化
    python tools/optimize_strategy.py --auto-apply
    
    # 生成详细报告
    python tools/optimize_strategy.py --report-file out/optimization_report.md
"""

import argparse
import sys
import yaml
import logging
from pathlib import Path
from datetime import datetime

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.topic_selection.feedback.optimizer import StrategyOptimizer, OptimizationReport
from src.topic_selection.feedback.config_generator import ConfigGenerator
from src.topic_selection.feedback.prompt_generator import PromptGenerator


# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def load_current_config(config_path: str = "config/base/settings.yaml") -> dict:
    """加载当前配置"""
    with open(config_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def print_report(report: OptimizationReport):
    """打印优化报告"""
    print("\n" + "="*80)
    print("📊 反馈数据分析")
    print("="*80)
    print(f"\n反馈会话数: {report.feedback_sessions_count}")
    print(f"总反馈条数: {report.total_feedbacks}")
    print(f"不一致案例: {report.inconsistent_count} (系统 vs 人工)")
    print(f"总体置信度: {report.overall_confidence:.0%}")
    
    if report.total_feedbacks < 10:
        print("\n⚠️  警告: 反馈数据不足 (<10)，建议继续收集数据")
    
    # 不一致分布
    if report.inconsistent_count > 0:
        print(f"\n不一致率: {report.inconsistent_count / report.total_feedbacks * 100:.1f}%")
    
    # 阈值优化
    print("\n" + "="*80)
    print("🎯 阈值优化建议")
    print("="*80)
    
    if report.threshold_optimization:
        threshold = report.threshold_optimization
        print(f"\n置信度: {threshold.confidence:.0%}")
        print(f"\n当前配置:")
        print(f"  threshold_must_publish: {threshold.current_must_publish:.1f}")
        print(f"  threshold_maybe_publish: {threshold.current_maybe_publish:.1f}")
        print(f"\n建议配置:")
        print(f"  threshold_must_publish: {threshold.suggested_must_publish:.1f} ({threshold.adjustment_must:+.1f})")
        print(f"  threshold_maybe_publish: {threshold.suggested_maybe_publish:.1f} ({threshold.adjustment_maybe:+.1f})")
        print(f"\n原因: {threshold.reason}")
    else:
        print("\n✓ 当前阈值合理，无需调整")
    
    # 权重优化
    print("\n" + "="*80)
    print("⚖️  权重优化建议")
    print("="*80)
    
    if report.weight_optimizations:
        for i, weight in enumerate(report.weight_optimizations, 1):
            print(f"\n{i}. {weight.dimension}")
            print(f"   置信度: {weight.confidence:.0%}")
            print(f"   当前值: {weight.current_max:.1f}")
            print(f"   建议值: {weight.suggested_max:.1f} ({weight.adjustment:+.1f})")
            print(f"   原因: {weight.reason}")
    else:
        print("\n✓ 当前权重合理，无需调整")
    
    # Few-shot 示例
    print("\n" + "="*80)
    print("📝 Few-shot 示例")
    print("="*80)
    
    if report.few_shot_examples:
        print(f"\n已生成 {len(report.few_shot_examples)} 个人工示例：\n")
        for i, example in enumerate(report.few_shot_examples, 1):
            print(f"{i}. {example.title[:60]}...")
            print(f"   系统: {example.system_decision} ({example.system_score:.0f}分) | 人工: {example.human_decision}")
            print(f"   原因: {example.feedback_reason}")
            if example.tags:
                print(f"   标签: {', '.join(example.tags)}")
            print()
    else:
        print("\n✓ 暂无足够的不一致案例生成 Few-shot 示例")


def save_detailed_report(
    report: OptimizationReport,
    config_diff: str,
    output_path: str,
):
    """保存详细报告"""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("# 策略优化报告\n\n")
        f.write(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        
        f.write("## 数据概览\n\n")
        f.write(f"- 反馈会话数: {report.feedback_sessions_count}\n")
        f.write(f"- 总反馈条数: {report.total_feedbacks}\n")
        f.write(f"- 不一致案例: {report.inconsistent_count}\n")
        f.write(f"- 总体置信度: {report.overall_confidence:.0%}\n\n")
        
        f.write("## 优化建议\n\n")
        f.write(config_diff)
        f.write("\n")
        
        if report.few_shot_examples:
            f.write("## Few-shot 示例\n\n")
            for i, example in enumerate(report.few_shot_examples, 1):
                f.write(f"### 示例 {i}\n\n")
                f.write(f"**标题**: {example.title}\n\n")
                f.write(f"**系统决策**: {example.system_decision} ({example.system_score:.1f}分)\n\n")
                f.write(f"**人工决策**: {example.human_decision}\n\n")
                f.write(f"**原因**: {example.feedback_reason}\n\n")
                if example.tags:
                    f.write(f"**标签**: {', '.join(example.tags)}\n\n")
        
        f.write("## 使用说明\n\n")
        f.write("1. 查看优化建议，评估是否合理\n")
        f.write("2. 如果接受建议，应用优化配置：\n")
        f.write("   ```bash\n")
        f.write("   cp config/optimized_settings.yaml config/base/settings.yaml\n")
        f.write("   ```\n")
        f.write("3. 重新运行选题测试效果\n")
        f.write("4. 继续收集反馈，形成迭代闭环\n")
    
    logger.info(f"详细报告已保存: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="策略优化器 - 基于人工反馈优化选题策略")
    parser.add_argument(
        "--config",
        default="config/base/settings.yaml",
        help="当前配置文件路径"
    )
    parser.add_argument(
        "--feedback-dir",
        default="feedback_history",
        help="反馈数据目录"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅分析，不生成配置文件"
    )
    parser.add_argument(
        "--auto-apply",
        action="store_true",
        help="自动应用优化（覆盖原配置）"
    )
    parser.add_argument(
        "--report-file",
        default="out/optimization_report.md",
        help="详细报告输出路径"
    )
    parser.add_argument(
        "--min-feedbacks",
        type=int,
        default=10,
        help="最少反馈数要求"
    )
    
    args = parser.parse_args()
    
    print("\n" + "="*80)
    print("🚀 策略优化器 - Phase 2")
    print("="*80)
    
    # 1. 加载当前配置
    logger.info(f"加载配置: {args.config}")
    current_config = load_current_config(args.config)
    
    # 2. 运行优化分析
    logger.info(f"分析反馈数据: {args.feedback_dir}")
    optimizer = StrategyOptimizer(
        feedback_dir=args.feedback_dir,
        min_feedbacks=args.min_feedbacks,
    )
    
    report = optimizer.optimize(current_config)
    
    # 3. 打印报告
    print_report(report)
    
    # 4. 生成配置文件
    if not args.dry_run:
        print("\n" + "="*80)
        print("💾 生成优化配置")
        print("="*80)
        
        config_gen = ConfigGenerator()
        
        # 生成优化配置
        optimized_config_path = config_gen.generate_optimized_config(
            current_config,
            report,
            output_path="config/optimized_settings.yaml"
        )
        
        print(f"\n✅ 优化配置已保存: {optimized_config_path}")
        
        # 生成差异摘要
        config_diff = config_gen.generate_diff_summary(current_config, report)
        
        # 生成 Few-shot prompt
        if report.few_shot_examples:
            prompt_gen = PromptGenerator()
            prompt_path = prompt_gen.generate_few_shot_prompt(
                report.few_shot_examples,
                output_path="prompts/topic_gate_few_shot.txt"
            )
            print(f"✅ Few-shot 提示已保存: {prompt_path}")
        
        # 保存详细报告
        save_detailed_report(report, config_diff, args.report_file)
        
        # 自动应用
        if args.auto_apply:
            import shutil
            shutil.copy(optimized_config_path, args.config)
            print(f"\n✅ 优化配置已自动应用到: {args.config}")
        else:
            print(f"\n💡 如需应用优化，请执行:")
            print(f"   cp config/optimized_settings.yaml {args.config}")
    else:
        print("\n💡 Dry-run 模式，未生成配置文件")
    
    print("\n" + "="*80)
    print("✅ 优化完成")
    print("="*80)
    
    # 返回值：置信度不足时返回 2，无优化建议时返回 1，成功返回 0
    if report.overall_confidence < 0.5:
        print("\n⚠️  警告: 置信度不足，建议继续收集反馈数据")
        return 2
    elif not report.threshold_optimization and not report.weight_optimizations:
        print("\n✓ 当前策略已较优，无需调整")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
