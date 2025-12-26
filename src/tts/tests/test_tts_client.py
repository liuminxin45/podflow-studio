"""
Unified TTS Client Tests

这个文件包含了统一TTS客户端的完整测试用例，验证新架构的各项功能。

测试范围：
- TTS配置类的创建和验证
- TTS输出类的操作和文件保存
- 统一客户端的各种合成模式
- 客户端工厂方法的正确性
- 错误处理和异常恢复
- 环境变量检查功能

测试模式：
- default: 默认TTS模式测试
- podcast: 播客合成模式测试
- voiceclone_http: VoiceClone HTTP模式测试
- tts_v3_http: TTS V3 HTTP模式测试
- tts_v3_ws: TTS V3 WebSocket模式测试

测试特点：
- 支持无API密钥的基础功能测试
- 包含完整的集成测试场景
- 验证错误处理机制
- 测试配置序列化和元数据操作

主要测试函数：
- test_tts_config(): 配置类测试
- test_tts_output(): 输出类测试
- test_unified_doubao_client(): 豆包客户端测试
- test_unified_doubao_podcast_client(): 豆包播客客户端测试
- test_client_factory(): 工厂方法测试
- test_error_handling(): 错误处理测试

运行方式：
    python src/tts/tests/test_tts_client.py

测试环境：
- Python 3.8+
- 部分测试需要豆包TTS API密钥
- 无API密钥时自动跳过相关测试

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

import json
import os
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from src.tts.tts_client import (
    UnifiedTTSClient,
    TTSClientFactory,
    TTSConfig,
    TTSOutput,
    check_doubao_env,
    get_doubao_env_status
)
from src.utils.test_utils import TestResultManager


def create_test_ssml():
    """创建测试用的SSML内容"""
    return """<speak>
朋友们大家好，欢迎收听《科技生活播客》。

<break time="500ms"/>

今天我们来聊三个话题。<break time="300ms"/>

第一，人工智能技术又有新突破。<break time="200ms"/>
研究人员开发出了更先进的算法，<break time="200ms"/>
这让机器学习变得更加高效。<break time="500ms"/>

第二，新能源汽车市场持续火热。<break time="200ms"/>
各大厂商纷纷推出新车型，<break time="200ms"/>
消费者的选择也越来越丰富。<break time="500ms"/>

第三，数字支付普及率再创新高。<break time="200ms"/>
移动支付已经成为我们日常生活的重要组成部分。<break time="500ms"/>

感谢大家的收听，我们下期再见。
</speak>"""


def create_test_text():
    """创建测试用的文本内容"""
    return """朋友们大家好，欢迎收听《科技生活播客》。

今天我们来聊三个话题。

第一，人工智能技术又有新突破。研究人员开发出了更先进的算法，这让机器学习变得更加高效。

第二，新能源汽车市场持续火热。各大厂商纷纷推出新车型，消费者的选择也越来越丰富。

第三，数字支付普及率再创新高。移动支付已经成为我们日常生活的重要组成部分。

