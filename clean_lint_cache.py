#!/usr/bin/env python3
"""
Clean Lint Cache

清理类型检查器和linter的缓存文件

使用方式：
    python clean_lint_cache.py

作者：Auto-Podcast Team
版本：1.0.0
"""

import shutil
from pathlib import Path


def clean_cache():
    """清理各种缓存文件"""
    project_root = Path(__file__).parent
    
    # 要清理的缓存目录
    cache_dirs = [
        project_root / ".pytest_cache",
        project_root / ".mypy_cache",
        project_root / ".ruff_cache",
    ]
    
    # 要清理的__pycache__目录
    pycache_dirs = list(project_root.rglob("__pycache__"))
    
    cleaned_count = 0
    
    print("🧹 清理类型检查器缓存...")
    
    # 清理主要缓存目录
    for cache_dir in cache_dirs:
        if cache_dir.exists():
            try:
                shutil.rmtree(cache_dir)
                print(f"✅ 删除缓存目录: {cache_dir.relative_to(project_root)}")
                cleaned_count += 1
            except Exception as e:
                print(f"⚠️  删除失败 {cache_dir}: {e}")
    
    # 清理__pycache__目录
    for pycache_dir in pycache_dirs:
        try:
            shutil.rmtree(pycache_dir)
            print(f"✅ 删除__pycache__: {pycache_dir.relative_to(project_root)}")
            cleaned_count += 1
        except Exception as e:
            print(f"⚠️  删除失败 {pycache_dir}: {e}")
    
    print(f"\n🎉 清理完成，共删除 {cleaned_count} 个缓存目录")
    print("\n💡 建议:")
    print("   1. 重新启动IDE/编辑器")
    print("   2. 重新加载类型检查器")
    print("   3. 如果问题持续，检查虚拟环境配置")


if __name__ == "__main__":
    clean_cache()
