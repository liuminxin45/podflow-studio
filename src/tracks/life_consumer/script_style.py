"""
Life Consumer Script Style

国内生活消费赛道的脚本风格
"""

from __future__ import annotations

from typing import Any, Dict, List

from src.tracks.base import ScriptStyle


class LifeConsumerScriptStyle(ScriptStyle):
    """国内生活消费脚本风格
    
    特点：
    - 口语化、接地气
    - 强调实用性和可操作性
    - 结构清晰：是什么 → 为什么 → 怎么办
    """
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
    
    def get_style_name(self) -> str:
        return "life_consumer_practical"
    
    def get_narration_guidelines(self) -> str:
        return """口播风格指导：

1. 语言风格
   - 口语化、接地气，像朋友聊天
   - 避免官方腔调和专业术语
   - 多用"咱们"、"大家"、"你"等亲切称呼

2. 内容重点
   - 开头直接说"这事儿跟你有什么关系"
   - 中间讲清楚"为什么会这样"
   - 结尾给出"你能做什么"

3. 实用性
   - 给出具体建议和行动指南
   - 提供省钱、避坑、维权的方法
   - 分享相关资源和渠道

4. 情感共鸣
   - 理解听众的焦虑和困惑
   - 用真实案例引发共鸣
   - 保持客观但有温度"""
    
    def get_section_structure(self) -> List[str]:
        return [
            "开场：这事儿跟你有什么关系",
            "背景：事情是怎么发生的",
            "分析：为什么会这样",
            "影响：对你的生活有什么影响",
            "建议：你可以做什么",
            "总结：一句话记住重点",
        ]
