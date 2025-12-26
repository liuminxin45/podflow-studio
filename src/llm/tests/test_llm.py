"""
LLM模块测试用例
测试API客户端和提示词功能
"""

import json
import os
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from src.llm.api_client import UnifiedLLMClient, DeepSeekClient, MoonshotClient, ScriptInputItem
from src.llm.prompts import (
    build_news_script_prompt,
    build_research_script_prompt,
    build_detailed_news_script_prompt,
    build_enhanced_script_prompt
)


def create_test_items():
    """创建测试用的新闻条目"""
    return [
        ScriptInputItem(
            id="1",
            title="央行宣布降准0.5个百分点，释放流动性约1万亿元",
            summary="中国人民银行宣布下调金融机构存款准备金率0.5个百分点，释放长期资金约1万亿元。",
            url="https://example.com/news1",
            published_at="2025-12-25"
        ),
        ScriptInputItem(
            id="2", 
            title="华为发布新款AI芯片，性能提升50%",
            summary="华为技术有限公司发布新一代人工智能芯片，性能较上一代提升50%。",
            url="https://example.com/news2",
            published_at="2025-12-25"
        ),
        ScriptInputItem(
            id="3",
            title="北京地铁新线路开通，日均客流量预计增加20万",
            summary="北京市轨道交通新线路正式开通运营，预计日均客流量将增加20万人次。",
            url="https://example.com/news3", 
            published_at="2025-12-25"
        )
    ]


def create_test_channel():
    """创建测试用的频道配置"""
    return {
        "name": "科技财经快评",
        "style": {
            "tone": "专业、客观、有深度",
            "audience": "关注科技和财经的职场人士"
        }
    }


def test_prompt_building():
    """测试提示词构建功能"""
    print("=== 测试提示词构建 ===")
    
    items = create_test_items()
    channel = create_test_channel()
    
    try:
        # 测试基础新闻提示词
        system, user = build_news_script_prompt(
            channel=channel,
            items=items
        )
        print("✅ 基础新闻提示词构建成功")
        print(f"系统提示词长度: {len(system)}")
        print(f"用户提示词长度: {len(user)}")
        
        # 测试研究提示词
        system2, user2 = build_research_script_prompt(
            channel=channel,
            items=items,
            research_content="这是测试研究内容...",
            citations=[{"title": "测试引用", "link": "https://example.com", "snippet": "测试片段"}]
        )
        print("✅ 研究提示词构建成功")
        
        # 测试详细提示词
        system3, user3 = build_detailed_news_script_prompt(
            channel=channel,
            items=items
        )
        print("✅ 详细提示词构建成功")
        
        # 测试增强提示词
        system4, user4 = build_enhanced_script_prompt(
            channel=channel,
            items=items,
            content_type="news",
            enable_advanced_ssml=True
        )
        print("✅ 增强提示词构建成功")
        
        return True
        
    except Exception as e:
        print(f"❌ 提示词构建测试失败: {e}")
        return False


def test_deepseek_client():
    """测试DeepSeek客户端"""
    print("\n=== 测试DeepSeek客户端 ===")
    
    # 检查环境变量
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        print("⚠️  跳过DeepSeek测试：未设置DEEPSEEK_API_KEY环境变量")
        return True  # 跳过不算失败
    
    try:
        client = DeepSeekClient(
            base_url="https://api.deepseek.com/v1",
            api_key=api_key,
            model="deepseek-chat",
            timeout_seconds=60
        )
        
        items = create_test_items()
        channel = create_test_channel()
        
        # 测试基础生成
        result = client.generate(
            channel=channel,
            items=items,
            temperature=0.7
        )
        
        print("✅ DeepSeek基础生成成功")
        print(f"生成标题: {result.title}")
        print(f"标签数量: {len(result.tags)}")
        print(f"SSML长度: {len(result.ssml)}")
        
        return True
        
    except Exception as e:
        print(f"❌ DeepSeek客户端测试失败: {e}")
        return False


def test_moonshot_client():
    """测试Moonshot客户端"""
    print("\n=== 测试Moonshot客户端 ===")
    
    # 检查环境变量
    api_key = os.environ.get("MOONSHOT_API_KEY")
    if not api_key:
        print("⚠️  跳过Moonshot测试：未设置MOONSHOT_API_KEY环境变量")
        return True  # 跳过不算失败
    
    try:
        client = MoonshotClient(
            base_url="https://api.moonshot.cn/v1",
            api_key=api_key,
            model="moonshot-v1-8k",
            timeout_seconds=60
        )
        
        items = create_test_items()
        channel = create_test_channel()
        
        # 测试基础生成
        result = client.generate(
            channel=channel,
            items=items,
            temperature=0.7
        )
        
        print("✅ Moonshot基础生成成功")
        print(f"生成标题: {result.title}")
        print(f"标签数量: {len(result.tags)}")
        
        return True
        
    except Exception as e:
        print(f"❌ Moonshot客户端测试失败: {e}")
        return False


def test_unified_client():
    """测试统一客户端"""
    print("\n=== 测试统一客户端 ===")
    
    # 检查环境变量
    api_key = os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("MOONSHOT_API_KEY")
    if not api_key:
        print("⚠️  跳过统一客户端测试：未设置API密钥环境变量")
        return True
    
    try:
        # 根据可用的API密钥选择提供商
        if os.environ.get("DEEPSEEK_API_KEY"):
            provider = "deepseek"
            base_url = "https://api.deepseek.com/v1"
            model = "deepseek-chat"
        else:
            provider = "moonshot"
            base_url = "https://api.moonshot.cn/v1"
            model = "moonshot-v1-8k"
        
        client = UnifiedLLMClient(
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout_seconds=60,
            provider=provider
        )
        
        items = create_test_items()
        channel = create_test_channel()
        
        # 测试详细生成
        result = client.generate_detailed(
            channel=channel,
            items=items,
            temperature=0.7
        )
        
        print(f"✅ 统一客户端({provider})生成成功")
        print(f"生成标题: {result.title}")
        
        return True
        
    except Exception as e:
        print(f"❌ 统一客户端测试失败: {e}")
        return False


def save_test_data(data, filename):
    """保存测试数据到文件"""
    test_data_dir = Path(__file__).parent / "test_data"
    test_data_dir.mkdir(exist_ok=True)
    
    output_file = test_data_dir / filename
    
    if hasattr(data, 'model_dump'):
        # Pydantic模型
        content = data.model_dump()
    else:
        # 普通数据
        content = data
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(content, f, ensure_ascii=False, indent=2)
    
    print(f"测试数据已保存到: {output_file}")


def main():
    """运行所有LLM测试"""
    print("开始运行LLM模块测试...\n")
    
    results = {}
    
    # 运行各项测试
    results['prompt_building'] = test_prompt_building()
    results['deepseek_client'] = test_deepseek_client()
    results['moonshot_client'] = test_moonshot_client()
    results['unified_client'] = test_unified_client()
    
    # 统计结果
    passed = sum(results.values())
    total = len(results)
    
    print(f"\n=== 测试结果 ===")
    print(f"通过: {passed}/{total}")
    
    for test_name, result in results.items():
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{test_name}: {status}")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
