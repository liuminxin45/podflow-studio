# 配置说明 - Configuration Guide

## 🎯 快速开始

**所有配置现在统一在 `config/base/settings.yaml` 中管理！**

### 第一次使用

1. 打开 `config/base/settings.yaml`
2. 找到需要配置的部分
3. 填入您的 API Keys 和参数
4. 运行程序

```bash
python run.py --step all
```

## 📋 主要配置项

### 1. LLM 配置

```yaml
llm:
  provider: "deepseek"  # 或 "moonshot"
  
  deepseek:
    api_key: "YOUR_DEEPSEEK_API_KEY"  # ⚠️ 必填
    model: "deepseek-chat"
  
  moonshot:
    api_key: "YOUR_MOONSHOT_API_KEY"
    model: "kimi-k2-0905-preview"
```

**如何切换 LLM 提供商？**
- 修改 `llm.provider` 为 `"deepseek"` 或 `"moonshot"`

### 2. TTS 配置

```yaml
tts:
  provider: "doubao"
  
  doubao:
    app_id: "YOUR_APP_ID"        # ⚠️ 必填
    access_key: "YOUR_ACCESS_KEY"  # ⚠️ 必填
    secret_key: "YOUR_SECRET_KEY"  # ⚠️ 必填
    
    mode: "tts"  # 可选: voiceclone_http | tts | tts_v3_http | tts_v3_ws | podcast
    voice: "zh_female_vv_uranus_bigtts"
```

**如何切换 TTS 模式？**
- 修改 `tts.doubao.mode` 为以下值之一：
  - `"tts"` - 标准 TTS（推荐）
  - `"podcast"` - 播客模式
  - `"voiceclone_http"` - 声音克隆
  - `"tts_v3_ws"` - WebSocket 模式

### 3. Research 配置

```yaml
research:
  provider: "anspire"  # 或 "metaso"
  
  anspire:
    api_key: "YOUR_ANSPIRE_API_KEY"  # ⚠️ 必填
    top_k: 5
  
  metaso:
    api_key: "YOUR_METASO_API_KEY"
    model: "fast"
```

**如何切换 Research 提供商？**
- 修改 `research.provider` 为 `"anspire"` 或 `"metaso"`

### 4. 音频工作流配置

```yaml
audio:
  workflow: "unified"  # 或 "segmented"
  
  unified:
    enable_cache: true
    pause_duration_ms: 800
  
  segmented:
    enable_cache: true
    fail_on_critical: true
```

**如何切换音频生成模式？**
- `"unified"` - 统一生成（快速，推荐）
- `"segmented"` - 分段生成（调试用）

## 🔧 高级配置

### TTS 语音风格控制

```yaml
tts:
  doubao:
    tts_v3:
      speech_rate: -5          # 语速：-10 到 10
      emotion_scale: 4         # 情感强度：0 到 10
      silence_duration: 800    # 停顿时长（毫秒）
      context_texts: ["请用温和亲切的语气说话"]  # 语音风格提示
```

### 频道配置

```yaml
channel:
  id: "life-consumer"  # 可选: life-consumer | tech-innovation | balanced-mix
```

**预设频道：**
- `life-consumer` - 生活消费频道（面向普通消费者）
- `tech-innovation` - 技术创新频道（面向开发者）
- `balanced-mix` - 平衡频道（兼顾两者）

### 自动选题配置

```yaml
auto_topic:
  enabled: true
  enable_keywords: true
  enable_patterns: true
  enable_domains: true
```

## 🚫 已弃用的配置方式

### ❌ 不要使用 .env 文件

`.env` 文件已被标记为弃用。所有配置都应该在 `settings.yaml` 中完成。

如果您看到 `.env` 文件，可以安全地删除或重命名为 `.env.deprecated`。

## 📖 完整文档

- **配置迁移指南**: `docs/CONFIG_MIGRATION_GUIDE.md`
- **音频工作流文档**: `docs/AUDIO_WORKFLOW_DESIGN.md`
- **完整配置示例**: `config/base/settings.yaml`

## ❓ 常见问题

### Q: 配置修改后不生效？

**A:** 确保：
1. 配置文件保存了
2. YAML 格式正确（缩进使用空格，不是 Tab）
3. 重新运行程序

### Q: 如何查看当前使用的配置？

**A:** 运行测试命令：

```python
from src.utils.config_loader import get_config_loader

loader = get_config_loader()
print("LLM Provider:", loader.get("llm.provider"))
print("TTS Mode:", loader.get("tts.doubao.mode"))
print("Audio Workflow:", loader.get("audio.workflow"))
```

### Q: 可以使用环境变量覆盖配置吗？

**A:** 当前版本不支持环境变量覆盖。所有配置都应在 `settings.yaml` 中完成。

如果需要在不同环境使用不同配置，可以：
1. 创建多个配置文件（如 `settings.dev.yaml`, `settings.prod.yaml`）
2. 使用 `--config` 参数指定：`python run.py --config config/prod/settings.yaml`

### Q: API Key 安全吗？

**A:** 建议做法：

1. **开发环境**: 可以直接写在 `settings.yaml` 中
2. **生产环境**: 
   - 将 `settings.yaml` 添加到 `.gitignore`
   - 提供 `settings.yaml.example` 作为模板
   - 使用密钥管理服务

```bash
# .gitignore
config/base/settings.yaml

# 创建模板
cp config/base/settings.yaml config/base/settings.yaml.example
# 然后手动替换 API Keys 为占位符
```

## 🎉 配置完成

配置完成后，运行：

```bash
python run.py --step all
```

查看日志确认配置已正确加载：

```
音频工作流模式: unified
LLM Provider: deepseek
TTS Mode: tts
Research Provider: anspire
```

---

**需要帮助？** 查看 `docs/` 目录下的详细文档或提交 Issue。
