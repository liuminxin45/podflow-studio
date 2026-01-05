# ⚡ 5分钟配置指南

## 步骤 1: 打开配置文件

```bash
# 编辑主配置文件
code config/base/settings.yaml
```

## 步骤 2: 填写必需的 API Keys

### 🔑 必填项（3个）

在 `settings.yaml` 中找到并填写：

```yaml
# 1. LLM API Key (第232行附近)
llm:
  deepseek:
    api_key: "sk-YOUR_DEEPSEEK_KEY_HERE"  # ⚠️ 替换这里

# 2. TTS 认证信息 (第251-253行附近)
tts:
  doubao:
    app_id: "YOUR_APP_ID"        # ⚠️ 替换这里
    access_key: "YOUR_ACCESS_KEY"  # ⚠️ 替换这里
    secret_key: "YOUR_SECRET_KEY"  # ⚠️ 替换这里

# 3. Research API Key (第350行附近)
research:
  anspire:
    api_key: "sk-YOUR_ANSPIRE_KEY_HERE"  # ⚠️ 替换这里
```

## 步骤 3: 运行程序

```bash
python run.py --step all
```

## ✅ 完成！

如果看到以下输出，说明配置成功：

```
✓ 配置加载成功
音频工作流模式: unified
开始执行流程...
```

---

## 🎛️ 可选配置

### 切换音频生成模式

```yaml
audio:
  workflow: "unified"  # 快速模式（推荐）
  # workflow: "segmented"  # 调试模式
```

### 切换频道

```yaml
channel:
  id: "life-consumer"      # 生活消费
  # id: "tech-innovation"  # 技术创新
  # id: "balanced-mix"     # 平衡频道
```

### 调整 TTS 语速

```yaml
tts:
  doubao:
    tts_v3:
      speech_rate: -5  # -10(慢) 到 10(快)
```

---

## 🆘 遇到问题？

### 配置不生效
- 检查 YAML 格式（缩进必须用空格）
- 确保文件已保存
- 重新运行程序

### API Key 错误
- 检查 Key 是否正确复制（无多余空格）
- 确认 Key 有效且有配额

### 更多帮助
- 查看 `README_CONFIG.md` 完整配置说明
- 查看 `docs/CONFIG_MIGRATION_GUIDE.md` 详细文档

---

**配置文件位置**: `config/base/settings.yaml`  
**示例配置**: 文件中已包含所有配置项和注释
