"""
Unified Auto-Podcast Test Runner

统一的自动播客生成系统测试运行器，集成了基础测试和增强功能。

功能概述：
- 统一运行所有模块测试（Fetch、LLM、TTS）
- 提供测试结果汇总和详细报告
- 支持交互式测试选择
- 自动检测测试环境配置
- 智能测试产物管理（可选）
- 灵活的运行模式配置

测试模块：
- Fetch模块测试：数据获取功能验证
- LLM模块测试：脚本生成功能验证
- TTS Client测试：统一客户端功能验证

运行模式：
- 基础模式：简单测试执行，无产物管理
- 增强模式：智能产物管理，根据测试结果自动清理或保留
- 调试模式：始终保留所有产物用于调试

使用方式：
    # 基础模式（简单测试）
    python run_tests_unified.py --mode basic
    
    # 增强模式（智能产物管理）
    python run_tests_unified.py --mode enhanced
    
    # 调试模式（保留所有产物）
    python run_tests_unified.py --mode debug
    
    # 交互式选择
    python run_tests_unified.py --interactive
    
    # 运行指定模块
    python run_tests_unified.py --module fetch --mode enhanced

清理规则（增强模式）：
- 测试全部成功：自动清理所有生成的测试文件
- 测试部分失败：保留所有文件用于调试
- 指定--no-cleanup：始终保留文件

测试环境：
- 部分测试需要API密钥配置（env/.env文件）
- 无API密钥时跳过相关测试，不影响其他测试
- 测试数据自动生成和条件性清理

作者：Auto-Podcast Team
版本：3.0.0
更新：2025-12-25
"""

import sys
import subprocess
import shutil
import argparse
from pathlib import Path
from typing import List, Tuple, Dict, Any

# 导入测试工具
try:
    from src.utils.test_utils import TestResultManager
    HAS_TEST_UTILS = True
except ImportError:
    HAS_TEST_UTILS = False
    TestResultManager = None  # type: ignore
    print("⚠️  警告：无法导入测试工具，将使用基础模式")


def get_test_artifacts() -> List[Path]:
    """获取所有测试产物文件路径"""
    if not HAS_TEST_UTILS:
        return []
    
    artifacts = []
    project_root = Path(__file__).parent
    
    # TTS测试产物
    tts_test_data = project_root / "src" / "tts" / "tests" / "test_data"
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
    llm_test_data = project_root / "src" / "llm" / "tests" / "test_data"
    if llm_test_data.exists():
        artifacts.extend([
            llm_test_data / "test_prompts.txt",
            llm_test_data / "test_config.json"
        ])
    
    # Research测试产物
    research_test_data = project_root / "src" / "research" / "tests" / "test_data"
    if research_test_data.exists():
        artifacts.extend([
            research_test_data / "test_config.json"
        ])
    
    # Fetch测试产物
    fetch_test_data = project_root / "src" / "fetch" / "tests" / "test_data"
    if fetch_test_data.exists():
        artifacts.extend([
            fetch_test_data / "test_output.json",
            fetch_test_data / "test_config.json"
        ])
    
    return [f for f in artifacts if f.exists()]


def cleanup_test_artifacts() -> int:
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


def run_test_module(module_name: str, test_file_path: Path) -> bool:
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


def run_basic_mode(args) -> bool:
    """运行基础模式测试"""
    print("🚀 运行基础测试模式...")
    print("注意：此模式不包含测试产物管理功能\n")
    
    test_modules = [
        ("Fetch", Path(__file__).parent / "src" / "fetch" / "tests" / "test_fetch.py"),
        ("LLM", Path(__file__).parent / "src" / "llm" / "tests" / "test_llm.py"),
        ("TTS Client", Path(__file__).parent / "src" / "tts" / "tests" / "test_tts_client.py")
    ]
    
    results = {}
    
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
        print(f"{module_name:12} : {status}")
    
    print(f"\n总体结果: {passed}/{total} 通过")
    
    if passed == total:
        print("🎉 所有测试通过！")
        return True
    else:
        print("⚠️  部分测试失败，请检查上述输出")
        return False


def run_enhanced_mode(args) -> bool:
    """运行增强模式测试"""
    if not HAS_TEST_UTILS:
        print("❌ 增强模式需要测试工具支持，但无法导入 src.utils.test_utils")
        print("💡 请确保项目结构完整，或使用 --mode basic")
        return False
    
    auto_cleanup = not args.no_cleanup
    print("🚀 运行增强测试模式...")
    
    if auto_cleanup:
        print("🧹 测试成功后将自动清理产物文件")
        print("💾 使用 --no-cleanup 参数可保留产物文件")
    else:
        print("💾 将保留所有测试产物文件")
    print()
    
    # 创建测试结果管理器
    if TestResultManager is not None:
        manager = TestResultManager(auto_cleanup=auto_cleanup)
        manager.create_test_directories()
    
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
        print(f"{module_name:12} : {status}")
    
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


