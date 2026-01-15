# Stage Configuration System

## Overview

每个 Stage 现在都有独立的配置文件，支持独立运行，不依赖 `.env` 文件。

## 配置优先级

所有 Stage 配置遵循统一的优先级顺序：

1. **环境变量** (最高优先级)
2. **配置文件** (`config/optimized_settings.yaml`)
3. **默认值** (最低优先级)

## Stage 配置文件列表

| Stage | 配置文件 | 说明 |
|-------|---------|------|
| Fetch | `fetch_config.py` | 数据源配置 |
| Cluster | `cluster_config.py` | 聚类算法配置 |
| Selection | `selection_config.py` | 选题策略配置 |
| Research | `research_config.py` | 研究服务配置 |
| Script | `script_config.py` | 脚本生成配置 |
| Audio | `audio_config.py` | TTS 和音频渲染配置 |
| Publish | `publish_config.py` | 发布平台配置 |

## 全局配置模块

### `src/config/global_config.py`

提供全局共享配置，各 Stage 可以自由读取：

- **LLM 配置**: provider, model, temperature, max_tokens, timeout_seconds
- **频道配置**: id, name, language, style
- **输出路径配置**: runs_dir, script_dir, tts_dir, etc.

### 使用示例

```python
from src.config.global_config import get_llm_config, get_channel_config

# 获取 LLM 配置
llm_config = get_llm_config()
print(f"Provider: {llm_config.provider}")
print(f"Model: {llm_config.model}")
print(f"API Key: {llm_config.api_key}")

# 获取频道配置
channel_config = get_channel_config()
print(f"Channel: {channel_config.name}")
print(f"Style: {channel_config.style}")
```

## 各 Stage 配置详解

### 1. Fetch Stage

**配置文件**: `src/stages/impl/fetch_config.py`

```python
from src.stages.impl.fetch_config import load_fetch_stage_config

config = load_fetch_stage_config()
# Returns: {"sources": [...], "timeout_seconds": 30}
```

**环境变量**:
- `FETCH_TIMEOUT_SECONDS`: 超时时间（秒）

**配置文件路径**: `config/optimized_settings.yaml` → `sources.rss`

---

### 2. Cluster Stage

**配置文件**: `src/stages/impl/cluster_config.py`

```python
from src.stages.impl.cluster_config import load_cluster_stage_config

config = load_cluster_stage_config()
# Returns: ClusterConfig object
```

**环境变量**:
- `CLUSTER_SIMHASH_MAX_DISTANCE`: SimHash 最大距离
- `CLUSTER_TITLE_MIN_JACCARD`: 标题最小 Jaccard 相似度
- `CLUSTER_TIME_WINDOW_DAYS`: 时间窗口（天）

**配置文件路径**: `config/optimized_settings.yaml` → `selection.clustering`

---

### 3. Selection Stage

**配置文件**: `src/stages/impl/selection_config.py`

```python
from src.stages.impl.selection_config import load_selection_stage_config

config = load_selection_stage_config()
# Returns: {"max_clusters": 5, "auto_topic_enabled": True, ...}
```

**环境变量**:
- `SELECTION_MAX_CLUSTERS`: 最大聚类数
- `SELECTION_AUTO_TOPIC_ENABLED`: 是否启用自动选题
- `SELECTION_STRATEGY`: 选题策略

**配置文件路径**: 
- `config/optimized_settings.yaml` → `selection.constraints`
- `config/optimized_settings.yaml` → `auto_topic`

---

### 4. Research Stage

**配置文件**: `src/stages/impl/research_config.py`

```python
from src.stages.impl.research_config import load_research_stage_config

config = load_research_stage_config()
# Returns: ResearchConfig object
```

**环境变量**:
- `RESEARCH_ENABLED`: 是否启用研究
- `RESEARCH_PROVIDER`: 研究服务提供商 (metaso/anspire/bocha)
- `RESEARCH_MAX_TOTAL_CLAIMS`: 最大声明数
- `RESEARCH_MAX_CLAIMS_PER_ITEM`: 每项最大声明数

**配置文件路径**: `config/optimized_settings.yaml` → `research`

**详细文档**: 参见 `README_RESEARCH.md`

---

### 5. Script Stage

**配置文件**: `src/stages/impl/script_config.py`

```python
from src.stages.impl.script_config import load_script_stage_config

config = load_script_stage_config()
# Returns: {"script_config": {...}, "channel": {...}}
```

**环境变量**:
- `SCRIPT_PROVIDER`: 脚本生成提供商
- `SCRIPT_TEMPERATURE`: 温度参数
- `SCRIPT_MAX_TOKENS`: 最大 token 数
- `CHANNEL_ID`: 频道 ID
- `CHANNEL_NAME`: 频道名称

