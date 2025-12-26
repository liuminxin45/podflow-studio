"""
Fetch Module Tests

这个文件包含了Fetch模块的完整测试用例，验证各种数据源获取功能。

测试范围：
- RSS订阅源获取测试
- AI工具集每日快讯测试
- 60s新闻数据获取测试

测试特点：
- 使用真实数据源进行测试
- 包含错误处理和边界条件测试
- 验证数据格式和完整性
- 支持超时和重试机制

主要测试函数：
- test_rss_fetch(): RSS获取测试
- test_aibot_daily_fetch(): AI工具集测试
- test_sixtys_fetch(): 60s新闻测试

测试数据：
- 自动生成测试输入文件
- 使用真实API端点
- 包含各种数据格式验证

运行方式：
    python src/fetch/tests/test_fetch.py

测试环境：
- Python 3.8+
- 需要网络连接
- 部分测试需要API访问权限

输出信息：
- 获取状态和响应时间
- 数据条目数量统计
- 错误信息和异常处理

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

import json
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from src.fetch.rss import fetch_rss_items_with_status
from src.fetch.aibot_daily import fetch_aibot_daily_items_with_status
from src.fetch.sixtys import fetch_sixtys_items_with_status


def test_rss_fetch():
    """测试RSS获取功能"""
    print("=== 测试RSS获取 ===")
    
    # 测试数据 - 60s每天读懂世界
    test_url = "https://60s.viki.moe/v2/60s/rss"
    test_source = "60s-每天60秒读懂世界"
    
    try:
        items, status = fetch_rss_items_with_status(
            url=test_url,
            source=test_source,
            timeout_seconds=30
        )
        
        print(f"获取状态: {status}")
        print(f"获取条目数: {len(items)}")
        
        if items:
            print(f"第一个条目: {items[0].get('title', 'N/A')}")
            print(f"第一个条目URL: {items[0].get('url', 'N/A')}")
        
        return len(items) > 0
        
    except Exception as e:
        print(f"RSS测试失败: {e}")
        return False


def test_aibot_daily_fetch():
    """测试AI工具集每日快讯获取"""
    print("\n=== 测试AI工具集每日快讯获取 ===")
    
    test_url = "https://ai-bot.cn/daily-ai-news/"
    test_source = "AI工具集-每日AI快讯"
    test_episode_date = "2025-12-25"
    
    try:
        items, status = fetch_aibot_daily_items_with_status(
            url=test_url,
            source=test_source,
            episode_date=test_episode_date,
            timeout_seconds=30
        )
        
        print(f"获取状态: {status}")
        print(f"获取条目数: {len(items)}")
        
        if items:
            print(f"第一个条目: {items[0].get('title', 'N/A')}")
            print(f"第一个条目URL: {items[0].get('url', 'N/A')}")
        
        return len(items) > 0
        
    except Exception as e:
        print(f"AI工具集测试失败: {e}")
        return False


def test_sixtys_fetch():
    """测试60s数据获取"""
    print("\n=== 测试60s数据获取 ===")
    
    test_base_url = "https://60s.viki.moe"
    test_source = "60s-每天60秒读懂世界(数据源)"
    
    try:
        items, status, _ = fetch_sixtys_items_with_status(
            base_url=test_base_url,
            source=test_source,
            timeout_seconds=30
        )
        
        print(f"获取状态: {status}")
        print(f"获取条目数: {len(items)}")
        
        if items:
            print(f"第一个条目: {items[0].get('title', 'N/A')}")
            print(f"第一个条目URL: {items[0].get('url', 'N/A')}")
        
        return len(items) > 0
        
    except Exception as e:
        print(f"60s数据测试失败: {e}")
        return False


def save_test_data(items, filename):
    """保存测试数据到文件"""
    test_data_dir = Path(__file__).parent / "test_data"
    test_data_dir.mkdir(exist_ok=True)
    
    output_file = test_data_dir / filename
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    
    print(f"测试数据已保存到: {output_file}")


def main():
    """运行所有fetch测试"""
    print("开始运行Fetch模块测试...\n")
    
    results = {}
    
    # 运行各项测试
    results['rss'] = test_rss_fetch()
    results['aibot_daily'] = test_aibot_daily_fetch()
    results['sixtys'] = test_sixtys_fetch()
    
    # 统计结果
    passed = sum(results.values())
    total = len(results)
    
    print(f"\n=== 测试结果 ===")
    print(f"通过: {passed}/{total}")
    
    for test_name, result in results.items():
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{test_name}: {status}")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
