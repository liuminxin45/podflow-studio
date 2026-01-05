# Audio Workflow Usage Examples

## 示例场景集合

本文档提供各种实际场景下的配置示例和使用技巧。

## 场景1：日常开发调试

### 需求
- 频繁修改脚本
- 需要快速验证某个段落
- 希望利用缓存节省时间

### 配置

```yaml
audio:
  workflow: segmented
  segmented:
    enable_cache: true
    fail_on_critical: true
    critical_segments: [S0, S1]
```

### 工作流程

1. 首次运行，生成所有5个段落
2. 修改S2段落脚本
3. 再次运行，只重新生成S2，其他使用缓存
4. 快速验证效果

### 预期效果

```
INFO - 音频工作流模式: segmented
INFO - ✓ S0 TTS完成: 使用缓存
INFO - ✓ S1 TTS完成: 使用缓存
INFO - ✓ S2 TTS完成: 5.2秒, 耗时 5234ms
INFO - ✓ S3 TTS完成: 使用缓存
INFO - ✓ S4 TTS完成: 使用缓存
INFO - ✓ 合并完成: 总时长 180.5秒
```

---

## 场景2：生产环境自动化

### 需求
- 每日自动生成播客
- 追求最快速度
- 音频质量要求高
- 成本控制

### 配置

```yaml
audio:
  workflow: unified
  unified:
    enable_cache: true
    transition_text: "\n\n"
    add_pauses: true
    pause_duration_ms: 1000
    merge_strategy: smart
    use_ssml: false
```

### 工作流程

1. 脚本生成完成
2. 自动合并所有段落
3. 一次TTS调用生成完整音频
4. 保存到输出目录

### 预期效果

```
INFO - 音频工作流模式: unified
INFO - 脚本合并完成，总长度: 2345 字符
INFO - ✓ 统一TTS完成: 185.3秒, 耗时 12456ms
INFO - ✓ 音频生成完成 (unified 模式)
```

**性能对比：**
- Segmented: ~45秒
- Unified: ~12秒
- **提升: 73%**

---

## 场景3：快速原型验证

### 需求
- 验证新的脚本模板
- 不需要缓存
- 追求最简配置

### 配置

```yaml
audio:
  workflow: unified
  unified:
    enable_cache: false
    transition_text: "\n\n"
    add_pauses: false
    merge_strategy: simple
```

### 工作流程

1. 修改脚本模板
2. 快速生成音频
3. 验证效果
4. 迭代改进

### 特点

- 配置最简单
- 无缓存开销
- 生成速度快

---

## 场景4：高质量音频制作

### 需求
- 追求最佳音频质量
- 段落间过渡自然
- 不同段落类型有不同停顿

### 配置

```yaml
audio:
  workflow: unified
  unified:
    enable_cache: true
    add_pauses: true
    pause_duration_ms: 1200
    merge_strategy: smart
    use_ssml: true  # 如果TTS支持
```

### 智能合并策略

系统会根据段落类型自动调整：

- **开场 → 历史**: 1000ms停顿
- **历史 → 快讯**: 1200ms停顿
- **快讯 → 深度**: 1000ms停顿
- **深度 → 结尾**: 800ms停顿

### 预期效果

音频听起来像一个连贯的播客节目，而不是5段拼接的音频。

---

## 场景5：A/B测试对比

### 需求
- 对比两种模式的效果
- 评估音频质量差异

### 步骤

#### 第一步：生成 Segmented 版本

```yaml
audio:
  workflow: segmented
```

运行后保存输出：
```bash
cp out/runs/latest/5_render/*.mp3 test_segmented.mp3
```

#### 第二步：生成 Unified 版本

```yaml
audio:
  workflow: unified
```

运行后保存输出：
```bash
cp out/runs/latest/5_render/*.mp3 test_unified.mp3
```

#### 第三步：对比分析

| 维度 | Segmented | Unified |
|------|-----------|---------|
| 生成时间 | 45秒 | 12秒 |
| 音频连贯性 | 中等 | 优秀 |
| 段落间接缝 | 可察觉 | 无 |
| 语音自然度 | 良好 | 优秀 |

---

## 场景6：批量生成历史播客

### 需求
- 批量生成过去30天的播客
- 追求速度
- 统一质量标准

### 配置

```yaml
audio:
  workflow: unified
  unified:
    enable_cache: true
    merge_strategy: simple
```

### 脚本示例

```python
# scripts/batch_generate.py
import subprocess
from datetime import datetime, timedelta

# 生成过去30天
for i in range(30):
    date = datetime.now() - timedelta(days=i)
    date_str = date.strftime("%Y-%m-%d")
    
    print(f"生成 {date_str} 的播客...")
    subprocess.run([
        "python", "run.py",
        "--date", date_str,
        "--config", "config/base/settings.yaml"
    ])
```

### 预期效果

- 每个播客约12秒生成
- 30个播客约6分钟完成
- 如果使用Segmented模式需要约22分钟

---

