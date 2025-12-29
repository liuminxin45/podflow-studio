"""
分析未使用的文件

扫描指定目录，找出未被import或引用的文件
"""

import os
import re
from pathlib import Path
from collections import defaultdict

# 要分析的目录
DIRS_TO_ANALYZE = [
    "config",
    "src/audio",
    "src/fetch",
    "src/llm",
    "src/publish",
    "src/research",
    "src/store",
    "src/topic_selection",
    "src/tts",
    "src/utils",
    "tests",
]

# 排除的文件模式
EXCLUDE_PATTERNS = [
    "__pycache__",
    ".pyc",
    ".git",
    "analyze_unused_files.py",
]

def should_exclude(path: str) -> bool:
    """检查是否应该排除该路径"""
    for pattern in EXCLUDE_PATTERNS:
        if pattern in path:
            return True
    return False

def find_all_python_files(base_dir: Path) -> list[Path]:
    """找到所有Python文件"""
    python_files = []
    for root, dirs, files in os.walk(base_dir):
        # 排除__pycache__等目录
        dirs[:] = [d for d in dirs if not should_exclude(d)]
        
        for file in files:
            if file.endswith('.py') and not should_exclude(file):
                python_files.append(Path(root) / file)
    
    return python_files

def find_all_config_files(base_dir: Path) -> list[Path]:
    """找到所有配置文件"""
    config_files = []
    config_dir = base_dir / "config"
    if config_dir.exists():
        for root, dirs, files in os.walk(config_dir):
            for file in files:
                if file.endswith(('.yaml', '.json', '.yml')) and not should_exclude(file):
                    config_files.append(Path(root) / file)
    
    return config_files

def extract_imports(file_path: Path) -> set[str]:
    """提取文件中的所有import语句"""
    imports = set()
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
            # 匹配 from xxx import yyy
            from_imports = re.findall(r'from\s+([\w.]+)\s+import', content)
            imports.update(from_imports)
            
            # 匹配 import xxx
            direct_imports = re.findall(r'^import\s+([\w.]+)', content, re.MULTILINE)
            imports.update(direct_imports)
            
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
    
    return imports

def module_path_to_file(module_path: str, base_dir: Path) -> Path | None:
    """将模块路径转换为文件路径"""
    # src.fetch.rss -> src/fetch/rss.py
    parts = module_path.split('.')
    
    # 尝试作为文件
    file_path = base_dir / '/'.join(parts[:-1]) / f"{parts[-1]}.py"
    if file_path.exists():
        return file_path
    
    # 尝试作为包
    package_path = base_dir / '/'.join(parts) / "__init__.py"
    if package_path.exists():
        return package_path
    
    return None

def analyze_usage(base_dir: Path) -> dict:
    """分析文件使用情况"""
    print("正在扫描所有Python文件...")
    all_python_files = find_all_python_files(base_dir)
    print(f"找到 {len(all_python_files)} 个Python文件")
    
    print("\n正在分析import关系...")
    # 收集所有import
    all_imports = set()
    for py_file in all_python_files:
        imports = extract_imports(py_file)
        all_imports.update(imports)
    
    print(f"找到 {len(all_imports)} 个唯一的import语句")
    
    # 分析每个目录
    results = {}
    
    for dir_name in DIRS_TO_ANALYZE:
        dir_path = base_dir / dir_name
        if not dir_path.exists():
            continue
        
        print(f"\n分析目录: {dir_name}")
        
        files_in_dir = []
        for root, dirs, files in os.walk(dir_path):
            dirs[:] = [d for d in dirs if not should_exclude(d)]
            for file in files:
                if (file.endswith('.py') or file.endswith(('.yaml', '.json', '.yml'))) and not should_exclude(file):
                    files_in_dir.append(Path(root) / file)
        
        used_files = []
        unused_files = []
        
        for file_path in files_in_dir:
            # 检查是否被import
            relative_path = file_path.relative_to(base_dir)
            
            # 转换为模块路径
            if file_path.suffix == '.py':
                module_parts = list(relative_path.parts)
                if module_parts[-1] == '__init__.py':
                    module_parts = module_parts[:-1]
                else:
                    module_parts[-1] = module_parts[-1][:-3]  # 移除.py
                
                module_path = '.'.join(module_parts)
                
                # 检查是否被import
                is_used = False
                for imp in all_imports:
                    if imp.startswith(module_path) or module_path.startswith(imp):
                        is_used = True
                        break
                
                # 特殊文件总是被认为是使用的
                if file_path.name in ['__init__.py', 'run.py', '__main__.py']:
                    is_used = True
                
                if is_used:
                    used_files.append(file_path)
                else:
                    unused_files.append(file_path)
            else:
                # 配置文件，检查是否在代码中被引用
                file_name = file_path.name
                is_used = False
                
                for py_file in all_python_files:
                    try:
                        with open(py_file, 'r', encoding='utf-8') as f:
                            content = f.read()
                            if file_name in content or str(relative_path).replace('\\', '/') in content:
                                is_used = True
                                break
                    except:
                        pass
                
                if is_used:
                    used_files.append(file_path)
                else:
                    unused_files.append(file_path)
        
        results[dir_name] = {
            'used': used_files,
            'unused': unused_files,
            'total': len(files_in_dir)
        }
        
        print(f"  总文件: {len(files_in_dir)}")
        print(f"  使用中: {len(used_files)}")
        print(f"  未使用: {len(unused_files)}")
    
    return results

def main():
    base_dir = Path(__file__).parent
    print(f"基础目录: {base_dir}")
    print("=" * 80)
    
    results = analyze_usage(base_dir)
    
    print("\n" + "=" * 80)
    print("未使用文件汇总:")
    print("=" * 80)
    
    total_unused = 0
    for dir_name, data in results.items():
        if data['unused']:
            print(f"\n{dir_name}/ ({len(data['unused'])} 个未使用):")
            for file_path in sorted(data['unused']):
                relative = file_path.relative_to(base_dir)
                print(f"  - {relative}")
                total_unused += 1
    
    print(f"\n总计未使用文件: {total_unused}")
    
    # 保存结果
    output_file = base_dir / "unused_files_report.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("未使用文件报告\n")
        f.write("=" * 80 + "\n\n")
        
        for dir_name, data in results.items():
            if data['unused']:
                f.write(f"\n{dir_name}/ ({len(data['unused'])} 个未使用):\n")
                for file_path in sorted(data['unused']):
                    relative = file_path.relative_to(base_dir)
                    f.write(f"  {relative}\n")
        
        f.write(f"\n总计未使用文件: {total_unused}\n")
    
    print(f"\n报告已保存到: {output_file}")

if __name__ == "__main__":
    main()
