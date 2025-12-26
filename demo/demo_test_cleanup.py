#!/usr/bin/env python3
"""
测试清理功能演示脚本

演示测试成功和失败时的清理行为：
- 测试成功：自动清理产物
- 测试失败：保留产物用于调试
- 强制保留：使用--no-cleanup参数
"""

import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent))

from src.utils.test_utils import TestResultManager


def demo_success_test():
    """演示成功的测试"""
    print("=== 演示成功的测试 ===")
    
    manager = TestResultManager(auto_cleanup=True)
    manager.create_test_directories()
    
    # 创建一些测试产物
    test_data_dir = Path(__file__).parent / "src" / "tts" / "tests" / "test_data"
    test_data_dir.mkdir(parents=True, exist_ok=True)
    
    # 创建测试文件
    (test_data_dir / "demo_success.txt").write_text("成功的测试产物", encoding='utf-8')
    (test_data_dir / "demo_config.json").write_text('{"demo": true}', encoding='utf-8')
    
    # 模拟测试成功
    manager.add_result("test_1", True)
    manager.add_result("test_2", True)
    
    manager.print_summary()
    manager.handle_cleanup()
    
    print()


def demo_failure_test():
    """演示失败的测试"""
    print("=== 演示失败的测试 ===")
    
    manager = TestResultManager(auto_cleanup=True)
    manager.create_test_directories()
    
    # 创建一些测试产物
    test_data_dir = Path(__file__).parent / "src" / "tts" / "tests" / "test_data"
    test_data_dir.mkdir(parents=True, exist_ok=True)
    
    # 创建测试文件
    (test_data_dir / "demo_failure.txt").write_text("失败的测试产物 - 需要调试", encoding='utf-8')
    (test_data_dir / "demo_error.log").write_text("错误日志用于调试", encoding='utf-8')
    
    # 模拟测试失败
    manager.add_result("test_1", True)
    manager.add_result("test_2", False)  # 这个测试失败
    
    manager.print_summary()
    manager.handle_cleanup()
    
    print()


def demo_no_cleanup():
    """演示强制保留产物"""
    print("=== 演示强制保留产物 ===")
    
    manager = TestResultManager(auto_cleanup=False)  # 禁用自动清理
    manager.create_test_directories()
    
    # 创建一些测试产物
    test_data_dir = Path(__file__).parent / "src" / "tts" / "tests" / "test_data"
    test_data_dir.mkdir(parents=True, exist_ok=True)
    
    # 创建测试文件
    (test_data_dir / "demo_nocleanup.txt").write_text("强制保留的测试产物", encoding='utf-8')
    (test_data_dir / "demo_analysis.json").write_text('{"analysis": "保留用于分析"}', encoding='utf-8')
    
    # 模拟测试成功
    manager.add_result("test_1", True)
    manager.add_result("test_2", True)
    
    manager.print_summary()
    manager.handle_cleanup()
    
    print()


def cleanup_demo_files():
    """清理演示文件"""
    print("=== 清理演示文件 ===")
    
    test_data_dir = Path(__file__).parent / "src" / "tts" / "tests" / "test_data"
    
    demo_files = [
        "demo_success.txt",
        "demo_config.json", 
        "demo_failure.txt",
        "demo_error.log",
        "demo_nocleanup.txt",
        "demo_analysis.json"
    ]
    
    cleaned = 0
    for filename in demo_files:
        file_path = test_data_dir / filename
        if file_path.exists():
            file_path.unlink()
            cleaned += 1
            print(f"✅ 删除: {filename}")
    
    print(f"\n总共清理了 {cleaned} 个演示文件")


def main():
    """主演示函数"""
    print("🧪 测试清理功能演示")
    print("=" * 50)
    print()
    
    try:
        # 演示成功测试的清理
        demo_success_test()
        
        # 演示失败测试的保留
        demo_failure_test()
        
        # 演示强制保留
        demo_no_cleanup()
        
        # 清理演示文件
        cleanup_demo_files()
        
        print("🎉 演示完成！")
        print()
        print("📋 总结:")
        print("✅ 测试成功 + 自动清理 = 干净的环境")
        print("❌ 测试失败 + 自动清理 = 保留产物用于调试")
        print("💾 强制保留 = 始终保留产物文件")
        
    except Exception as e:
        print(f"❌ 演示过程中出错: {e}")
        return False
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
