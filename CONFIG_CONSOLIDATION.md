# 配置文件整合说明

## ✅ 已完成的改进

### 问题
之前有两个配置文件：
- `settings.yaml` - 包含 LLM、TTS、Research 等配置
- `pipeline.yaml` - 包含 Fetch、Store、Research、Script、Audio 等配置

**问题**：
1. ❌ 职责重叠（research、audio 在两个文件都有）
2. ❌ 配置覆盖导致 bug（audio.workflow 被覆盖）
3. ❌ 维护困难（需要在两个文件间切换）
4. ❌ 用户困惑（不知道该在哪配置）

### 解决方案

**✅ 合并为单一配置文件 `settings.yaml`**

## 📋 变更内容

### 1. 合并配置到 `settings.yaml`

将 `pipeline.yaml` 的所有配置合并到 `settings.yaml`，包括：

- ✅ **系统配置** - version, general
- ✅ **Fetch 阶段** - fetch, dedup, date_filter, rss, metaso
- ✅ **Store 阶段** - clustering, scoring, constraints
- ✅ **Research 阶段** - claims, budget, query
- ✅ **Editorial 阶段** - sections, evidence
- ✅ **Script 阶段** - quality_gate, chapters
- ✅ **Audio 阶段** - mixing, bgm, export
- ✅ **字幕配置** - subtitles
- ✅ **缓存配置** - cache
- ✅ **成本控制** - cost_control

### 2. 简化 `run.py`

**修改前**：
```python
# 加载 settings.yaml
config = yaml.safe_load(f) or {}

# 加载 pipeline.yaml（深度合并）
config = _deep_merge_dict(config, pipeline_cfg)
```

**修改后**：
```python
# 只加载 settings.yaml（统一配置文件）
return yaml.safe_load(f) or {}
```

### 3. 弃用 `pipeline.yaml`

```bash
config/base/pipeline.yaml → config/base/pipeline.yaml.deprecated
```

## 🎯 使用方法

### 现在只需要编辑一个文件

```bash
# 打开配置文件
code config/base/settings.yaml
```

### 配置文件结构

```yaml
# settings.yaml - 统一配置文件

# 系统配置
version: "2.0.0"
general:
  cache_enabled: true
  metrics_enabled: true

# 日志配置
logging:
  console_level: INFO
  file_level: DEBUG

# 频道配置
channel:
  id: life-consumer

# Fetch 阶段
fetch:
  timeout_seconds: 300
  max_items: 50

# Store 阶段
store:
  clustering:
    simhash_max_distance: 4

# Selection 配置
selection:
  max_clusters: 5

# LLM 配置
llm:
  provider: "deepseek"
  deepseek:
    api_key: "YOUR_KEY"

# TTS 配置
tts:
  provider: "doubao"
  doubao:
    app_id: "YOUR_APP_ID"
    mode: "tts"

# Audio 工作流
audio:
  workflow: unified  # ✅ 不会被覆盖了！
  mixing:
    target_loudness: -16.0

# Research 配置
research:
  provider: "anspire"
  claims:
    max_claims_per_item: 10

# Script 配置
script:
  quality_gate:
    enabled: true

# 输出配置
output:
  runs_dir: "./out/runs"

# 缓存配置
cache:
  base_dir: ".cache"

# 成本控制
cost_control:
  max_cost_per_episode: 1.0
```

## ✅ 验证结果

运行测试：
```bash
python demo_unified_workflow.py
```

**结果**：
```
✅ 配置验证通过！audio.workflow = 'unified'
✅ UnifiedWorkflow 创建成功！
✅ 模拟执行验证通过！
✅ 演示完成！
```

## 📊 对比

| 特性 | 之前（2个文件） | 现在（1个文件） |
|------|----------------|----------------|
| 配置文件数量 | 2个 | **1个** ✅ |
| 配置覆盖问题 | 有 | **无** ✅ |
| 维护难度 | 高 | **低** ✅ |
| 用户困惑 | 有 | **无** ✅ |
| 配置查找 | 需要在2个文件找 | **只在1个文件** ✅ |

## 🔧 相关文件

### 已修改
- ✅ `config/base/settings.yaml` - 合并了所有配置
- ✅ `run.py` - 简化为只加载 settings.yaml
- ✅ `config/base/pipeline.yaml` → `pipeline.yaml.deprecated`

### 已删除的代码
- ❌ `_deep_merge_dict()` 函数（不再需要）
- ❌ pipeline.yaml 加载逻辑

## 🎉 优势

1. **简单明了** - 所有配置在一个文件
2. **易于维护** - 只需编辑一个文件
3. **避免冲突** - 不会有配置覆盖问题
4. **符合直觉** - 用户只需知道 settings.yaml
5. **减少代码** - 不需要深度合并逻辑

## 📝 迁移指南

如果您之前修改过 `pipeline.yaml`：

1. 打开 `config/base/pipeline.yaml.deprecated`
2. 找到您的自定义配置
3. 复制到 `config/base/settings.yaml` 的对应位置
4. 删除 `pipeline.yaml.deprecated`

## ⚠️ 注意事项

- `pipeline.yaml.deprecated` 已不再使用
- 所有配置现在都在 `settings.yaml` 中
- 如果看到配置不生效，检查是否在 `settings.yaml` 中修改

## 🚀 下一步

运行完整流程验证：

```bash
python run.py --step all
```

检查输出，确认 unified 工作流正常工作！
