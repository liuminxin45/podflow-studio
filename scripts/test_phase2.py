"""
Phase 2 测试脚本

测试 Track（赛道）可插拔架构
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
import logging

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


def test_track_registry():
    """测试 Track 注册表"""
    print("=" * 80)
    print("测试 1: Track 注册表")
    print("=" * 80)
    
    try:
        from src.tracks import TrackRegistry
        
        available = TrackRegistry.list_available()
        print(f"✓ 可用的 Tracks: {available}")
        
        assert "life_consumer" in available
        assert "ai_apps" in available
        assert "headline" in available
        
        print("\n✅ Track 注册表测试通过\n")
        return True
        
    except Exception as e:
        print(f"\n❌ Track 注册表测试失败: {e}\n")
        import traceback
        traceback.print_exc()
        return False


def test_life_consumer_track():
    """测试生活消费 Track"""
    print("=" * 80)
    print("测试 2: 生活消费 Track")
    print("=" * 80)
    
    try:
        from src.tracks import TrackRegistry
        
        track = TrackRegistry.get("life_consumer", {})
        
        print(f"✓ Track 名称: {track.get_name()}")
        print(f"✓ Track 描述: {track.get_description()}")
        
        # 测试 Filter Policy
        filter_policy = track.get_filter_policy()
        keywords = filter_policy.get_priority_keywords()
        print(f"✓ 优先级关键词数量: {len(keywords)}")
        print(f"  示例: {keywords[:5]}")
        
        # 测试 Scoring Policy
        scoring_policy = track.get_scoring_policy()
        scoring_cfg = scoring_policy.get_scoring_config()
        print(f"✓ 打分配置: threshold_must={scoring_cfg['threshold_must_publish']}, threshold_maybe={scoring_cfg['threshold_maybe_publish']}")
        
        # 测试 Gate Policy
        gate_policy = track.get_gate_policy()
        system_prompt = gate_policy.get_system_prompt()
        print(f"✓ System Prompt 长度: {len(system_prompt)} 字符")
        
        # 测试 Script Style
        script_style = track.get_script_style()
        print(f"✓ 脚本风格: {script_style.get_style_name()}")
        print(f"✓ 段落结构: {len(script_style.get_section_structure())} 个段落")
        
        print("\n✅ 生活消费 Track 测试通过\n")
        return True
        
    except Exception as e:
        print(f"\n❌ 生活消费 Track 测试失败: {e}\n")
        import traceback
        traceback.print_exc()
        return False


def test_track_switching():
    """测试 Track 切换"""
    print("=" * 80)
    print("测试 3: Track 切换")
    print("=" * 80)
    
    try:
        from src.tracks import TrackRegistry
        
        # 测试切换到不同 Track
        for track_name in ["life_consumer", "ai_apps", "headline"]:
            track = TrackRegistry.get(track_name, {})
            print(f"✓ 切换到 {track_name}: {track.get_description()}")
        
        # 测试无效 Track
        try:
            TrackRegistry.get("invalid_track", {})
            print("❌ 应该抛出异常但没有")
            return False
        except ValueError as e:
            print(f"✓ 正确处理无效 Track: {e}")
        
        print("\n✅ Track 切换测试通过\n")
        return True
        
    except Exception as e:
        print(f"\n❌ Track 切换测试失败: {e}\n")
        import traceback
        traceback.print_exc()
        return False


def test_context_with_track():
    """测试 Context 集成 Track"""
    print("=" * 80)
    print("测试 4: Context 集成 Track")
    print("=" * 80)
    
    try:
        from src.app.context import EpisodeContext
        from src.tracks import TrackRegistry
        from datetime import datetime
        
        track = TrackRegistry.get("life_consumer", {})
        
        ctx = EpisodeContext(
            episode_id="test:2025-12-29",
            episode_date="2025-12-29",
            run_id="test_run",
            config={"test": "config"},
            track=track,
            output_dir=Path("./out"),
            run_dir=Path("./out/test"),
        )
        
        print(f"✓ Context 创建成功")
        print(f"✓ Track: {ctx.track.get_name() if ctx.track else 'None'}")
        
        assert ctx.track is not None
        assert ctx.track.get_name() == "life_consumer"
        
        print("\n✅ Context 集成 Track 测试通过\n")
        return True
        
    except Exception as e:
        print(f"\n❌ Context 集成 Track 测试失败: {e}\n")
        import traceback
        traceback.print_exc()
        return False


def main():
    """运行所有测试"""
    print("\n" + "=" * 80)
    print("Phase 2 Track 架构测试")
    print("=" * 80 + "\n")
    
    results = []
    
    results.append(("Track 注册表", test_track_registry()))
    results.append(("生活消费 Track", test_life_consumer_track()))
    results.append(("Track 切换", test_track_switching()))
    results.append(("Context 集成 Track", test_context_with_track()))
    
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
        print("\n🎉 所有测试通过！Phase 2 Track 架构验证成功！\n")
        return 0
    else:
        print(f"\n⚠️  有 {total - passed} 个测试失败\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
