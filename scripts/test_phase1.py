"""
Phase 1 测试脚本

测试新的编排层架构是否正常工作
"""

import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
import logging

# 加载环境变量
load_dotenv()

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

def test_imports():
    """测试所有模块是否可以正常导入"""
    print("=" * 80)
    print("测试 1: 模块导入")
    print("=" * 80)
    
    try:
        from src.app.context import EpisodeContext
        print("✓ EpisodeContext 导入成功")
        
        from src.app.orchestrator import run_episode
        print("✓ orchestrator 导入成功")
        
        from src.app.pipelines.episode_pipeline import EpisodePipeline
        print("✓ EpisodePipeline 导入成功")
        
        from src.app.pipelines.steps import (
            FetchStep, ClusterStep, SelectionStep,
            ResearchStep, ScriptStep, AudioStep, PublishStep
        )
        print("✓ 所有 Steps 导入成功")
        
        print("\n✅ 所有模块导入测试通过\n")
        return True
        
    except Exception as e:
        print(f"\n❌ 模块导入失败: {e}\n")
        import traceback
        traceback.print_exc()
        return False


def test_context_creation():
    """测试 EpisodeContext 创建"""
    print("=" * 80)
    print("测试 2: EpisodeContext 创建")
    print("=" * 80)
    
    try:
        from src.app.context import EpisodeContext
        from datetime import datetime
        
        ctx = EpisodeContext(
            episode_id="test:2025-12-29",
            episode_date="2025-12-29",
            run_id="test_run",
            config={"test": "config"},
            output_dir=Path("./out"),
            run_dir=Path("./out/test"),
        )
        
        print(f"✓ Episode ID: {ctx.episode_id}")
        print(f"✓ Episode Date: {ctx.episode_date}")
        print(f"✓ Run ID: {ctx.run_id}")
        print(f"✓ Status: {ctx.status}")
        
        # 测试事件添加
        ctx.add_event("test_event", data="test")
        print(f"✓ 事件添加成功: {len(ctx.events)} 个事件")
        
        # 测试指标设置
        ctx.set_metric("test_metric", 123)
        print(f"✓ 指标设置成功: {len(ctx.metrics)} 个指标")
        
        print("\n✅ EpisodeContext 创建测试通过\n")
        return True
        
    except Exception as e:
        print(f"\n❌ EpisodeContext 创建失败: {e}\n")
        import traceback
        traceback.print_exc()
        return False


def test_pipeline_structure():
    """测试 Pipeline 结构"""
    print("=" * 80)
    print("测试 3: Pipeline 结构")
    print("=" * 80)
    
    try:
        from src.app.pipelines.episode_pipeline import EpisodePipeline
        
        pipeline = EpisodePipeline()
        
        print(f"✓ Pipeline 创建成功")
        print(f"✓ 步骤数量: {len(pipeline.steps)}")
        
        for i, step in enumerate(pipeline.steps, 1):
            print(f"  {i}. {step.__class__.__name__}")
        
        print("\n✅ Pipeline 结构测试通过\n")
        return True
        
    except Exception as e:
        print(f"\n❌ Pipeline 结构测试失败: {e}\n")
        import traceback
        traceback.print_exc()
        return False


def main():
    """运行所有测试"""
    print("\n" + "=" * 80)
    print("Phase 1 架构测试")
    print("=" * 80 + "\n")
    
    results = []
    
    # 测试 1: 模块导入
    results.append(("模块导入", test_imports()))
    
    # 测试 2: Context 创建
    results.append(("Context 创建", test_context_creation()))
    
    # 测试 3: Pipeline 结构
    results.append(("Pipeline 结构", test_pipeline_structure()))
    
    # 汇总结果
    print("=" * 80)
    print("测试结果汇总")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{name}: {status}")
    
    print(f"\n总计: {passed}/{total} 测试通过")
    
    if passed == total:
        print("\n🎉 所有测试通过！Phase 1 架构验证成功！\n")
        return 0
    else:
        print(f"\n⚠️  有 {total - passed} 个测试失败\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