**配置文件路径**: 
- `config/optimized_settings.yaml` → `llm`
- `config/optimized_settings.yaml` → `channel`

**注意**: Script Stage 也可以使用全局 LLM 配置：

```python
from src.config.global_config import get_llm_config

llm_config = get_llm_config()
```

---

### 6. Audio Stage

**配置文件**: `src/stages/impl/audio_config.py`

```python
from src.stages.impl.audio_config import load_audio_stage_config

config = load_audio_stage_config()
# Returns: AudioConfig object
```

**环境变量**:
- `TTS_PROVIDER`: TTS 提供商
- `TTS_MODE`: TTS 模式 (podcast/tts/voiceclone_http)
- `TTS_TIMEOUT_SECONDS`: 超时时间
- `DOUBAO_MODE`: 豆包模式（向后兼容）
- `RENDER_ADD_BGM`: 是否添加背景音乐
- `RENDER_ADD_INTRO`: 是否添加片头
- `RENDER_ADD_OUTRO`: 是否添加片尾

**配置文件路径**: `config/optimized_settings.yaml` → `tts`

---

### 7. Publish Stage

**配置文件**: `src/stages/impl/publish_config.py`

```python
from src.stages.impl.publish_config import load_publish_stage_config

config = load_publish_stage_config()
# Returns: PublishConfig object
```

**环境变量**:
- `PUBLISH_LOCAL_ENABLED`: 是否启用本地发布
- `PUBLISH_REMOTE_ENABLED`: 是否启用远程发布
- `PUBLISH_PLATFORMS`: 发布平台列表（逗号分隔）

**配置文件路径**: `config/optimized_settings.yaml` → `publish`

---

## 独立运行示例

每个 Stage 现在都可以独立运行，不需要依赖全局 `.env` 文件：

```python
# 示例：独立运行 Research Stage
from src.stages.impl.research_config import load_research_stage_config
from src.stages.impl.research_stage import ResearchStage

# 加载配置
config = load_research_stage_config("path/to/custom_config.yaml")

# 创建 Stage 实例
stage = ResearchStage()

# 准备输入
input_data = {
    "run_id": "test_001",
    "episode_date": "2026-01-15",
    "run_dir": "./out/test",
    "items": [...],
    "research_config": config.model_dump()
}

# 运行 Stage
result = stage.run_from_json(input_data)
```

## 配置文件示例

### `config/optimized_settings.yaml`

```yaml
# LLM 全局配置
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

# TTS 配置
tts:
  provider: doubao
  mode: podcast
  timeout_seconds: 120

# 其他 Stage 配置...
```

## 迁移指南

### 从 `.env` 迁移到配置文件

1. **识别 `.env` 中的配置**
   ```bash
   # 旧方式 (.env)
   DEEPSEEK_API_KEY=sk-xxx
   DEEPSEEK_MODEL=deepseek-chat
   RESEARCH_ENABLED=true
   ```

2. **迁移到 `config/optimized_settings.yaml`**
   ```yaml
   # 新方式 (config/optimized_settings.yaml)
   llm:
     provider: deepseek
     model: deepseek-chat
   
   research:
     enabled: true
   ```

3. **配置 API Keys**
   - API Keys 仍然可以通过环境变量配置（推荐）
   - 或者在代码中通过 `llm_config.api_key` 设置

4. **测试配置**
   ```python
   from src.config.global_config import get_llm_config
   
   config = get_llm_config()
   print(f"Loaded config: {config.model_dump()}")
   ```

## 最佳实践

1. **敏感信息**: API Keys 应该通过环境变量配置，不要写入配置文件
2. **配置文件**: 通用配置写入 `config/optimized_settings.yaml`
3. **环境变量**: 用于覆盖配置文件中的值，适合不同环境（开发/生产）
4. **独立运行**: 每个 Stage 可以指定自己的配置文件路径

## 故障排查

### 配置未生效

1. 检查配置优先级：环境变量 > 配置文件 > 默认值
2. 确认配置文件路径正确
3. 查看日志中的配置加载信息

### API Key 未找到

1. 检查环境变量是否设置
2. 检查 `llm_config.api_key` 是否有值
3. 确认 provider 名称正确

### Stage 运行失败

1. 检查 Stage 配置是否完整
2. 查看 Stage 日志输出
3. 验证配置文件格式正确（YAML 语法）

## 相关文档

- `README_RESEARCH.md` - Research Stage 详细文档
- `config/optimized_settings.yaml` - 主配置文件
- `src/config/global_config.py` - 全局配置模块源码
