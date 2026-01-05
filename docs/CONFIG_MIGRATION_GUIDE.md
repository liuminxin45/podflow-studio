# 配置迁移指南：从 .env 到 settings.yaml

## 概述

本指南帮助您从 `.env` 文件迁移到统一的 `settings.yaml` 配置系统。

## 为什么要迁移？

### 迁移前（.env）
- ❌ 配置分散在多个文件（`.env`, `settings.yaml`）
- ❌ 难以管理和维护
- ❌ 不支持复杂的嵌套结构
- ❌ 注释和文档分离

### 迁移后（settings.yaml）
- ✅ 所有配置集中在一个文件
- ✅ 支持嵌套结构和复杂配置
- ✅ 配置和注释在一起，易于理解
- ✅ 支持版本控制和差异对比
- ✅ 仍然支持环境变量覆盖

## 配置对照表

### LLM 配置

#### .env 格式
```bash
# DeepSeek
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_MODEL=deepseek-chat

# Moonshot
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
MOONSHOT_API_KEY=sk-xxx
MOONSHOT_MODEL=kimi-k2-0905-preview

LLM_PROVIDER=deepseek
```

#### settings.yaml 格式
```yaml
llm:
  provider: "deepseek"  # deepseek | moonshot
  timeout_seconds: 120
  max_tokens: 4000
  temperature: 0.7
  
  deepseek:
    base_url: "https://api.deepseek.com"
    api_key: "sk-xxx"
    model: "deepseek-chat"
  
  moonshot:
    base_url: "https://api.moonshot.cn/v1"
    api_key: "sk-xxx"
    model: "kimi-k2-0905-preview"
```

### TTS 配置

#### .env 格式
```bash
DOUBAO_APP_ID=8434414106
DOUBAO_ACCESS_KEY=xxx
DOUBAO_SECRET_KEY=xxx
DOUBAO_MODE=tts
DOUBAO_TTS_VOICE=zh_female_vv_uranus_bigtts

# TTS V3 配置
DOUBAO_TTS_V3_URL=https://openspeech.bytedance.com/api/v3/tts/unidirectional
DOUBAO_TTS_VERSION=2
DOUBAO_TTS_V3_RESOURCE_ID=seed-tts-2.0
DOUBAO_TTS_V3_SAMPLE_RATE=24000
DOUBAO_TTS_V3_SPEECH_RATE=-5
DOUBAO_TTS_V3_EMOTION_SCALE=4
DOUBAO_TTS_V3_SILENCE_DURATION=800
DOUBAO_TTS_V3_CONTEXT_TEXTS=["请用温和亲切的语气说话"]
```

#### settings.yaml 格式
```yaml
tts:
  provider: "doubao"
  timeout_seconds: 60
  
  doubao:
    app_id: "8434414106"
    access_key: "xxx"
    secret_key: "xxx"
    mode: "tts"  # voiceclone_http | tts | tts_v3_http | tts_v3_ws | podcast
    voice: "zh_female_vv_uranus_bigtts"
    
    tts_v3:
      url: "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
      version: 2
      resource_id: "seed-tts-2.0"
      sample_rate: 24000
      speech_rate: -5
      emotion_scale: 4
      silence_duration: 800
      context_texts: ["请用温和亲切的语气说话"]
```

### Research 配置

#### .env 格式
```bash
RESEARCH_PROVIDER=anspire

# Metaso
METASO_API_KEY=mk-xxx
METASO_MODEL=fast
METASO_MAX_ITEMS=10

# Anspire
ANSPIRE_API_KEY=sk-xxx
ANSPIRE_TOP_K=5
ANSPIRE_IS_STREAM=false
ANSPIRE_TIMEOUT_SECONDS=60
```

#### settings.yaml 格式
```yaml
research:
  provider: "anspire"  # metaso | anspire
  enabled: true
  timeout_seconds: 60
  max_items: 10
  max_retries: 3
  retry_delay: 1.0
  
  metaso:
    api_key: "mk-xxx"
    model: "fast"
    max_items: 10
  
  anspire:
    api_key: "sk-xxx"
    top_k: 5
    is_stream: false
    timeout_seconds: 60
```

## 迁移步骤

### 步骤 1：备份现有配置

```bash
# 备份 .env 文件
cp .env .env.backup

# 备份 settings.yaml
cp config/base/settings.yaml config/base/settings.yaml.backup
```

### 步骤 2：更新 settings.yaml

新的 `settings.yaml` 已经包含了所有 `.env` 中的配置。您只需要：

1. 打开 `config/base/settings.yaml`
2. 找到对应的配置节
3. 更新 API Key 等敏感信息

**重要配置项：**

```yaml
# LLM API Keys
llm:
  deepseek:
    api_key: "YOUR_DEEPSEEK_API_KEY"
  moonshot:
    api_key: "YOUR_MOONSHOT_API_KEY"

# TTS 认证信息
tts:
  doubao:
    app_id: "YOUR_APP_ID"
    access_key: "YOUR_ACCESS_KEY"
    secret_key: "YOUR_SECRET_KEY"

# Research API Keys
research:
  metaso:
    api_key: "YOUR_METASO_API_KEY"
  anspire:
    api_key: "YOUR_ANSPIRE_API_KEY"
```

