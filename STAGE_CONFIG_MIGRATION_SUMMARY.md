# Stage Configuration Migration Summary

## 概述

所有 7 个 Stage 现在都有独立的配置文件，支持独立运行，不依赖 `.env` 文件。同时新增了全局配置模块，提供 LLM 等共享配置。

## 完成的工作

### 1. 全局配置模块 ✅

**文件**: `src/config/global_config.py`

提供全局共享配置，各 Stage 可以自由读取：

- **LLMConfig**: provider, model, temperature, max_tokens, timeout_seconds, base_url, api_key
- **ChannelConfig**: id, name, language, style
- **OutputConfig**: 各种输出路径配置

**使用方式**:
```python
from src.config.global_config import get_llm_config, get_channel_config

llm_config = get_llm_config()
channel_config = get_channel_config()
```

### 2. 各 Stage 独立配置文件 ✅

| Stage | 配置文件 | 状态 |
|-------|---------|------|
| Fetch | `src/stages/impl/fetch_config.py` | ✅ 已创建 |
| Cluster | `src/stages/impl/cluster_config.py` | ✅ 已创建 |
| Selection | `src/stages/impl/selection_config.py` | ✅ 已创建 |
| Research | `src/stages/impl/research_config.py` | ✅ 已创建 |
| Script | `src/stages/impl/script_config.py` | ✅ 已创建 |
| Audio | `src/stages/impl/audio_config.py` | ✅ 已创建 |
| Publish | `src/stages/impl/publish_config.py` | ✅ 已创建 |

### 3. Stage 代码更新 ✅

- **Script Stage** (`script_stage.py`): 更新为使用全局 LLM 配置
- **Audio Stage** (`audio_stage.py`): 更新为使用 audio_config 加载器
- **Research Stage** (`research_stage.py`): 已有独立配置，增加日志输出

### 4. 文档 ✅

- `src/stages/impl/README_STAGE_CONFIG.md` - 完整的 Stage 配置系统文档
- `src/stages/impl/README_RESEARCH.md` - Research Stage 详细文档
- `src/config/__init__.py` - 配置模块导出

## 配置优先级

所有配置遵循统一的优先级顺序：

```
环境变量 > 配置文件 (config/optimized_settings.yaml) > 默认值
```

## 使用示例

### 独立运行 Stage

```python
# 示例：独立运行 Research Stage
from src.stages.impl.research_config import load_research_stage_config
from src.stages.impl.research_stage import ResearchStage

# 加载配置（可指定自定义配置文件）
config = load_research_stage_config("path/to/custom_config.yaml")

# 创建并运行 Stage
stage = ResearchStage()
result = stage.run_from_json({
    "run_id": "test_001",
    "episode_date": "2026-01-15",
    "run_dir": "./out/test",
    "items": [...],
    "research_config": config.model_dump()
})
```

### 使用全局 LLM 配置

```python
from src.config.global_config import get_llm_config

# 在任何 Stage 中获取 LLM 配置
llm_config = get_llm_config()

print(f"Provider: {llm_config.provider}")
print(f"Model: {llm_config.model}")
print(f"API Key: {llm_config.api_key}")
print(f"Temperature: {llm_config.temperature}")
```

### 加载 Stage 配置

```python
# Fetch Stage
from src.stages.impl.fetch_config import load_fetch_stage_config
fetch_config = load_fetch_stage_config()

# Cluster Stage
from src.stages.impl.cluster_config import load_cluster_stage_config
cluster_config = load_cluster_stage_config()

# Selection Stage
from src.stages.impl.selection_config import load_selection_stage_config
selection_config = load_selection_stage_config()

# Research Stage
from src.stages.impl.research_config import load_research_stage_config
research_config = load_research_stage_config()

# Script Stage
from src.stages.impl.script_config import load_script_stage_config
script_config = load_script_stage_config()

# Audio Stage
from src.stages.impl.audio_config import load_audio_stage_config
audio_config = load_audio_stage_config()

# Publish Stage
from src.stages.impl.publish_config import load_publish_stage_config
publish_config = load_publish_stage_config()
```

## 环境变量支持

### 全局配置

```bash
# LLM 配置
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=4000
LLM_TIMEOUT_SECONDS=120
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=sk-xxx

# 频道配置
CHANNEL_ID=life-consumer
CHANNEL_NAME=生活与消费资讯
CHANNEL_LANGUAGE=zh-CN
```

### Stage 特定配置

