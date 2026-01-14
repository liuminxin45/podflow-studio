# 模块化 Stages 架构

本文档描述了播客生成系统的模块化架构设计。

## 概述

将原有的紧耦合 Pipeline 拆分为 7 个独立可运行的 Stage，每个 Stage 具有规范化的输入输出接口，可单独运行或通过编排层组合运行。

## Pipeline 流程

```
Fetch → Cluster → Selection → Research → Script → Audio → Publish
```

## Stage 列表

| Stage | 功能 | 输入 | 输出 |
|-------|------|------|------|
| **fetch** | 数据获取 | 源配置列表 | 去重后的 items |
| **cluster** | 聚类 | items 字典 | clusters 列表 |
| **selection** | 选题 | clusters + items | 选中的 items |
| **research** | 研究 | items 列表 | 增强后的 items + 证据包 |
| **script** | 脚本生成 | items + 频道配置 | SSML 脚本 |
| **audio** | 音频生成 | SSML 脚本 | 音频文件路径 |
| **publish** | 发布 | 音频路径 + 元数据 | 发布结果 |

## 目录结构

```
src/stages/
├── __init__.py          # 模块入口
├── __main__.py          # CLI 入口
├── base.py              # BaseStage 基类
├── registry.py          # Stage 注册表
├── orchestrator.py      # 编排层
├── cli.py               # 命令行接口
├── schemas/             # 输入输出 Schema 定义
│   ├── common.py        # 通用 Schema
│   ├── fetch.py
│   ├── cluster.py
│   ├── selection.py
│   ├── research.py
│   ├── script.py
│   ├── audio.py
│   └── publish.py
└── impl/                # Stage 实现
    ├── fetch_stage.py
    ├── cluster_stage.py
    ├── selection_stage.py
    ├── research_stage.py
    ├── script_stage.py
    ├── audio_stage.py
    └── publish_stage.py
```

## 使用方式

### 1. 运行完整 Pipeline

```bash
# 运行完整流程
python -m src.stages run -d 2025-01-15

# 指定输出目录
python -m src.stages run -d 2025-01-15 -o ./output

# 从指定 Stage 开始
python -m src.stages run -d 2025-01-15 --start selection

# 运行到指定 Stage
python -m src.stages run -d 2025-01-15 --end script

# 跳过某些 Stage
python -m src.stages run -d 2025-01-15 --skip research,publish
```

### 2. 运行单个 Stage

```bash
# 运行单个 Stage
python -m src.stages stage fetch -i fetch_input.json -o fetch_output.json

# 查看 Stage Schema
python -m src.stages schema fetch

# 列出所有 Stage
python -m src.stages list
```

### 3. 编程方式调用

```python
from src.stages.orchestrator import run_pipeline
from pathlib import Path

result = run_pipeline(
    episode_id="life-consumer:2025-01-15",
    episode_date="2025-01-15",
    config=my_config,
    output_dir=Path("./out"),
    start_stage="selection",  # 可选
    end_stage="script",       # 可选
)

print(f"Status: {result.status}")
print(f"Run Dir: {result.run_dir}")
```

### 4. 单独调用 Stage

```python
from src.stages.registry import StageRegistry
from src.stages.impl import FetchStage  # 触发注册

# 获取 Stage 实例
stage = StageRegistry.get("fetch", config={})

# 从 JSON 文件运行
result = stage.run_from_file("fetch_input.json")

# 或从字典运行
result = stage.run_from_json({
    "run_id": "test001",
    "episode_date": "2025-01-15",
    "run_dir": "./out/test",
    "sources": [...],
})

# 保存结果
stage.save_result(result, "fetch_output.json")
```

## Schema 规范

### 通用字段

所有 Stage 的输入都包含：

```json
{
    "run_id": "string",
    "episode_date": "YYYY-MM-DD",
    "run_dir": "path/to/run/dir",
    "config": {}
}
```

所有 Stage 的输出都包含：

```json
{
    "run_id": "string",
    "episode_date": "YYYY-MM-DD",
    "artifacts_dir": "path/to/artifacts"
}
```

### Stage 结果

每个 Stage 运行后返回 `StageResult`：

```json
{
    "status": "success|partial|skipped|failed",
    "output": { ... },
    "error": null,
    "metadata": {
        "stage_name": "fetch",
        "stage_version": "1.0.0",
        "started_at": "2025-01-15T10:00:00",
        "completed_at": "2025-01-15T10:00:05",
        "duration_seconds": 5.0
    }
}
```

## 数据流示例

### Fetch → Cluster

Fetch 输出：
```json
{
    "items_dedup": {
        "item_001": {"id": "item_001", "title": "...", ...},
        "item_002": {"id": "item_002", "title": "...", ...}
    }
}
```

Cluster 输入：
```json
{
    "items": {
        "item_001": {"id": "item_001", "title": "...", ...},
        "item_002": {"id": "item_002", "title": "...", ...}
    }
}
```

### Selection → Research

Selection 输出：
```json
{
    "items_selected": [
        {"id": "item_001", "title": "...", ...},
        {"id": "item_002", "title": "...", ...}
    ]
}
```

Research 输入：
```json
{
    "items": [
        {"id": "item_001", "title": "...", ...},
        {"id": "item_002", "title": "...", ...}
    ]
}
```

## 扩展指南

### 添加新 Stage

1. 在 `schemas/` 下定义输入输出 Schema
2. 在 `impl/` 下实现 Stage 类
3. 使用 `@StageRegistry.register` 装饰器注册
4. 在 `orchestrator.py` 中更新数据流映射

```python
from src.stages.base import BaseStage
from src.stages.registry import StageRegistry

@StageRegistry.register
class MyStage(BaseStage[MyInput, MyOutput]):
    
    @property
    def name(self) -> str:
        return "my_stage"
    
    @property
    def input_schema(self):
        return MyInput
    
    @property
    def output_schema(self):
        return MyOutput
    
    def execute(self, input_data: MyInput) -> MyOutput:
        # 实现逻辑
        ...
```

## 优势

1. **独立运行** - 每个 Stage 可单独测试和运行
2. **规范接口** - Pydantic Schema 保证数据格式正确
3. **灵活编排** - 可跳过、重试、并行执行特定 Stage
4. **易于调试** - 每个 Stage 的输入输出都可序列化
5. **可扩展** - 通过注册表机制轻松添加新 Stage
