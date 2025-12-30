"""
Enhanced Auto-Podcast Test Runner with Auto-Cleanup

这个文件是增强版的自动播客生成系统测试运行器，支持测试产物的自动清理功能。

功能概述：
- 统一运行所有模块测试（Fetch、LLM、TTS）
- 提供测试结果汇总和报告
- 支持交互式测试选择
- 自动检测测试环境配置
- 测试成功后自动清理产物文件
- 支持保留产物文件的选项

测试模块：
- Fetch模块测试：数据获取功能验证
- LLM模块测试：脚本生成功能验证
- TTS Client测试：统一客户端功能验证

使用方式：
    python run_tests_enhanced.py                    # 运行所有测试，成功后自动清理
    python run_tests_enhanced.py --no-cleanup       # 运行测试，保留所有产物
    python run_tests_enhanced.py --interactive      # 交互式选择测试
    python run_tests_enhanced.py --module fetch     # 运行指定模块测试

清理规则：
- 测试全部成功：自动清理所有生成的测试文件
- 测试部分失败：保留所有文件用于调试
- 指定--no-cleanup：始终保留文件

测试环境：
- 部分测试需要API密钥配置（.env文件）
- 无API密钥时跳过相关测试，不影响其他测试
- 测试数据自动生成和条件性清理

作者：Auto-Podcast Team
版本：2.0.0
更新：2025-12-25
"""

import sys
import subprocess
import shutil
from pathlib import Path


def get_test_artifacts():
    """获取所有测试产物文件路径"""
    artifacts = []
    
    # TTS测试产物
    tts_test_data = Path(__file__).parent / "src" / "tts" / "tests" / "test_data"
    if tts_test_data.exists():
        artifacts.extend([
            tts_test_data / "test_text.txt",
            tts_test_data / "test_ssml.ssml", 
            tts_test_data / "test_config.json",
            tts_test_data / "tts_client_config.json",
            tts_test_data / "test_output.mp3",
            tts_test_data / "basic_output_test.mp3"
        ])
    
    # LLM测试产物
    llm_test_data = Path(__file__).parent / "src" / "llm" / "tests" / "test_data"
    if llm_test_data.exists():
        artifacts.extend([
            llm_test_data / "test_prompts.txt",
            llm_test_data / "test_config.json"
        ])
    
    # Research测试产物
    research_test_data = Path(__file__).parent / "src" / "research" / "tests" / "test_data"
    if research_test_data.exists():
        artifacts.extend([
            research_test_data / "test_config.json"
        ])
    
    return [f for f in artifacts if f.exists()]


def cleanup_test_artifacts():
    """清理测试产物文件"""
    artifacts = get_test_artifacts()
    cleaned_count = 0
    
    for artifact in artifacts:
        try:
            if artifact.is_file():
                artifact.unlink()
                cleaned_count += 1
            elif artifact.is_dir():
                shutil.rmtree(artifact)
                cleaned_count += 1
        except Exception as e:
            print(f"⚠️  清理文件失败 {artifact}: {e}")
    
    return cleaned_count


def run_test_module(module_name, test_file_path):
    """运行单个模块的测试"""
    print(f"\n{'='*60}")
    print(f"运行 {module_name} 模块测试")
    print(f"{'='*60}")
    
    try:
        result = subprocess.run(
            [sys.executable, str(test_file_path)],
            capture_output=True,
            text=True,
            cwd=str(Path(__file__).parent)
        )
        
        print(result.stdout)
        if result.stderr:
            print("错误输出:")
            print(result.stderr)
        
        success = result.returncode == 0
        status = "✅ 通过" if success else "❌ 失败"
        print(f"\n{module_name} 测试结果: {status}")
        
        return success
        
    except Exception as e:
        print(f"❌ 运行 {module_name} 测试时出错: {e}")
        return False