```bash
# Fetch
FETCH_TIMEOUT_SECONDS=30

# Cluster
CLUSTER_SIMHASH_MAX_DISTANCE=4
CLUSTER_TITLE_MIN_JACCARD=0.4
CLUSTER_TIME_WINDOW_DAYS=1

# Selection
SELECTION_MAX_CLUSTERS=5
SELECTION_AUTO_TOPIC_ENABLED=true
SELECTION_STRATEGY=balanced

# Research
RESEARCH_ENABLED=true
RESEARCH_PROVIDER=anspire
RESEARCH_MAX_TOTAL_CLAIMS=20
RESEARCH_MAX_CLAIMS_PER_ITEM=5

# Script
SCRIPT_PROVIDER=deepseek
SCRIPT_TEMPERATURE=0.7
SCRIPT_MAX_TOKENS=4000

# Audio
TTS_PROVIDER=doubao
TTS_MODE=podcast
TTS_TIMEOUT_SECONDS=120
DOUBAO_MODE=podcast

# Publish
PUBLISH_LOCAL_ENABLED=true
PUBLISH_REMOTE_ENABLED=false
PUBLISH_PLATFORMS=rss,spotify
```

## 配置文件示例

`config/optimized_settings.yaml`:

```yaml
# 全局 LLM 配置
llm:
  provider: deepseek
  model: deepseek-chat
  temperature: 0.7
  max_tokens: 4000
  timeout_seconds: 120

# 频道配置
channel:
  id: life-consumer
  name: 生活与消费资讯
  language: zh-CN
  style:
    audience: 普通消费者
    length_minutes: 6
    tone: 口语化、生动、像朋友聊天

# Research 配置
research:
  enabled: true
  provider: anspire
  max_items: 10
  max_sources: 3
  timeout_seconds: 60
  max_retries: 3

# TTS 配置
tts:
  provider: doubao
  mode: podcast
  timeout_seconds: 120

# Selection 配置
selection:
  clustering:
    simhash_max_distance: 1
    title_min_jaccard: 0.2
    time_window_days: 1
  constraints:
    max_clusters: 5

# Auto Topic 配置
auto_topic:
  enabled: true

# 输出路径配置
output:
  runs_dir: ./out/runs
  fetch_archives_dir: ./out/fetch
  script_dir: ./out/script
  tts_dir: ./out/tts
  render_dir: ./out/render
  publish_dir: ./out/publish
```

## 迁移指南

### 从 .env 迁移

1. **识别现有 .env 配置**
2. **迁移到 config/optimized_settings.yaml**
3. **保留敏感信息（API Keys）在环境变量中**
4. **测试配置加载**

### 示例迁移

**旧方式 (.env)**:
```bash
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_MODEL=deepseek-chat
RESEARCH_ENABLED=true
RESEARCH_PROVIDER=anspire
```

**新方式 (config/optimized_settings.yaml + 环境变量)**:
```yaml
# config/optimized_settings.yaml
llm:
  provider: deepseek
  model: deepseek-chat

research:
  enabled: true
  provider: anspire
```

```bash
# 环境变量（仅敏感信息）
DEEPSEEK_API_KEY=sk-xxx
# 或使用通用的 LLM_API_KEY
LLM_API_KEY=sk-xxx
```

## 优势

1. **解耦**: 每个 Stage 配置独立，不依赖全局 .env
2. **灵活**: 支持自定义配置文件路径
3. **可测试**: 每个 Stage 可以独立测试
4. **优先级清晰**: 环境变量 > 配置文件 > 默认值
5. **向后兼容**: 仍然支持原有的环境变量
6. **全局共享**: LLM 等配置可以在多个 Stage 间共享

## 测试建议

```python
# 测试全局配置加载
from src.config.global_config import get_global_config

config = get_global_config()
print(f"LLM Provider: {config.llm.provider}")
print(f"Channel: {config.channel.name}")

# 测试各 Stage 配置加载
from src.stages.impl.research_config import load_research_stage_config

research_config = load_research_stage_config()
print(f"Research enabled: {research_config.enabled}")
print(f"Research provider: {research_config.provider}")
```

## 相关文档

- `src/stages/impl/README_STAGE_CONFIG.md` - 完整配置系统文档
- `src/stages/impl/README_RESEARCH.md` - Research Stage 详细文档
- `src/config/global_config.py` - 全局配置模块源码

## 下一步

1. 测试所有 Stage 的配置加载
2. 验证环境变量覆盖功能
3. 更新前端配置面板（如需要）
4. 添加配置验证和错误提示