## 场景7：错误恢复

### 场景：Unified 模式失败

**错误信息：**
```
ERROR - ✗ 统一TTS失败: text too long
```

**解决方案：** 自动回退到 Segmented

```yaml
audio:
  workflow: segmented  # 临时回退
```

或者在代码中已自动处理：

```python
try:
    workflow = WorkflowFactory.create_workflow("unified", ...)
except Exception as e:
    logger.warning("Unified模式失败，回退到Segmented")
    workflow = WorkflowFactory.create_workflow("segmented", ...)
```

---

## 场景8：自定义停顿时长

### 需求
- 不同段落类型需要不同停顿
- 开场后需要更长停顿
- 快讯之间需要短停顿

### 配置

```yaml
audio:
  workflow: unified
  unified:
    merge_strategy: smart
    # 默认停顿
    pause_duration_ms: 800
```

### 自定义代码（高级）

如需更精细控制，可修改 `script_merger.py`：

```python
def _get_transition(self, current, next_seg):
    transitions = {
        ("OPENING", "HISTORY"): 1500,      # 开场→历史: 1.5秒
        ("HISTORY", "DETAIL_NEWS"): 1200,  # 历史→快讯: 1.2秒
        ("DETAIL_NEWS", "DEEP_DIVE"): 1000,# 快讯→深度: 1秒
        ("DEEP_DIVE", "CLOSING"): 800,     # 深度→结尾: 0.8秒
    }
    
    key = (current.type, next_seg.type)
    duration = transitions.get(key, 800)
    return self._create_pause_mark(duration)
```

---

## 场景9：缓存管理

### 查看缓存

```bash
# Segmented 模式缓存
ls -lh out/runs/*/4_tts/segments/

# Unified 模式缓存
ls -lh out/runs/*/4_tts/unified/
```

### 清理缓存

```bash
# 清理所有缓存
rm -rf out/runs/*/4_tts/

# 只清理 Segmented 缓存
rm -rf out/runs/*/4_tts/segments/

# 只清理 Unified 缓存
rm -rf out/runs/*/4_tts/unified/
```

### 缓存策略

**Segmented 模式：**
- 缓存键：段落ID (S0, S1, S2, S3, S4)
- 缓存位置：`4_tts/segments/S0.mp3`
- 失效条件：段落文本修改

**Unified 模式：**
- 缓存键：所有段落文本的MD5哈希
- 缓存位置：`4_tts/unified/{hash}.mp3`
- 失效条件：任何段落文本修改

---

## 场景10：性能监控

### 添加性能日志

在 `settings.yaml` 中启用详细日志：

```yaml
logging:
  verbose: true
  console_level: DEBUG
```

### 监控指标

运行后查看日志：

```
DEBUG - TTS API调用: synthesize_unified, 字符数: 2345
INFO - ✓ 统一TTS完成: 185.3秒, 耗时 12456ms
INFO - 音频生成完成: 总时长 185.3秒
```

### 性能分析

| 指标 | 值 | 说明 |
|------|-----|------|
| 字符数 | 2345 | 输入文本长度 |
| 音频时长 | 185.3秒 | 生成的音频长度 |
| 生成耗时 | 12.5秒 | TTS API调用时间 |
| 速度比 | 14.8x | 音频时长/生成耗时 |

---

## 配置模板

### 开发环境模板

```yaml
# config/dev.yaml
audio:
  workflow: segmented
  segmented:
    enable_cache: true
    fail_on_critical: true
```

### 生产环境模板

```yaml
# config/prod.yaml
audio:
  workflow: unified
  unified:
    enable_cache: true
    merge_strategy: smart
    pause_duration_ms: 1000
```

### 测试环境模板

```yaml
# config/test.yaml
audio:
  workflow: unified
  unified:
    enable_cache: false
    merge_strategy: simple
```

---

## 常见问题

### Q1: 如何知道当前使用的是哪种模式？

**A:** 查看日志输出：
```
INFO - 音频工作流模式: segmented
```

### Q2: 可以在运行时切换模式吗？

**A:** 可以，修改配置文件后重新运行即可，无需重启服务。

### Q3: 两种模式可以共存吗？

**A:** 可以，它们的缓存是独立的，互不影响。

### Q4: 如何选择合适的模式？

**A:** 
- 开发调试 → Segmented
- 生产环境 → Unified
- 快速验证 → Unified + Simple

### Q5: Unified 模式支持BGM吗？

**A:** 当前版本不支持，BGM功能仅在 Segmented 模式下可用。未来版本会支持。

---

## 总结

通过这些示例，您应该能够：

1. ✅ 理解两种模式的适用场景
2. ✅ 根据需求选择合适的配置
3. ✅ 优化音频生成性能
4. ✅ 处理常见问题

**建议工作流：**
1. 开发阶段使用 Segmented 模式
2. 测试验证后切换到 Unified 模式
3. 根据实际效果微调参数
4. 生产环境使用优化后的配置

祝您使用愉快！
