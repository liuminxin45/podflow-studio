# 人工反馈审核模式修复

## 问题描述

**现象**：开启人工反馈后，只有 3 条新闻需要决策，而不是所有候选主题。

**根因**：`@src/topic_selection/feedback/collector.py:81-83` 中的逻辑只审核 `should_publish=True` 的主题。

```python
for candidate in candidates:
    # 只审核通过的主题（优化用户体验）
    if not candidate.get('should_publish', False):
        continue
```

---

## 修复方案

### **1. 添加配置选项**

在 `@config/base/settings.yaml:338` 添加 `review_mode` 配置：

```yaml
human_feedback:
  enabled: true
  storage_dir: "feedback_history"
  auto_continue: true
  timeout_seconds: 0
  min_feedback_threshold: 0
  review_mode: "all"  # 新增：审核模式
```

**配置说明**：
- `"all"`：审核所有候选主题（包括系统拒绝的）
- `"passed_only"`：仅审核系统通过的主题（原始行为）

---

### **2. 修改收集器**

修改 `@src/topic_selection/feedback/collector.py:24-35`：

```python
def __init__(
    self,
    storage_dir: str = "feedback_history",
    auto_continue: bool = True,
    min_feedback_threshold: int = 0,
    review_mode: str = "all",  # 新增参数
):
    self.storage_dir = Path(storage_dir)
    self.storage_dir.mkdir(parents=True, exist_ok=True)
    self.auto_continue = auto_continue
    self.min_feedback_threshold = min_feedback_threshold
    self.review_mode = review_mode  # 保存配置
```

修改审核逻辑 `@src/topic_selection/feedback/collector.py:82-94`：

```python
for candidate in candidates:
    # 根据审核模式决定是否审核此主题
    if self.review_mode == "passed_only":
        # 仅审核通过的主题
        if not candidate.get('should_publish', False):
            continue
    # review_mode == "all" 时审核所有主题
    
    self._review_single_topic(
        candidate=candidate,
        session=session,
        score_breakdown=score_breakdowns.get(candidate['topic_id'])
    )
```

---

### **3. 传递配置参数**

修改 `@src/app/pipelines/steps/selection_step.py:359-366`：

```python
# 创建反馈收集器（传递 review_mode）
review_mode = feedback_cfg.get("review_mode", "all")
collector = FeedbackCollector(
    storage_dir=feedback_cfg.get("storage_dir", "feedback_history"),
    auto_continue=feedback_cfg.get("auto_continue", True),
    min_feedback_threshold=feedback_cfg.get("min_feedback_threshold", 0),
    review_mode=review_mode,  # 传递配置
)
```

---

## 使用方式

### **审核所有主题（推荐）**

```yaml
human_feedback:
  review_mode: "all"
```

运行后将审核**所有候选主题**，包括：
- ✅ 系统通过的主题（should_publish=True）
- ❌ 系统拒绝的主题（should_publish=False）

### **仅审核通过主题**

```yaml
human_feedback:
  review_mode: "passed_only"
```

运行后仅审核系统认为通过的主题（原始行为）。

---

## 效果验证

### **修复前**
```
启动人工反馈收集: report_20260101_132551.json
审核候选主题: 3 个（仅通过的）
```

### **修复后（review_mode: "all"）**
```
启动人工反馈收集: report_20260101_132551.json
审核候选主题: 15 个（所有候选）
```

---

## 优化说明

### **为什么原来只审核通过的主题？**

**设计意图**：减少审核负担，只让用户确认"即将发布"的主题。

**实际问题**：
1. 无法收集"系统误判"的数据（系统拒绝但应该通过的）
2. 优化器无法学习"假阴性"（false negative）案例
3. 无法全面评估系统准确率

### **推荐配置**

- **初期训练**：使用 `review_mode: "all"`，全面收集数据
- **成熟阶段**：使用 `review_mode: "passed_only"`，减少审核负担

---

## 相关文件

| 文件 | 修改内容 |
|------|----------|
| `config/base/settings.yaml` | 添加 `review_mode` 配置 |
| `src/topic_selection/feedback/collector.py` | 添加 `review_mode` 参数和逻辑 |
| `src/app/pipelines/steps/selection_step.py` | 传递 `review_mode` 参数 |

---

## 测试命令

```bash
# 1. 确认配置
cat config/base/settings.yaml | grep -A 6 "human_feedback"

# 2. 运行选题
python run.py --step fetch --date 2026-01-01

# 3. 观察日志
# 应该看到：审核候选主题: N 个（N = all_candidates 数量）
```

---

**修复完成时间**：2026-01-01 15:20
**修复版本**：Phase 2 增强版
