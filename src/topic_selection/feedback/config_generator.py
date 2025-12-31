"""
配置生成器 - 生成优化后的配置文件
"""

import yaml
from pathlib import Path
from typing import Dict
import logging

from .optimizer import OptimizationReport


logger = logging.getLogger(__name__)


class ConfigGenerator:
    """配置生成器"""
    
    def generate_optimized_config(
        self,
        current_config: dict,
        optimization_report: OptimizationReport,
        output_path: str = "config/optimized_settings.yaml",
    ) -> Path:
        """
        生成优化后的配置文件
        
        Args:
            current_config: 当前配置
            optimization_report: 优化报告
            output_path: 输出路径
        
        Returns:
            生成的配置文件路径
        """
        # 深拷贝配置
        import copy
        optimized_config = copy.deepcopy(current_config)
        
        # 应用阈值优化
        if optimization_report.threshold_optimization:
            threshold_opt = optimization_report.threshold_optimization
            
            if threshold_opt.confidence >= 0.6:
                scoring = optimized_config.setdefault('auto_topic', {}).setdefault('scoring', {})
                scoring['threshold_must_publish'] = round(threshold_opt.suggested_must_publish, 1)
                scoring['threshold_maybe_publish'] = round(threshold_opt.suggested_maybe_publish, 1)
                
                logger.info(
                    f"应用阈值优化: "
                    f"must {threshold_opt.current_must_publish:.1f} → {threshold_opt.suggested_must_publish:.1f}, "
                    f"maybe {threshold_opt.current_maybe_publish:.1f} → {threshold_opt.suggested_maybe_publish:.1f}"
                )
        
        # 应用权重优化
        for weight_opt in optimization_report.weight_optimizations:
            if weight_opt.confidence >= 0.5:
                scoring = optimized_config.setdefault('auto_topic', {}).setdefault('scoring', {})
                scoring[weight_opt.dimension] = round(weight_opt.suggested_max, 1)
                
                logger.info(
                    f"应用权重优化: {weight_opt.dimension} "
                    f"{weight_opt.current_max:.1f} → {weight_opt.suggested_max:.1f}"
                )
        
        # 保存配置
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            yaml.dump(
                optimized_config,
                f,
                default_flow_style=False,
                allow_unicode=True,
                sort_keys=False,
            )
        
        logger.info(f"优化配置已保存: {output_path}")
        return output_path
    
    def generate_diff_summary(
        self,
        current_config: dict,
        optimization_report: OptimizationReport,
    ) -> str:
        """
        生成配置差异摘要
        
        Returns:
            差异摘要文本
        """
        lines = []
        lines.append("# 配置优化差异摘要\n")
        
        # 阈值变化
        if optimization_report.threshold_optimization:
            threshold_opt = optimization_report.threshold_optimization
            lines.append("## 阈值调整\n")
            lines.append(f"**置信度**: {threshold_opt.confidence:.0%}\n")
            lines.append(f"- `threshold_must_publish`: {threshold_opt.current_must_publish:.1f} → **{threshold_opt.suggested_must_publish:.1f}** ({threshold_opt.adjustment_must:+.1f})")
            lines.append(f"- `threshold_maybe_publish`: {threshold_opt.current_maybe_publish:.1f} → **{threshold_opt.suggested_maybe_publish:.1f}** ({threshold_opt.adjustment_maybe:+.1f})")
            lines.append(f"\n**原因**: {threshold_opt.reason}\n")
        
        # 权重变化
        if optimization_report.weight_optimizations:
            lines.append("## 权重调整\n")
            for weight_opt in optimization_report.weight_optimizations:
                lines.append(f"### {weight_opt.dimension}")
                lines.append(f"**置信度**: {weight_opt.confidence:.0%}")
                lines.append(f"- 当前值: {weight_opt.current_max:.1f}")
                lines.append(f"- 建议值: **{weight_opt.suggested_max:.1f}** ({weight_opt.adjustment:+.1f})")
                lines.append(f"- 原因: {weight_opt.reason}\n")
        
        return "\n".join(lines)
