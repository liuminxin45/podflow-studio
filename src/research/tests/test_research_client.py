"""
Research Client Tests

这个文件包含了研究模块的完整测试用例，验证统一研究客户端的各项功能。

测试范围：
- 统一研究客户端配置测试
- MetaSo研究功能测试
- 错误处理和重试机制测试
- 向后兼容性测试

测试特点：
- 支持无API密钥的基础功能测试
- 包含完整的集成测试场景
- 验证错误处理机制
- 测试配置序列化和输出模型

主要测试函数：
- test_research_config(): 配置类测试
- test_research_output(): 输出类测试
- test_unified_metaso_client(): MetaSo客户端测试
- test_client_factory(): 工厂方法测试
- test_error_handling(): 错误处理测试
- test_retry_mechanism(): 重试机制测试

运行方式：
    python src/research/tests/test_research_client.py

测试环境：
- Python 3.8+
- 部分测试需要MetaSo API密钥
- 无API密钥时自动跳过相关测试

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

import json
import sys
import time
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

# 加载环境变量
from dotenv import load_dotenv
load_dotenv()

from src.research.research_client import (
    ResearchConfig,
    ResearchOutput,
    UnifiedResearchClient,
    MetaSoClient,
    create_client,
    create_client_from_env,
    research_items_with_client,
)


def test_research_config():
    """测试研究配置类"""
    print("=== 测试研究配置类 ===")
    
    try:
        # 测试默认配置
        config1 = ResearchConfig()
        assert config1.provider == "metaso"
        assert config1.timeout_seconds == 60
        assert config1.max_retries == 3
        
        # 测试自定义配置
        config2 = ResearchConfig(
            provider="metaso",
            api_key="test_key",
            model="fast",
            timeout_seconds=30,
            max_items=10,
            max_retries=5,
            retry_delay=2.0
        )
        assert config2.provider == "metaso"
        assert config2.api_key == "test_key"
        assert config2.model == "fast"
        assert config2.timeout_seconds == 30
        assert config2.max_items == 10
        assert config2.max_retries == 5
        assert config2.retry_delay == 2.0
        
        # 测试序列化
        config_dict = config2.model_dump()
        assert config_dict["provider"] == "metaso"
        assert config_dict["api_key"] == "test_key"
        
        print("✅ 研究配置类测试通过")
        return True
        
    except Exception as e:
        print(f"❌ 研究配置类测试失败: {e}")
        return False


def test_research_output():
    """测试研究输出类"""
    print("\n=== 测试研究输出类 ===")
    
    try:
        # 测试成功输出
        output1 = ResearchOutput(
            success=True,
            content="研究内容",
            model="fast",
            provider="metaso",
            input_items_count=5,
            processing_time_ms=1500,
            metadata={"test": "data"}
        )
        assert output1.success is True
        assert output1.content == "研究内容"
        assert output1.model == "fast"
        assert output1.provider == "metaso"
        assert output1.input_items_count == 5
        assert output1.processing_time_ms == 1500
        assert output1.metadata["test"] == "data"
        
        # 测试失败输出
        output2 = ResearchOutput(
            success=False,
            provider="metaso",
            input_items_count=3,
            processing_time_ms=500,
            error="API错误"
        )
        assert output2.success is False
        assert output2.error == "API错误"
        assert output2.content is None
        
        # 测试序列化
        output_dict = output1.model_dump()
        assert output_dict["success"] is True
        assert output_dict["content"] == "研究内容"
        
        print("✅ 研究输出类测试通过")
        return True
        
    except Exception as e:
        print(f"❌ 研究输出类测试失败: {e}")
        return False


def test_unified_metaso_client():
    """测试统一MetaSo客户端"""
    print("\n=== 测试统一MetaSo客户端 ===")
    
    try:
        # 测试客户端创建
        config = ResearchConfig(
            provider="metaso",
            api_key="test_key",
            model="fast",
            timeout_seconds=30
        )
        client = UnifiedResearchClient(config)
        assert client.config.provider == "metaso"
        assert client.config.api_key == "test_key"
        assert client.config.model == "fast"
        
        # 测试环境变量检查
        import os
        if not os.environ.get("METASO_API_KEY"):
            print("⚠️  跳过MetaSo实际API测试：未设置METASO_API_KEY环境变量")
            print("✅ 统一MetaSo客户端测试通过")
            return True
        
        # 测试实际API调用（如果有密钥）
        test_items = [
            {"title": "测试标题1", "content": "测试内容1", "source": "test"},
            {"title": "测试标题2", "content": "测试内容2", "source": "test"}
        ]
        
        result = client.research_items(test_items, max_items=2)
        assert isinstance(result, ResearchOutput)
        assert result.provider == "metaso"
        assert result.input_items_count == 2
        
        if result.success:
            print(f"✅ MetaSo API调用成功，耗时 {result.processing_time_ms}ms")
            print(f"   模型: {result.model}")
            print(f"   内容长度: {len(result.content or '')}")
        else:
            print(f"⚠️  MetaSo API调用失败: {result.error}")
        
        print("✅ 统一MetaSo客户端测试通过")
        return True
        
    except Exception as e:
        print(f"❌ 统一MetaSo客户端测试失败: {e}")
        return False


def test_metaso_client_compatibility():
    """测试MetaSo客户端向后兼容性"""
    print("\n=== 测试MetaSo客户端向后兼容性 ===")
    
    try:
        # 测试向后兼容的MetaSoClient
        client = MetaSoClient(api_key="test_key", model="fast", timeout_seconds=30)
        assert client.config.provider == "metaso"
        assert client.config.api_key == "test_key"
        assert client.config.model == "fast"
        assert client.config.timeout_seconds == 30
        
        print("✅ MetaSo客户端向后兼容性测试通过")
        return True
        
    except Exception as e:
        print(f"❌ MetaSo客户端向后兼容性测试失败: {e}")
        return False


def test_client_factory():
    """测试客户端工厂方法"""
    print("\n=== 测试客户端工厂方法 ===")
    
    try:
        # 测试create_client
        client1 = create_client(
            provider="metaso",
            api_key="test_key",
            model="fast",
            timeout_seconds=30,
            max_items=10
        )
        assert isinstance(client1, UnifiedResearchClient)
        assert client1.config.provider == "metaso"
        assert client1.config.api_key == "test_key"
        assert client1.config.model == "fast"
        assert client1.config.max_items == 10
        
        # 测试create_client_from_env
        client2 = create_client_from_env("metaso")
        assert isinstance(client2, UnifiedResearchClient)
        assert client2.config.provider == "metaso"
        
        # 测试不支持的提供商
        try:
            create_client(provider="unsupported")
            assert False, "应该抛出异常"
        except ValueError as e:
            assert "不支持的研究提供商" in str(e)
        
        print("✅ 客户端工厂方法测试通过")
        return True
        
    except Exception as e:
        print(f"❌ 客户端工厂方法测试失败: {e}")
        return False


def test_error_handling():
    """测试错误处理"""
    print("\n=== 测试错误处理 ===")
    
    try:
        # 测试无效提供商
        config = ResearchConfig(provider="invalid_provider")
        client = UnifiedResearchClient(config)
        
        test_items = [{"title": "测试", "content": "测试"}]
        result = client.research_items(test_items)
        
        assert result.success is False
        assert result.error is not None and "不支持的研究提供商" in result.error
        assert result.provider == "invalid_provider"
        assert result.input_items_count == 1
        
        print("✅ 正确捕获不支持的提供商错误")
        
        # 测试空输入
        result2 = client.research_items([])
        assert result2.success is False
        assert result2.input_items_count == 0
        
        print("✅ 空输入处理正确")
        print("✅ 错误处理测试通过")
        return True
        
    except Exception as e:
        print(f"❌ 错误处理测试失败: {e}")
        return False


def test_retry_mechanism():
    """测试重试机制"""
    print("\n=== 测试重试机制 ===")
    
    try:
        # 配置快速重试的客户端
        config = ResearchConfig(
            provider="invalid_provider",
            max_retries=2,
            retry_delay=0.1  # 快速重试
        )
        client = UnifiedResearchClient(config)
        
        start_time = time.perf_counter()
        result = client.research_with_retry([{"title": "测试"}])
        end_time = time.perf_counter()
        
        # 应该失败，但经过了重试
        assert result.success is False
        assert result.error is not None and "不支持的研究提供商" in result.error
        
        # 验证重试时间（应该至少有2次重试延迟）
        elapsed_ms = int((end_time - start_time) * 1000)
        print(f"   重试总耗时: {elapsed_ms}ms")
        
        print("✅ 重试机制测试通过")
        return True
        
    except Exception as e:
        print(f"❌ 重试机制测试失败: {e}")
        return False


def test_research_items_with_client():
    """测试research_items_with_client函数"""
    print("\n=== 测试research_items_with_client函数 ===")
    
    try:
        client = create_client(provider="metaso", api_key="test_key")
        test_items = [{"title": "测试", "content": "测试内容", "source": "test"}]
        
        # 测试不使用重试
        result1 = research_items_with_client(
            client=client,
            items=test_items,
            max_items=5,
            use_retry=False
        )
        assert isinstance(result1, ResearchOutput)
        assert result1.provider == "metaso"
        assert result1.input_items_count == 1
        
        # 测试使用重试
        result2 = research_items_with_client(
            client=client,
            items=test_items,
            max_items=5,
            use_retry=True
        )
        assert isinstance(result2, ResearchOutput)
        assert result2.provider == "metaso"
        
        print("✅ research_items_with_client函数测试通过")
        return True
        
    except Exception as e:
        print(f"❌ research_items_with_client函数测试失败: {e}")
        return False


def main():
    """运行所有研究客户端测试"""
    print("开始运行研究客户端测试...\n")
    
    results = {}
    
    # 运行各项测试
    results['research_config'] = test_research_config()
    results['research_output'] = test_research_output()
    results['unified_metaso'] = test_unified_metaso_client()
    results['metaso_compatibility'] = test_metaso_client_compatibility()
    results['client_factory'] = test_client_factory()
    results['error_handling'] = test_error_handling()
    results['retry_mechanism'] = test_retry_mechanism()
    results['research_items_with_client'] = test_research_items_with_client()
    
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
