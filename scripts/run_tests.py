"""
Auto-Podcast Test Runner

这个文件是自动播客生成系统的测试运行器，负责执行所有模块的测试用例。

功能概述：
- 统一运行所有模块测试（Fetch、LLM、TTS）
- 提供测试结果汇总和报告
- 支持交互式测试选择
- 自动检测测试环境配置

测试模块：
- Fetch模块测试：数据获取功能验证
- LLM模块测试：脚本生成功能验证
- TTS模块测试：语音合成功能验证
- TTS Client测试：统一客户端功能验证

使用方式：
    python run_tests.py                    # 运行所有测试
    python run_tests.py --interactive      # 交互式选择测试
    python run_tests.py --module fetch     # 运行指定模块测试

测试环境：
- 部分测试需要API密钥配置（.env文件）
- 无API密钥时跳过相关测试，不影响其他测试
- 测试数据自动生成和清理

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

import sys
import subprocess
from pathlib import Path


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


def main():
    """运行所有测试"""
    print("开始运行项目全模块测试...")
    print("注意：某些测试需要相应的环境变量配置")
    print("请确保 .env 文件中包含必要的API密钥配置\n")
    
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
    
    if passed == total:
        print("🎉 所有测试通过！")
        return True
    else:
        print("⚠️  部分测试失败，请检查上述输出")
        return False


def run_individual_test():
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
            return main()
        else:
            module_name, test_file = test_files[choice]
            test_path = Path(__file__).parent / test_file
            
            if test_path.exists():
                return run_test_module(module_name, test_path)
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
    if len(sys.argv) > 1 and sys.argv[1] == "--interactive":
        success = run_individual_test()
    else:
        success = main()
    
    sys.exit(0 if success else 1)