def main(auto_cleanup=True):
    """运行所有测试"""
    print("开始运行项目全模块测试...")
    print("注意：某些测试需要相应的环境变量配置")
    print("请确保 .env 文件中包含必要的API密钥配置")
    
    if auto_cleanup:
        print("🧹 测试成功后将自动清理产物文件")
        print("💾 使用 --no-cleanup 参数可保留产物文件")
    else:
        print("💾 将保留所有测试产物文件")
    print()
    
    # 定义测试模块
    test_modules = [
        ("Fetch", Path(__file__).parent / "src" / "fetch" / "tests" / "test_fetch.py"),
        ("LLM", Path(__file__).parent / "src" / "llm" / "tests" / "test_llm.py"),
        ("TTS Client", Path(__file__).parent / "src" / "tts" / "tests" / "test_tts_client.py")
    ]
    
    results = {}
    
    # 运行各模块测试
    for module_name, test_file in test_modules:
        if test_file.exists():
            results[module_name] = run_test_module(module_name, test_file)
        else:
            print(f"⚠️  {module_name} 测试文件不存在: {test_file}")
            results[module_name] = False
    
    # 汇总结果
    print(f"\n{'='*60}")
    print("测试结果汇总")
    print(f"{'='*60}")
    
    passed = sum(results.values())
    total = len(results)
    
    for module_name, result in results.items():
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{module_name:10} : {status}")
    
    print(f"\n总体结果: {passed}/{total} 通过")
    
    # 处理测试产物清理
    if auto_cleanup and passed == total:
        print("\n🧹 所有测试通过，开始清理测试产物...")
        cleaned_count = cleanup_test_artifacts()
        if cleaned_count > 0:
            print(f"✅ 已清理 {cleaned_count} 个测试产物文件")
        else:
            print("ℹ️  没有发现需要清理的测试产物")
    elif auto_cleanup and passed < total:
        print(f"\n⚠️  测试未全部通过 ({passed}/{total})，保留测试产物用于调试")
        artifacts = get_test_artifacts()
        if artifacts:
            print(f"📁 保留的测试产物文件:")
            for artifact in artifacts:
                print(f"   - {artifact.relative_to(Path(__file__).parent)}")
    else:
        print(f"\n💾 按要求保留所有测试产物文件")
    
    if passed == total:
        print("🎉 所有测试通过！")
        return True
    else:
        print("⚠️  部分测试失败，请检查上述输出")
        return False


def run_individual_test(auto_cleanup=True):
    """运行单个模块测试的交互式选择"""
    print("选择要测试的模块:")
    print("1. Fetch (数据获取)")
    print("2. LLM (语言模型)")
    print("3. TTS Client (语音合成客户端)")
    print("4. 运行全部")
    
    try:
        choice = input("\n请输入选择 (1-4): ").strip()
        
        test_files = {
            "1": ("Fetch", "src/fetch/tests/test_fetch.py"),
            "2": ("LLM", "src/llm/tests/test_llm.py"),
            "3": ("TTS Client", "src/tts/tests/test_tts_client.py"),
            "4": ("All", None)
        }
        
        if choice not in test_files:
            print("无效选择")
            return False
        
        if choice == "4":
            return main(auto_cleanup)
        else:
            module_name, test_file = test_files[choice]
            test_path = Path(__file__).parent / test_file
            
            if test_path.exists():
                success = run_test_module(module_name, test_path)
                
                # 单个测试的清理逻辑
                if auto_cleanup and success:
                    print("\n🧹 测试通过，清理相关产物...")
                    cleaned_count = cleanup_test_artifacts()
                    if cleaned_count > 0:
                        print(f"✅ 已清理 {cleaned_count} 个测试产物文件")
                elif auto_cleanup and not success:
                    print("\n⚠️  测试失败，保留产物用于调试")
                
                return success
            else:
                print(f"测试文件不存在: {test_path}")
                return False
                
    except KeyboardInterrupt:
        print("\n测试取消")
        return False
    except Exception as e:
        print(f"错误: {e}")
        return False


if __name__ == "__main__":
    # 解析命令行参数
    auto_cleanup = "--no-cleanup" not in sys.argv
    interactive = "--interactive" in sys.argv
    
    if interactive:
        success = run_individual_test(auto_cleanup)
    else:
        success = main(auto_cleanup)
    
    sys.exit(0 if success else 1)
