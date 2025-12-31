"""
Few-shot Prompt 生成器 - 生成优化后的 LLM 提示
"""

from pathlib import Path
from typing import List
import logging

from .optimizer import FewShotExample


logger = logging.getLogger(__name__)


class PromptGenerator:
    """提示生成器"""
    
    def generate_few_shot_prompt(
        self,
        examples: List[FewShotExample],
        output_path: str = "prompts/topic_gate_few_shot.txt",
    ) -> Path:
        """
        生成 Few-shot 提示文本
        
        Args:
            examples: Few-shot 示例列表
            output_path: 输出路径
        
        Returns:
            生成的提示文件路径
        """
        if not examples:
            logger.warning("没有 Few-shot 示例，跳过生成")
            return None
        
        lines = []
        lines.append("# 人工反馈示例\n")
        lines.append("以下是基于真实人工审核的判断示例，请参考这些标准来评估新主题：\n")
        
        for i, example in enumerate(examples, 1):
            lines.append(f"## 示例 {i}")
            lines.append(f"**标题**: {example.title}")
            lines.append(f"**系统决策**: {example.system_decision} ({example.system_score:.1f}分)")
            lines.append(f"**人工决策**: {example.human_decision}")
            lines.append(f"**原因**: {example.feedback_reason}")
            if example.tags:
                lines.append(f"**标签**: {', '.join(example.tags)}")
            lines.append("")
        
        # 总结
        lines.append("---\n")
        lines.append("## 关键启示\n")
        
        # 分析拒绝原因
        reject_examples = [ex for ex in examples if ex.human_decision == 'REJECT']
        if reject_examples:
            lines.append("### 应避免的主题类型\n")
            all_tags = []
            for ex in reject_examples:
                all_tags.extend(ex.tags)
            
            # 统计高频标签
            from collections import Counter
            tag_counts = Counter(all_tags)
            for tag, count in tag_counts.most_common(5):
                lines.append(f"- **{tag}** (出现 {count} 次)")
            lines.append("")
        
        lines.append("请在评估新主题时，参考这些人工判断标准。")
        
        # 保存
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        prompt_text = "\n".join(lines)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(prompt_text)
        
        logger.info(f"Few-shot 提示已保存: {output_path}")
        return output_path
    
    def generate_system_prompt_enhancement(
        self,
        examples: List[FewShotExample],
    ) -> str:
        """
        生成系统提示增强文本（用于插入到现有 system prompt）
        
        Returns:
            增强文本
        """
        if not examples:
            return ""
        
        lines = []
        lines.append("\n以下是人工审核的真实案例，供你参考：\n")
        
        for i, example in enumerate(examples, 1):
            lines.append(f"【案例 {i}】")
            lines.append(f"主题：{example.title}")
            lines.append(f"系统评估：{example.system_decision} ({example.system_score:.0f}分)")
            lines.append(f"人工判断：{example.human_decision}")
            lines.append(f"原因：{example.feedback_reason}")
            lines.append("")
        
        lines.append("请基于这些人工判断标准来评估新主题。")
        
        return "\n".join(lines)
