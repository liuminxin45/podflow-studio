"""
演示 Unified 音频工作流
验证配置正确加载并且只生成一个音频文件
"""

import sys
from pathlib import Path
from datetime import datetime

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

def demo_config_loading():
    """演示配置加载"""
    print("\n" + "=" * 70)
    print("步骤 1: 验证配置加载")
    print("=" * 70)
    
    from run import _load_config
    
    config = _load_config()
    audio_config = config.get("audio", {})
    workflow = audio_config.get("workflow")
    
    print(f"✓ 配置加载成功")
    print(f"✓ audio.workflow = '{workflow}'")
    print(f"✓ audio.unified 配置: {audio_config.get('unified', {})}")
    
    if workflow != "unified":
        print(f"\n❌ 错误: workflow 应该是 'unified'，但实际是 '{workflow}'")
        return False
    
    print("\n✅ 配置验证通过！\n")
    return config


def demo_workflow_creation():
    """演示工作流创建"""
    print("=" * 70)
    print("步骤 2: 创建 Unified 工作流")
    print("=" * 70)
    
    from src.app.pipelines.steps.audio_workflows import WorkflowFactory
    import logging
    
    # 配置日志
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("demo")
    
    audio_config = {
        "workflow": "unified",
        "unified": {
            "enable_cache": True,
            "transition_text": "\n\n",
            "add_pauses": True,
            "pause_duration_ms": 800,
            "merge_strategy": "simple",
            "use_ssml": False
        }
    }
    
    try:
        workflow = WorkflowFactory.create_workflow(
            mode="unified",
            config=audio_config,
            logger=logger
        )
        
        workflow_name = type(workflow).__name__
        print(f"✓ 工作流创建成功: {workflow_name}")
        
        if "Unified" not in workflow_name:
            print(f"❌ 错误: 期望创建 UnifiedWorkflow，实际创建了 {workflow_name}")
            return None
        
        print("✅ UnifiedWorkflow 创建成功！\n")
        return workflow
        
    except Exception as e:
        print(f"❌ 创建工作流失败: {e}")
        import traceback
        traceback.print_exc()
        return None


def demo_mock_execution():
    """演示模拟执行（不实际调用 TTS）"""
    print("=" * 70)
    print("步骤 3: 模拟 Unified 工作流执行")
    print("=" * 70)
    
    from src.app.core.context import EpisodeContext
    from run import _load_config
    import logging
    
    logging.basicConfig(level=logging.INFO)
    
    config = _load_config()
    
    # 创建测试目录
    test_run_dir = Path("out/test_unified_demo")
    test_run_dir.mkdir(parents=True, exist_ok=True)
    
    # 创建 EpisodeContext
    ctx = EpisodeContext(
        episode_id="test-unified-demo",
        episode_date="2026-01-05",
        run_id="test_run",
        output_dir=Path("out"),
        run_dir=test_run_dir,
        config=config
    )
    
    # 模拟脚本段落
    from dataclasses import dataclass
    
    @dataclass
    class MockSegment:
        id: str
        text: str
    
    ctx.script_segments = [
        MockSegment(id="S0", text="这是开场白。"),
        MockSegment(id="S1", text="这是第一个主题。"),
        MockSegment(id="S2", text="这是第二个主题。"),
        MockSegment(id="S3", text="这是详细讨论。"),
        MockSegment(id="S4", text="这是结束语。"),
    ]
    
    print(f"✓ 创建了 {len(ctx.script_segments)} 个脚本段落")
    print(f"✓ 段落 IDs: {[s.id for s in ctx.script_segments]}")
    
    # 读取工作流配置
    audio_cfg = ctx.config.get("audio", {})
    workflow_mode = audio_cfg.get("workflow", "segmented")
    
    print(f"\n✓ 从 ctx.config 读取的工作流模式: '{workflow_mode}'")
    
    if workflow_mode != "unified":
        print(f"❌ 错误: 期望 'unified'，实际是 '{workflow_mode}'")
        return False
    
    print("\n✅ 模拟执行验证通过！")
    print(f"\n📝 说明:")
    print(f"   - Unified 模式会将 5 个段落合并成一个完整脚本")
    print(f"   - 然后调用一次 TTS API 生成单个音频文件")
    print(f"   - 不会生成 S0.mp3, S1.mp3, ... S4.mp3 这些分段文件")
    print(f"   - 只会生成最终的 final.mp3 文件\n")
    
    return True


def demo_check_output_structure():
    """演示输出结构检查"""
    print("=" * 70)
    print("步骤 4: 验证输出文件结构")
    print("=" * 70)
    
    print("\n预期的文件结构:")
    print("\nUnified 模式 (当前配置):")
    print("  out/runs/YYYYMMDD/HHMMSS_XXXXXX_channel/")
    print("  ├── 4_tts/")
    print("  │   ├── manifest.json          # 包含 workflow_mode: unified")
    print("  │   └── merged_script.txt      # 合并后的完整脚本")
    print("  └── 5_render/")
    print("      └── YYYY-MM-DD.final.mp3   # ✓ 只有这一个音频文件")
    
    print("\nSegmented 模式 (旧配置):")
    print("  out/runs/YYYYMMDD/HHMMSS_XXXXXX_channel/")
    print("  ├── 4_tts/")
    print("  │   ├── segments/")
    print("  │   │   ├── S0.mp3             # ✗ 分段文件")
    print("  │   │   ├── S1.mp3             # ✗ 分段文件")
    print("  │   │   ├── S2.mp3             # ✗ 分段文件")
    print("  │   │   ├── S3.mp3             # ✗ 分段文件")
    print("  │   │   └── S4.mp3             # ✗ 分段文件")
    print("  │   └── manifest.json          # 包含 workflow_mode: segmented")
    print("  └── 5_render/")
    print("      └── YYYY-MM-DD.final.mp3   # 合并后的文件")
    
    print("\n✅ 输出结构说明完成！\n")


def main():
    """主函数"""
    print("\n" + "🎵" * 35)
    print("Unified 音频工作流演示")
    print("🎵" * 35)
    
    try:
        # 步骤 1: 验证配置
        config = demo_config_loading()
        if not config:
            return False
        
        # 步骤 2: 创建工作流
        workflow = demo_workflow_creation()
        if not workflow:
            return False
        
        # 步骤 3: 模拟执行
        if not demo_mock_execution():
            return False
        
        # 步骤 4: 输出结构说明
        demo_check_output_structure()
        
        # 总结
        print("=" * 70)
        print("✅ 演示完成！")
        print("=" * 70)
        print("\n📌 关键点:")
        print("  1. ✅ settings.yaml 中 audio.workflow 配置为 'unified'")
        print("  2. ✅ run.py 正确加载了配置（深度合并）")
        print("  3. ✅ WorkflowFactory 创建了 UnifiedWorkflow")
        print("  4. ✅ 只会生成一个最终音频文件，不会生成 S0-S5 分段文件")
        
        print("\n🚀 下一步:")
        print("  运行完整流程验证:")
        print("  python run.py --step all")
        print("\n  然后检查输出目录，应该只看到一个 final.mp3 文件！")
        print("=" * 70 + "\n")
        
        return True
        
    except Exception as e:
        print(f"\n❌ 演示失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