def run_debug_mode(args) -> bool:
    """运行调试模式测试"""
    print("🔍 运行调试测试模式...")
    print("注意：此模式将保留所有测试产物用于调试\n")
    
    # 设置强制保留产物
    args.no_cleanup = True
    return run_enhanced_mode(args)


def run_interactive_mode(args) -> bool:
    """运行交互式测试选择"""
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
            # 根据模式运行所有测试
            if args.mode == "basic":
                return run_basic_mode(args)
            elif args.mode == "debug":
                return run_debug_mode(args)
            else:  # enhanced
                return run_enhanced_mode(args)
        else:
            # 运行单个模块测试
            module_name, test_file = test_files[choice]
            test_path = Path(__file__).parent / test_file
            
            if test_path.exists():
                success = run_test_module(module_name, test_path)
                
                # 根据模式处理产物
                if args.mode == "enhanced" and not args.no_cleanup and success:
                    print("\n🧹 测试通过，清理相关产物...")
                    cleaned_count = cleanup_test_artifacts()
                    if cleaned_count > 0:
                        print(f"✅ 已清理 {cleaned_count} 个测试产物文件")
                elif args.mode == "enhanced" and not success:
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


def main() -> int:
    """主函数"""
    parser = argparse.ArgumentParser(
        description="Auto-Podcast 统一测试运行器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
运行模式说明:
  basic     基础模式：简单测试执行，无产物管理
  enhanced  增强模式：智能产物管理，测试成功后自动清理
  debug     调试模式：始终保留所有产物用于调试

使用示例:
  python run_tests_unified.py --mode basic
  python run_tests_unified.py --mode enhanced
  python run_tests_unified.py --mode debug
  python run_tests_unified.py --interactive
        """
    )
    
    parser.add_argument(
        "--mode", 
        choices=["basic", "enhanced", "debug"], 
        default="enhanced",
        help="测试运行模式 (默认: enhanced)"
    )
    
    parser.add_argument(
        "--interactive", 
        action="store_true",
        help="交互式选择测试模块"
    )
    
    parser.add_argument(
        "--module", 
        choices=["fetch", "llm", "tts"],
        help="运行指定模块测试"
    )
    
    parser.add_argument(
        "--no-cleanup", 
        action="store_true",
        help="不自动清理测试产物 (仅增强模式有效)"
    )
    
    args = parser.parse_args()
    
    print("🧪 Auto-Podcast 统一测试运行器")
    print("=" * 50)
    print(f"运行模式: {args.mode}")
    print(f"交互模式: {'是' if args.interactive else '否'}")
    if args.module:
        print(f"指定模块: {args.module}")
    print("=" * 50)
    
    try:
        if args.interactive:
            success = run_interactive_mode(args)
        elif args.module:
            # 运行指定模块
            module_map = {
                "fetch": ("Fetch", "src/fetch/tests/test_fetch.py"),
                "llm": ("LLM", "src/llm/tests/test_llm.py"),
                "tts": ("TTS Client", "src/tts/tests/test_tts_client.py")
            }
            
            if args.module in module_map:
                module_name, test_file = module_map[args.module]
                test_path = Path(__file__).parent / test_file
                
                if test_path.exists():
                    success = run_test_module(module_name, test_path)
                    
                    # 根据模式处理产物
                    if args.mode == "enhanced" and not args.no_cleanup and success:
                        print("\n🧹 测试通过，清理相关产物...")
                        cleaned_count = cleanup_test_artifacts()
                        if cleaned_count > 0:
                            print(f"✅ 已清理 {cleaned_count} 个测试产物文件")
                    
                    return 0 if success else 1
                else:
                    print(f"❌ 测试文件不存在: {test_path}")
                    return 1
            else:
                print(f"❌ 不支持的模块: {args.module}")
                return 1
        else:
            # 根据模式运行所有测试
            if args.mode == "basic":
                success = run_basic_mode(args)
            elif args.mode == "debug":
                success = run_debug_mode(args)
            else:  # enhanced
                success = run_enhanced_mode(args)
        
        return 0 if success else 1
        
    except KeyboardInterrupt:
        print("\n\n⚠️  测试被用户中断")
        return 130
    except Exception as e:
        print(f"\n❌ 测试运行出错: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