感谢大家的收听，我们下期再见。"""


def test_tts_config():
    """测试TTS配置类"""
    print("=== 测试TTS配置类 ===")
    
    try:
        # 测试基础配置
        config = TTSConfig(
            provider="doubao",
            voice_type="BV001_streaming",
            speed=1.0,
            volume=1.0
        )
        
        assert config.provider == "doubao"
        assert config.voice_type == "BV001_streaming"
        assert config.speed == 1.0
        assert config.volume == 1.0
        
        print("✅ TTS配置类测试通过")
        return True
        
    except Exception as e:
        print(f"❌ TTS配置类测试失败: {e}")
        return False


def test_tts_output():
    """测试TTS输出类"""
    print("\n=== 测试TTS输出类 ===")
    
    try:
        # 创建测试音频数据
        test_audio_data = b"fake_audio_data_for_testing"
        
        output = TTSOutput(
            audio_data=test_audio_data,
            format="mp3",
            sample_rate=24000,
            metadata={"test": True}
        )
        
        # 测试属性
        assert output.format == "mp3"
        assert output.sample_rate == 24000
        assert output.size_bytes == len(test_audio_data)
        assert output.size_mb == len(test_audio_data) / (1024 * 1024)
        assert output.metadata["test"] is True
        
        # 测试保存功能
        test_file = Path(__file__).parent / "test_data" / "test_output.mp3"
        saved_path = output.save_to_file(test_file)
        
        assert saved_path.exists()
        assert saved_path.stat().st_size == len(test_audio_data)
        
        print(f"✅ TTS输出类测试通过")
        print(f"   测试文件: {saved_path}")
        print(f"   文件大小: {output.size_bytes} bytes")
        
        return True
        
    except Exception as e:
        print(f"❌ TTS输出类测试失败: {e}")
        return False


def test_unified_doubao_client():
    """测试统一豆包TTS客户端"""
    print("\n=== 测试统一豆包TTS客户端 ===")
    
    # 检查环境变量
    if not check_doubao_env():
        print("⚠️  跳过豆包TTS测试：环境变量未配置")
        env_status = get_doubao_env_status()
        print(f"   环境变量状态: {env_status}")
        return True  # 跳过不算失败
    
    try:
        # 使用工厂方法创建客户端
        client = TTSClientFactory.create_doubao_client(
            voice_type="BV001_streaming",
            timeout_seconds=30
        )
        
        # 测试文本合成
        test_text = create_test_text()
        output_path = Path(__file__).parent / "test_data" / "unified_doubao_test.mp3"
        
        print("开始统一豆包TTS文本合成测试...")
        
        # 方法1：合成到内存
        result = client.synthesize(test_text)
        
        if result.audio_data:
            print(f"✅ 内存合成成功")
            print(f"   音频大小: {result.size_mb:.2f} MB")
            print(f"   格式: {result.format}")
            print(f"   元数据: {result.metadata}")
        else:
            print("❌ 内存合成失败：无音频数据")
            return False
        
        # 方法2：直接合成到文件
        saved_path = client.synthesize_to_file(
            test_text,
            output_path
        )
        
        if saved_path.exists():
            print(f"✅ 文件合成成功")
            print(f"   输出文件: {saved_path}")
            print(f"   文件大小: {saved_path.stat().st_size} bytes")
        else:
            print("❌ 文件合成失败：文件未生成")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ 统一豆包TTS客户端测试失败: {e}")
        return False


def test_unified_doubao_podcast_client():
    """测试统一豆包播客客户端"""
    print("\n=== 测试统一豆包播客客户端 ===")
    
    # 检查环境变量
    if not check_doubao_env():
        print("⚠️  跳过豆包播客测试：环境变量未配置")
        return True  # 跳过不算失败
    
    try:
        # 使用工厂方法创建客户端
        client = TTSClientFactory.create_doubao_podcast_client(
            timeout_seconds=30
        )
        
        # 测试SSML合成
        test_ssml = create_test_ssml()
        output_path = Path(__file__).parent / "test_data" / "unified_podcast_test.mp3"
        
        print("开始统一豆包播客合成测试...")
        
        result = client.synthesize(test_ssml)
        
        if result.audio_data:
            print(f"✅ 播客合成成功")
            print(f"   音频大小: {result.size_mb:.2f} MB")
            print(f"   格式: {result.format}")
            print(f"   元数据: {result.metadata}")
            
            # 保存到文件
            saved_path = result.save_to_file(output_path)
            print(f"   保存文件: {saved_path}")
        else:
            print("❌ 播客合成失败：无音频数据")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ 统一豆包播客客户端测试失败: {e}")
        return False


def test_client_factory():
    """测试客户端工厂"""
    print("\n=== 测试客户端工厂 ===")
    
    try:
        # 测试通用创建方法
        client1 = TTSClientFactory.create_client(
            provider="doubao",
            voice_type="BV001_streaming",
            timeout_seconds=30
        )
        
        assert isinstance(client1, UnifiedTTSClient)
        assert client1.provider == "doubao"
        assert client1.config.voice_type == "BV001_streaming"
        
        client2 = TTSClientFactory.create_client(
            provider="doubao_podcast",
            timeout_seconds=30
        )
        
        assert isinstance(client2, UnifiedTTSClient)
        assert client2.provider == "doubao_podcast"
        
        print("✅ 客户端工厂测试通过")
        return True
        
    except Exception as e:
        print(f"❌ 客户端工厂测试失败: {e}")
        return False


def test_error_handling():
    """测试错误处理"""
    print("\n=== 测试错误处理 ===")
    
    try:
        # 测试不支持的提供商
        try:
            config = TTSConfig(provider="unsupported_provider")
            client = UnifiedTTSClient(config, timeout_seconds=30)
            print("❌ 应该抛出错误但没有")
            return False
        except ValueError as e:
            print(f"✅ 正确捕获不支持的提供商错误: {e}")
        
        # 测试空音频数据处理
        empty_output = TTSOutput(audio_data=b"")
        assert empty_output.size_bytes == 0
        assert empty_output.size_mb == 0.0
        print("✅ 空音频数据处理正确")
        
        return True
        
    except Exception as e:
        print(f"❌ 错误处理测试失败: {e}")
        return False


def create_test_input_files():
    """创建测试输入文件"""
    test_data_dir = Path(__file__).parent / "test_data"
    test_data_dir.mkdir(exist_ok=True)
    
    # 保存测试文本
    text_file = test_data_dir / "test_text.txt"
    with open(text_file, 'w', encoding='utf-8') as f:
        f.write(create_test_text())
    print(f"测试文本已保存到: {text_file}")
    
    # 保存测试SSML
    ssml_file = test_data_dir / "test_ssml.ssml"
    with open(ssml_file, 'w', encoding='utf-8') as f:
        f.write(create_test_ssml())
    print(f"测试SSML已保存到: {ssml_file}")
    
    # 保存测试配置
    config = {
        "doubao": {
            "provider": "doubao",
            "voice_type": "BV001_streaming",
            "speed": 1.0,
            "volume": 1.0,
            "sample_rate": 24000
        },
        "doubao_podcast": {
            "provider": "doubao_podcast",
            "sample_rate": 24000
        }
    }
    
    config_file = test_data_dir / "tts_client_config.json"
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    print(f"测试配置已保存到: {config_file}")


def main():
    """运行所有统一TTS客户端测试"""
    print("开始运行统一TTS客户端测试...\n")
    
    # 检查是否启用自动清理
    auto_cleanup = "--no-cleanup" not in sys.argv
    if auto_cleanup:
        print("🧹 测试成功后将自动清理产物文件")
        print("💾 使用 --no-cleanup 参数可保留产物文件")
    else:
        print("💾 将保留所有测试产物文件")
    print()
    
    # 创建测试结果管理器
    manager = TestResultManager(auto_cleanup=auto_cleanup)
    manager.create_test_directories()
    
    # 创建测试输入文件
    create_test_input_files()
    print()
    
    # 运行各项测试
    manager.add_result('tts_config', test_tts_config())
    manager.add_result('tts_output', test_tts_output())
    manager.add_result('unified_doubao', test_unified_doubao_client())
    manager.add_result('unified_podcast', test_unified_doubao_podcast_client())
    manager.add_result('client_factory', test_client_factory())
    manager.add_result('error_handling', test_error_handling())
    
    # 打印结果摘要
    manager.print_summary()
    
    # 处理测试产物清理
    manager.handle_cleanup()
    
    # 返回是否全部通过
    summary = manager.get_summary()
    return summary["all_passed"]


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