### 步骤 3：测试配置

```bash
# 测试配置加载
python -c "from src.utils.config_loader import get_config_loader; loader = get_config_loader(); print('✓ 配置加载成功')"

# 运行完整流程
python run.py --step all
```

### 步骤 4：（可选）保留 .env 作为覆盖

如果您希望在某些环境中使用环境变量覆盖配置，可以保留 `.env` 文件。

**优先级：**
```
环境变量 > settings.yaml > 默认值
```

例如：
```bash
# .env 中设置
DEEPSEEK_API_KEY=sk-override-key

# 会覆盖 settings.yaml 中的配置
```

## 配置优先级示例

### 示例 1：使用 settings.yaml

```yaml
# settings.yaml
llm:
  deepseek:
    api_key: "sk-from-yaml"
```

运行结果：使用 `sk-from-yaml`

### 示例 2：环境变量覆盖

```yaml
# settings.yaml
llm:
  deepseek:
    api_key: "sk-from-yaml"
```

```bash
# .env 或环境变量
DEEPSEEK_API_KEY=sk-from-env
```

运行结果：使用 `sk-from-env`（环境变量优先）

## 常见问题

### Q1: 迁移后 .env 文件还需要吗？

**A:** 不需要。所有配置都已集成到 `settings.yaml` 中。但如果您希望在不同环境中使用不同的配置，可以保留 `.env` 文件用于覆盖。

### Q2: 如何在不同环境使用不同配置？

**A:** 有两种方式：

**方式 1：使用不同的 settings.yaml**
```bash
# 开发环境
python run.py --config config/dev/settings.yaml

# 生产环境
python run.py --config config/prod/settings.yaml
```

**方式 2：使用环境变量覆盖**
```bash
# 开发环境
export DEEPSEEK_API_KEY=sk-dev-key
python run.py

# 生产环境
export DEEPSEEK_API_KEY=sk-prod-key
python run.py
```

### Q3: 配置文件中的 API Key 安全吗？

**A:** 建议做法：

1. **开发环境**：可以直接写在 `settings.yaml` 中
2. **生产环境**：使用环境变量或密钥管理服务
3. **版本控制**：将 `settings.yaml` 添加到 `.gitignore`，提供 `settings.yaml.example` 作为模板

```bash
# .gitignore
config/base/settings.yaml

# 提供模板
cp config/base/settings.yaml config/base/settings.yaml.example
# 然后手动替换 API Key 为占位符
```

### Q4: 如何验证配置是否正确？

**A:** 使用配置加载器测试：

```python
from src.utils.config_loader import get_config_loader

loader = get_config_loader()

# 测试 LLM 配置
llm_config = loader.get_llm_config()
print(f"LLM Provider: {llm_config['provider']}")
print(f"API Key: {llm_config.get('api_key', 'NOT SET')[:10]}...")

# 测试 TTS 配置
tts_config = loader.get_tts_config()
print(f"TTS Provider: {tts_config['provider']}")
print(f"Mode: {tts_config['doubao']['mode']}")

# 测试 Research 配置
research_config = loader.get_research_config()
print(f"Research Provider: {research_config['provider']}")
```

### Q5: 旧代码会受影响吗？

**A:** 不会。新的配置加载器会自动将配置设置为环境变量，保持向后兼容。

```python
# 旧代码仍然可以使用
import os
api_key = os.environ.get("DEEPSEEK_API_KEY")  # ✓ 仍然有效
```

## 配置模板

### 最小配置模板

```yaml
# config/base/settings.yaml

llm:
  provider: "deepseek"
  deepseek:
    api_key: "YOUR_API_KEY"
    model: "deepseek-chat"

tts:
  provider: "doubao"
  doubao:
    app_id: "YOUR_APP_ID"
    access_key: "YOUR_ACCESS_KEY"
    secret_key: "YOUR_SECRET_KEY"
    mode: "tts"

research:
  provider: "anspire"
  anspire:
    api_key: "YOUR_API_KEY"
```

### 完整配置模板

参考 `config/base/settings.yaml` 文件，包含所有可配置项和详细注释。

## 迁移检查清单

- [ ] 备份现有 `.env` 和 `settings.yaml`
- [ ] 更新 `settings.yaml` 中的 API Keys
- [ ] 测试配置加载
- [ ] 运行完整流程验证
- [ ] （可选）删除或重命名 `.env` 文件
- [ ] 更新部署脚本（如果有）
- [ ] 更新文档和 README

## 回滚方案

如果迁移后遇到问题，可以快速回滚：

```bash
# 恢复备份
cp .env.backup .env
cp config/base/settings.yaml.backup config/base/settings.yaml

# 重新运行
python run.py
```

## 总结

迁移到 `settings.yaml` 后，您将获得：

1. ✅ **统一配置管理** - 所有配置在一个文件中
2. ✅ **更好的可读性** - YAML 格式支持注释和嵌套
3. ✅ **更强的灵活性** - 支持复杂配置结构
4. ✅ **向后兼容** - 仍然支持环境变量覆盖
5. ✅ **易于维护** - 配置和文档在一起

如有问题，请参考 `src/utils/config_loader.py` 中的实现或提交 Issue。
