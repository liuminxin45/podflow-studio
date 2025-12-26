#!/usr/bin/env python3
"""
Prompts System Demo Script

这个文件是提示词系统的演示脚本，展示如何使用新的统一提示词架构。

功能概述：
- 演示各种提示词构建函数的使用
- 展示不同场景下的提示词配置
- 提供实际的代码示例和输出结果
- 帮助开发者理解提示词系统架构

演示内容：
- 基础新闻脚本提示词构建
- 研究型脚本提示词构建
- 详细新闻脚本提示词构建
- 增强型脚本提示词构建
- 内容风格提示词获取

使用场景：
- 开发者学习提示词系统
- 测试不同提示词效果
- 验证提示词配置正确性
- 作为集成参考示例

运行方式：
    python demo_prompts.py

输出内容：
- 各种提示词的系统提示部分
- 用户提示部分和参数
- 提示词长度统计
- 实际使用示例代码

依赖要求：
- 需要配置LLM API密钥（用于实际调用演示）
- 支持DeepSeek和Moonshot模型

作者：Auto-Podcast Team
版本：2.0.0
更新：2025-12-25
"""

import os
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.llm.prompts import (
    build_research_script_prompt,
    build_news_script_prompt,
    build_enhanced_script_prompt,
    get_content_style_prompt,
    get_ssml_optimization_hints,
    CONTENT_STYLE_TEMPLATES,
)

def demo_prompts():
    """演示各种提示词"""
    
    print("=" * 70)
    print("🎯 LLM提示词系统演示")
    print("=" * 70)
    
    # 模拟频道配置
    channel = {
        "name": "生活消费快嘴秀",
        "style": {
            "tone": "口语化、生动、像朋友聊天",
            "audience": "普通消费者"
        }
    }
    
    # 模拟新闻条目
    class MockItem:
        def __init__(self, title, url):
            self.title = title
            self.url = url
    
    items = [
        MockItem("央行宣布降准0.5个百分点", "https://example.com/news1"),
        MockItem("海南免税店销售破亿", "https://example.com/news2"),
    ]
    
    research_content = """
    央行于12月25日宣布下调金融机构存款准备金率0.5个百分点，
    此次降准将释放长期资金约1万亿元，有助于保持流动性合理充裕。
    """
    
    citations = [
        {"title": "央行降准公告", "link": "https://example.com/central-bank", "snippet": "央行宣布降准0.5个百分点"}
    ]
    
    print("\n📋 1. 基础研究内容提示词")
    print("-" * 50)
    system1, user1 = build_research_script_prompt(
        channel=channel,
        items=items,
        research_content=research_content,
        citations=citations,
    )
    print(f"系统提示词:\n{system1}")
    print(f"\n用户提示词:\n{user1[:300]}...")
    
    print("\n📋 2. 基础新闻内容提示词")
    print("-" * 50)
    system2, user2 = build_news_script_prompt(
        channel=channel,
        items=items,
    )
    print(f"系统提示词:\n{system2}")
    print(f"\n用户提示词:\n{user2[:300]}...")
    
    print("\n📋 3. 增强版新闻内容提示词（故事风格）")
    print("-" * 50)
    system3, user3 = build_enhanced_script_prompt(
        channel=channel,
        items=items,
        content_type="story",
        include_research=False,
        enable_advanced_ssml=True,
    )
    print(f"系统提示词:\n{system3}")
    print(f"\n用户提示词:\n{user3[:300]}...")
    
    print("\n📋 4. 内容风格模板")
    print("-" * 50)
    for style_type, config in CONTENT_STYLE_TEMPLATES.items():
        print(f"\n{style_type} 风格:")
        print(f"  语调: {config['tone']}")
        print(f"  SSML特点: {config['ssml_hints']}")
        print(f"  结构: {config['structure_hints']}")
    
    print("\n📋 5. SSML优化建议")
    print("-" * 50)
    ssml_hints = get_ssml_optimization_hints()
    print(ssml_hints)

def demo_environment_setup():
    """演示环境变量配置"""
    
    print("\n" + "=" * 70)
    print("⚙️ 环境变量配置演示")
    print("=" * 70)
    
    print("\n可以设置以下环境变量来控制提示词行为：")
    print("\n📊 基础配置:")
    print("  SCRIPT_PROMPT_MAX_ITEMS=8                    # 最大新闻条目数")
    print("  SCRIPT_PROMPT_MAX_RESEARCH_CHARS=6000       # 研究内容最大字符数")
    print("  SCRIPT_PROMPT_MAX_CITATIONS=3               # 最大引用数")
    
    print("\n🎨 高级配置:")
    print("  SCRIPT_PROMPT_CONTENT_TYPE=chat             # 内容类型 (news/story/chat/teaching/emotion)")
    print("  SCRIPT_PROMPT_ENABLE_ADVANCED_SSML=true     # 启用高级SSML控制")
    print("  SCRIPT_PROMPT_VERSION=v2.0                  # 提示词版本 (v1.0/v1.1/v2.0)")
    
    print("\n📝 使用示例:")
    print("  # 设置为故事讲述风格，启用高级SSML")
    print("  export SCRIPT_PROMPT_CONTENT_TYPE=story")
    print("  export SCRIPT_PROMPT_ENABLE_ADVANCED_SSML=true")
    print("  export SCRIPT_PROMPT_VERSION=v2.0")

def demo_advanced_usage():
    """演示高级用法"""
    
    print("\n" + "=" * 70)
    print("🔧 高级用法演示")
    print("=" * 70)
    
    print("\n1. 自定义内容风格:")
    print("""
# 获取特定风格配置
style_config = get_content_style_prompt("teaching")
print(f"教学风格语调: {style_config['tone']}")
""")
    
    print("\n2. 构建自定义提示词:")
    print("""
# 构建教学风格的增强提示词
system, user = build_enhanced_script_prompt(
    channel=channel,
    items=items,
    content_type="teaching",  # 教学风格
    include_research=True,   # 包含研究内容
    enable_advanced_ssml=True,  # 启用高级SSML
)
""")
    
    print("\n3. 动态切换风格:")
    print("""
# 根据内容类型动态选择风格
content_types = ["news", "story", "chat"]
for content_type in content_types:
    system, user = build_enhanced_script_prompt(
        channel=channel,
        items=items,
        content_type=content_type,
        enable_advanced_ssml=True,
    )
    # 为每种风格生成不同的播客脚本
""")

if __name__ == "__main__":
    print("🚀 LLM提示词系统演示开始")
    
    demo_prompts()
    demo_environment_setup()
    demo_advanced_usage()
    
    print("\n" + "=" * 70)
    print("✅ 演示完成！")
    print("=" * 70)
    print("\n💡 总结:")
    print("  - 提示词系统已模块化，便于管理和扩展")
    print("  - 支持多种内容风格（新闻、故事、聊天、教学、情感）")
    print("  - 支持高级SSML控制")
    print("  - 可通过环境变量灵活配置")
    print("  - 易于测试和优化不同的提示词策略")