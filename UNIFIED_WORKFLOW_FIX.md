# Unified 工作流修复说明

## 🐛 问题描述

配置了 `audio.workflow: unified` 后，系统仍然生成 S0-S5 分段音频文件，而不是预期的单个音频文件。

## 🔍 根本原因

**配置覆盖问题**：`pipeline.yaml` 中的 `audio` 配置完全覆盖了 `settings.yaml` 中的配置，导致 `audio.workflow` 丢失。

```python
# run.py 中的原始代码（有问题）
config.update(yaml.safe_load(f) or {})  # pipeline.yaml 覆盖 settings.yaml
```

## ✅ 修复方案

### 1. 修改 `run.py` - 实现深度合并

**文件**: `e:\neo\auto-podcast\run.py`

**修改**: 添加深度合并函数，保留 `settings.yaml` 中的配置

```python
def _deep_merge_dict(base: dict, override: dict) -> dict:
    """深度合并字典，override 中的值会覆盖 base 中的值"""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            # 递归合并嵌套字典
            result[key] = _deep_merge_dict(result[key], value)
        else:
            # 直接覆盖
            result[key] = value
    return result

def _load_config(config_path: str | None = None) -> dict:
    # ... 加载 settings.yaml ...
    
    # 深度合并 pipeline.yaml（不覆盖已有值）
    config = _deep_merge_dict(config, pipeline_cfg)
```

### 2. 更新 `pipeline.yaml` - 添加注释说明

**文件**: `e:\neo\auto-podcast\config\base\pipeline.yaml`

**修改**: 在 `audio` 配置中添加注释，说明 `workflow` 在 `settings.yaml` 中配置

```yaml
# Audio阶段
audio:
  # 工作流模式（从 settings.yaml 继承，这里不覆盖）
  # workflow: unified  # 在 settings.yaml 中配置
  
  # 混音配置
  mixing:
    target_loudness: -16.0
    # ...
```

## 🧪 验证测试

运行演示脚本验证修复：

```bash
python demo_unified_workflow.py
```

**预期输出**：
```
✅ 配置验证通过！
✅ UnifiedWorkflow 创建成功！
✅ 模拟执行验证通过！
✅ 演示完成！
```

## 📊 修复前后对比

### 修复前

```yaml
# settings.yaml
audio:
  workflow: unified  # ❌ 被覆盖

# pipeline.yaml  
audio:
  mixing: {...}  # ❌ 完全覆盖 settings.yaml 的 audio 配置

# 结果
ctx.config['audio']['workflow']  # None ❌
```

### 修复后

```yaml
# settings.yaml
audio:
  workflow: unified  # ✅ 保留

# pipeline.yaml
audio:
  # workflow: unified  # 注释说明
  mixing: {...}  # ✅ 深度合并，不覆盖 workflow

# 结果
ctx.config['audio']['workflow']  # 'unified' ✅
```

## 🎯 使用方法

### 1. 确认配置

检查 `config/base/settings.yaml`:

```yaml
audio:
  workflow: unified  # ✅ 确保是 unified
```

### 2. 运行完整流程

```bash
python run.py --step all
```

### 3. 验证输出

检查输出目录：

```
out/runs/YYYYMMDD/HHMMSS_XXXXXX_channel/
├── 4_tts/
│   ├── manifest.json          # workflow_mode: unified ✅
│   └── merged_script.txt      # 合并后的脚本 ✅
└── 5_render/
    └── YYYY-MM-DD.final.mp3   # 只有这一个文件 ✅
```

**不应该看到**：
- ❌ `4_tts/segments/S0.mp3`
- ❌ `4_tts/segments/S1.mp3`
- ❌ `4_tts/segments/S2.mp3`
- ❌ `4_tts/segments/S3.mp3`
- ❌ `4_tts/segments/S4.mp3`

### 4. 检查日志

查看日志确认工作流模式：

```
音频工作流模式: unified  ✅
创建统一音频工作流 (Unified Workflow)  ✅
脚本合并完成，总长度: XXXX 字符  ✅
✓ 统一TTS完成: XX.X秒  ✅
```

## 🔧 相关文件

- `run.py` - 配置加载逻辑
- `config/base/settings.yaml` - 主配置文件（包含 workflow）
- `config/base/pipeline.yaml` - 流程配置文件（不包含 workflow）
- `src/app/pipelines/steps/audio_step_segmented.py` - 音频步骤
- `src/app/pipelines/steps/audio_workflows/unified_workflow.py` - Unified 工作流实现

## 📝 技术细节

### 配置加载顺序

1. 加载 `settings.yaml` → `config`
2. 加载 `pipeline.yaml` → `pipeline_cfg`
3. 深度合并：`config = _deep_merge_dict(config, pipeline_cfg)`

### 深度合并规则

- 如果键在两个字典中都存在且都是字典 → 递归合并
- 否则 → `pipeline.yaml` 的值覆盖 `settings.yaml` 的值
- 但由于 `pipeline.yaml` 中没有 `audio.workflow`，所以 `settings.yaml` 的值被保留

### 工作流选择逻辑

```python
# AudioStepSegmented.execute()
audio_cfg = ctx.config.get("audio", {})
workflow_mode = audio_cfg.get("workflow", "segmented")  # 默认 segmented

workflow = WorkflowFactory.create_workflow(
    mode=workflow_mode,  # "unified"
    config=audio_cfg,
    logger=self.logger
)
```

## ✅ 修复确认清单

- [x] `run.py` 实现深度合并
- [x] `pipeline.yaml` 添加注释说明
- [x] 创建演示脚本验证修复
- [x] 演示脚本全部通过
- [x] 文档说明修复方案

## 🎉 总结

**问题**: 配置覆盖导致 `audio.workflow` 丢失

**修复**: 实现深度合并保留 `settings.yaml` 配置

**结果**: Unified 工作流正常工作，只生成单个音频文件

**验证**: 运行 `python demo_unified_workflow.py` 全部通过 ✅
