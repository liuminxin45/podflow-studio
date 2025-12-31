# 人工反馈系统 - 快速开始

## 概述

人工反馈系统允许你在自动选题完成后，对结果进行审核并提供反馈。系统会学习你的偏好，不断优化选题策略。

## 核心特性

✅ **无缝集成**：自动插入到 Pipeline，选题后暂停等待反馈  
✅ **可开关**：配置文件控制，随时启用/禁用  
✅ **友好界面**：Rich CLI，彩色显示，交互简单  
✅ **数据驱动**：基于反馈优化阈值、权重、提示  

---

## 快速开始（3 步）

### Step 1: 启用人工反馈

编辑 `config/base/settings.yaml`：

```yaml
human_feedback:
  enabled: true  # 改为 true
```

### Step 2: 运行完整流程

```bash
python run.py --step all --date 2025-12-31
```

### Step 3: 审核选题

Pipeline 执行到选题阶段后，会自动暂停并显示：

```
================================================================================
🎯 选题审核 - 人工反馈收集
================================================================================

📋 报告: report_20251231_210024.json
📊 统计:
   - 候选主题数: 43
   - 通过打分: 7
   - 通过门控: 7

💡 提示: 仅审核通过的主题，按 Ctrl+C 可随时退出

👤 审核人 [default]: 
```

**操作说明**：
1. 输入你的名字（或直接回车使用 "default"）
2. 逐个审核主题：
   - 看到不满意的主题，输入 `y` 给出反馈
   - 满意的主题，输入 `n` 跳过
3. 完成后，Pipeline 自动继续

---

## 反馈示例

### 场景 1：系统选了不该选的主题

```
────────────────────────────────────────────────────────────────────────────────
主题 3
📰 标题: 奇景、友达将在 CES 2026 展示联研 LCoS 微显示器解决方案
🏷️  实体: 奇景, 友达, LCoS, CES 2026
📊 新闻数: 1
🤖 系统决策: MAYBE
📈 系统打分: 65.24/100

💭 是否需要给出反馈? [y/N]: y
你的决策 (accept/reject/uncertain) [accept]: reject
💬 反馈原因（为什么不同意系统？留空跳过）: 太硬核，普通消费者不关心
🏷️  标签（逗号分隔，留空跳过）: 技术性强, 受众窄
⭐ 优先级（1-5） [3]: 2
[yellow]⚠ 反馈已记录（不同意系统）[/yellow]
```

### 场景 2：系统漏掉了好主题

如果你发现系统漏掉了一个重要主题（在报告的 `all_candidates` 中但 `should_publish=false`），可以事后用独立模式补充反馈：

```bash
python tools/feedback_cli.py \
  --report out/runs/20251231/.../report_*.json
```

---

## 配置选项

### 完整配置

```yaml
human_feedback:
  enabled: true                      # 是否启用（默认：true）
  storage_dir: "feedback_history"   # 存储目录
  auto_continue: true                # 反馈后自动继续（默认：true）
  timeout_seconds: 300               # 超时时间（秒，0=无限）
  min_feedback_threshold: 0          # 最少反馈数（0=可跳过）
```

### 常见配置

**配置 1：全自动，无人工干预**
```yaml
human_feedback:
  enabled: false
```

**配置 2：反馈后不自动继续**
```yaml
human_feedback:
  enabled: true
  auto_continue: false  # 反馈完成后终止，需手动继续
```

**配置 3：快速模式（跳过所有主题）**
```yaml
human_feedback:
  enabled: true
  min_feedback_threshold: 0  # 允许不提供任何反馈
```

按 Ctrl+C 即可快速退出。

---

## 查看反馈数据

反馈数据保存在 `feedback_history/` 目录：

```bash
# 查看最新反馈
cat feedback_history/feedback_session_20251231_210024.json

# 统计反馈数量
ls feedback_history/feedback_*.json | wc -l
```

---

## 效果验证

收集 20+ 条反馈后，运行策略优化器（Phase 2 功能，待实现）：

```bash
python tools/optimize_strategy.py
```

优化器会：
1. 分析反馈数据
2. 调整阈值和权重
3. 生成优化报告
4. 输出新配置文件

---

## 故障排查

### 问题 1：反馈界面没有出现

**原因**：`human_feedback.enabled` 未启用或 `auto_topic.enabled` 未启用  
**解决**：检查配置文件，确保两者都为 `true`

### 问题 2：按 Ctrl+C 后流程中断

**原因**：正常行为，Ctrl+C 会保存当前进度并退出  
**解决**：如果需要继续，重新运行 `python run.py --step research ...`

### 问题 3：反馈数据没有保存

**原因**：`feedback_history/` 目录权限问题  
**解决**：手动创建目录 `mkdir feedback_history`

---

## 下一步

- 📖 阅读[完整设计文档](human_feedback_system_design.md)
- 🔧 实施 Phase 2：策略优化器
- 📊 实施 Phase 4：Web 审核界面

---

**反馈与建议**：如有问题或建议，请在项目中提 Issue。
