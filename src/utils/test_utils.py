"""
Test Utilities Module

测试工具模块，提供测试产物管理和清理功能。

功能概述：
- 测试产物的创建和管理
- 条件性清理测试产物
- 测试结果统计和报告
- 测试环境检查

主要功能：
- get_test_artifacts(): 获取测试产物列表
- cleanup_test_artifacts(): 清理测试产物
- create_test_directories(): 创建测试目录
- TestResultManager: 测试结果管理器

使用示例：
    from src.utils.test_utils import TestResultManager
    
    manager = TestResultManager(auto_cleanup=True)
    success = manager.run_all_tests()
    manager.handle_cleanup(success)

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

import os
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional


class TestResultManager:
    """测试结果管理器，支持条件性清理测试产物"""
    
    def __init__(self, auto_cleanup: bool = True, project_root: Optional[Path] = None):
        """
        初始化测试结果管理器
        
        Args:
            auto_cleanup: 是否在测试成功后自动清理产物
            project_root: 项目根目录，默认为当前文件所在项目的根目录
        """
        self.auto_cleanup = auto_cleanup
        if project_root is None:
            # 自动检测项目根目录
            self.project_root = Path(__file__).parent.parent.parent
        else:
            self.project_root = project_root
        
        self.results: Dict[str, bool] = {}
        self.artifacts: List[Path] = []
    
    def get_test_artifacts(self) -> List[Path]:
        """获取所有测试产物文件路径"""
        artifacts = []
        
        # TTS测试产物
        tts_test_data = self.project_root / "src" / "tts" / "tests" / "test_data"
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
        llm_test_data = self.project_root / "src" / "llm" / "tests" / "test_data"
        if llm_test_data.exists():
            artifacts.extend([
                llm_test_data / "test_prompts.txt",
                llm_test_data / "test_config.json"
            ])
        
        # Research测试产物
        research_test_data = self.project_root / "src" / "research" / "tests" / "test_data"
        if research_test_data.exists():
            artifacts.extend([
                research_test_data / "test_config.json"
            ])
        
        # Fetch测试产物
        fetch_test_data = self.project_root / "src" / "fetch" / "tests" / "test_data"
        if fetch_test_data.exists():
            artifacts.extend([
                fetch_test_data / "test_output.json",
                fetch_test_data / "test_config.json"
            ])
        
        # 只返回存在的文件
        self.artifacts = [f for f in artifacts if f.exists()]
        return self.artifacts
    
    def cleanup_test_artifacts(self) -> int:
        """清理测试产物文件"""
        artifacts = self.get_test_artifacts()
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
    
    def create_test_directories(self) -> None:
        """创建必要的测试目录"""
        test_dirs = [
            self.project_root / "src" / "tts" / "tests" / "test_data",
            self.project_root / "src" / "llm" / "tests" / "test_data",
            self.project_root / "src" / "research" / "tests" / "test_data",
            self.project_root / "src" / "fetch" / "tests" / "test_data"
        ]
        
        for test_dir in test_dirs:
            test_dir.mkdir(parents=True, exist_ok=True)
    
    def add_result(self, test_name: str, success: bool) -> None:
        """添加测试结果"""
        self.results[test_name] = success
    
    def get_summary(self) -> Dict[str, Any]:
        """获取测试结果摘要"""
        passed = sum(self.results.values())
        total = len(self.results)
        
        return {
            "passed": passed,
            "total": total,
            "success_rate": passed / total if total > 0 else 0,
            "all_passed": passed == total,
            "results": self.results.copy()
        }
    
    def handle_cleanup(self, force_cleanup: bool = False) -> None:
        """
        处理测试产物清理
        
        Args:
            force_cleanup: 强制清理，忽略测试结果和auto_cleanup设置
        """
        summary = self.get_summary()
        artifacts = self.get_test_artifacts()
        
        if force_cleanup or (self.auto_cleanup and summary["all_passed"]):
            print("\n🧹 开始清理测试产物...")
            cleaned_count = self.cleanup_test_artifacts()
            if cleaned_count > 0:
                print(f"✅ 已清理 {cleaned_count} 个测试产物文件")
            else:
                print("ℹ️  没有发现需要清理的测试产物")
        elif self.auto_cleanup and not summary["all_passed"]:
            print(f"\n⚠️  测试未全部通过 ({summary['passed']}/{summary['total']})，保留测试产物用于调试")
            if artifacts:
                print(f"📁 保留的测试产物文件:")
                for artifact in artifacts:
                    print(f"   - {artifact.relative_to(self.project_root)}")
        else:
            print(f"\n💾 按要求保留所有测试产物文件")
            if artifacts:
                print(f"📁 当前测试产物文件:")
                for artifact in artifacts:
                    print(f"   - {artifact.relative_to(self.project_root)}")
    
    def print_summary(self) -> None:
        """打印测试结果摘要"""
        summary = self.get_summary()
        
        print(f"\n{'='*60}")
        print("测试结果汇总")
        print(f"{'='*60}")
        
        for test_name, result in self.results.items():
            status = "✅ 通过" if result else "❌ 失败"
            print(f"{test_name:20} : {status}")
        
        print(f"\n总体结果: {summary['passed']}/{summary['total']} 通过")
        print(f"成功率: {summary['success_rate']:.1%}")
        
        if summary["all_passed"]:
            print("🎉 所有测试通过！")
        else:
            print("⚠️  部分测试失败，请检查上述输出")


def get_test_artifacts(project_root: Optional[Path] = None) -> List[Path]:
    """获取所有测试产物文件路径（便捷函数）"""
    manager = TestResultManager(project_root=project_root)
    return manager.get_test_artifacts()


def cleanup_test_artifacts(project_root: Optional[Path] = None) -> int:
    """清理测试产物文件（便捷函数）"""
    manager = TestResultManager(project_root=project_root)
    return manager.cleanup_test_artifacts()


def create_test_directories(project_root: Optional[Path] = None) -> None:
    """创建测试目录（便捷函数）"""
    manager = TestResultManager(project_root=project_root)
    manager.create_test_directories()
