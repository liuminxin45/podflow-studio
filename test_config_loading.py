"""
测试配置加载
验证 settings.yaml 中的 audio.workflow 配置是否正确加载
"""

import yaml
from pathlib import Path

def test_direct_yaml_load():
    """直接读取 YAML 文件"""
    print("=" * 60)
    print("测试 1: 直接读取 settings.yaml")
    print("=" * 60)
    
    settings_path = Path("config/base/settings.yaml")
    with open(settings_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
    
    audio_config = config.get("audio", {})
    workflow = audio_config.get("workflow")
    
    print(f"✓ audio.workflow = {workflow}")
    print(f"✓ audio 完整配置:")
    print(f"  - workflow: {audio_config.get('workflow')}")
    print(f"  - segmented: {audio_config.get('segmented')}")
    print(f"  - unified: {audio_config.get('unified')}")
    
    assert workflow == "unified", f"期望 'unified'，实际得到 '{workflow}'"
    print("\n✅ 测试 1 通过: settings.yaml 中确实配置了 unified\n")
    return config


def test_config_loader():
    """测试 ConfigLoader"""
    print("=" * 60)
    print("测试 2: 使用 ConfigLoader")
    print("=" * 60)
    
    from src.utils.config_loader import get_config_loader
    
    loader = get_config_loader()
    workflow = loader.get("audio.workflow")
    audio_config = loader.get("audio")
    
    print(f"✓ ConfigLoader.get('audio.workflow') = {workflow}")
    print(f"✓ ConfigLoader.get('audio') = {audio_config}")
    
    assert workflow == "unified", f"期望 'unified'，实际得到 '{workflow}'"
    print("\n✅ 测试 2 通过: ConfigLoader 正确读取了 unified\n")


def test_run_py_config_loading():
    """测试 run.py 的 _load_config 函数"""
    print("=" * 60)
    print("测试 3: run.py 的 _load_config")
    print("=" * 60)
    
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    
    # 导入 run.py 的配置加载函数
    from run import _load_config
    
    config = _load_config()
    audio_config = config.get("audio", {})
    workflow = audio_config.get("workflow")
    
    print(f"✓ _load_config()['audio']['workflow'] = {workflow}")
    print(f"✓ audio 配置存在: {bool(audio_config)}")
    
    if workflow != "unified":
        print(f"\n❌ 错误: run.py 加载的配置中 workflow = '{workflow}'，不是 'unified'")
        print(f"   audio 配置内容: {audio_config}")
        return False
    
    print("\n✅ 测试 3 通过: run.py 正确加载了 unified\n")
    return True


def test_context_config():
    """测试 EpisodeContext 中的配置"""
    print("=" * 60)
    print("测试 4: EpisodeContext 配置")
    print("=" * 60)
    
    from run import _load_config
    from src.app.core.context import EpisodeContext
    from pathlib import Path
    
    config = _load_config()
    ctx = EpisodeContext(
        episode_id="test-episode",
        channel="life-consumer",
        run_dir=Path("out/test"),
        config=config
    )
    
    audio_config = ctx.config.get("audio", {})
    workflow = audio_config.get("workflow")
    
    print(f"✓ ctx.config['audio']['workflow'] = {workflow}")
    print(f"✓ ctx.config 中有 audio 配置: {bool(audio_config)}")
    print(f"✓ audio 配置包含的键: {list(audio_config.keys())}")
    
    if workflow != "unified":
        print(f"\n❌ 错误: EpisodeContext 中 workflow = '{workflow}'，不是 'unified'")
        print(f"   这就是问题所在！")
        return False
    
    print("\n✅ 测试 4 通过: EpisodeContext 正确获取了 unified\n")
    return True


def test_workflow_factory():
    """测试 WorkflowFactory 创建"""
    print("=" * 60)
    print("测试 5: WorkflowFactory 创建工作流")
    print("=" * 60)
    
    from src.app.pipelines.steps.audio_workflows import WorkflowFactory
    import logging
    
    logger = logging.getLogger("test")
    
    # 测试 unified 模式
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
        print(f"✓ 成功创建工作流: {type(workflow).__name__}")
        print(f"✓ 工作流类型: {workflow.__class__.__module__}.{workflow.__class__.__name__}")
        
        # 检查是否是 UnifiedWorkflow
        if "UnifiedWorkflow" in type(workflow).__name__:
            print("\n✅ 测试 5 通过: 成功创建 UnifiedWorkflow\n")
            return True
        else:
            print(f"\n❌ 错误: 创建的是 {type(workflow).__name__}，不是 UnifiedWorkflow")
            return False
            
    except Exception as e:
        print(f"\n❌ 错误: 创建工作流失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """运行所有测试"""
    print("\n" + "=" * 60)
    print("开始配置加载测试")
    print("=" * 60 + "\n")
    
    try:
        # 测试 1: 直接读取 YAML
        config = test_direct_yaml_load()
        
        # 测试 2: ConfigLoader
        test_config_loader()
        
        # 测试 3: run.py 配置加载
        run_py_ok = test_run_py_config_loading()
        
        # 测试 4: EpisodeContext 配置
        context_ok = test_context_config()
        
        # 测试 5: WorkflowFactory
        factory_ok = test_workflow_factory()
        
        # 总结
        print("=" * 60)
        print("测试总结")
        print("=" * 60)
        print(f"1. 直接读取 YAML: ✅ 通过")
        print(f"2. ConfigLoader: ✅ 通过")
        print(f"3. run.py 加载: {'✅ 通过' if run_py_ok else '❌ 失败'}")
        print(f"4. EpisodeContext: {'✅ 通过' if context_ok else '❌ 失败'}")
        print(f"5. WorkflowFactory: {'✅ 通过' if factory_ok else '❌ 失败'}")
        
        if run_py_ok and context_ok and factory_ok:
            print("\n🎉 所有测试通过！配置加载正常。")
            return True
        else:
            print("\n⚠️ 发现问题，需要修复配置加载逻辑。")
            return False
            
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
