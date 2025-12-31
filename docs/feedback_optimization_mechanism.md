# 人工反馈优化机制说明

## 概述

人工反馈数据通过**三层优化机制**作用于选题系统，实现持续学习和改进。

---

## 🎯 三层优化机制

### **第 1 层：阈值自适应调整**

**作用对象**：打分系统的通过阈值

**优化原理**：
- 统计人工反馈中 `reject` 的主题的平均分数
- 统计人工反馈中 `accept` 的主题的平均分数
- 调整 `threshold_must_publish` 和 `threshold_maybe_publish`

**示例**：
```
反馈数据分析：
- 人工拒绝的主题平均分: 65.2
- 人工接受的主题平均分: 78.5

优化建议：
threshold_maybe_publish: 55.0 → 68.0  (上调)
threshold_must_publish: 70.0 → 76.0   (上调)

结果：系统会更严格，减少低质量主题通过
```

**生效方式**：
- Phase 2 实现优化器工具：`tools/optimize_strategy.py`
- 运行后生成新配置文件：`config/optimized_settings.yaml`
- 手动或自动应用到 `settings.yaml`

---

### **第 2 层：权重动态优化**

**作用对象**：打分系统的各维度权重

**优化原理**：
- 分析人工 `reject` 的主题在哪些维度得分异常高
- 分析人工 `accept` 的主题在哪些维度得分较低
- 降低误报维度的权重，提高有效维度的权重

**示例**：
```
反馈数据分析：
主题 A (reject): archetype_mean=24.4, personal_impact=6.7
主题 B (reject): archetype_mean=22.1, personal_impact=8.2
主题 C (accept): trend=8.5, persona=7.9

发现：被拒绝的主题 archetype_mean 偏高但不受欢迎

优化建议：
archetype_mean_max: 40.0 → 35.0  (降低权重)
persona_max: 5.0 → 6.5           (提高权重)

结果：系统更重视人群相关性，减少"内容价值高但受众不匹配"的误报
```

**生效方式**：
- 同样通过优化器工具生成新配置
- 调整 `config/base/settings.yaml` 中的 `auto_topic.scoring` 部分

---

### **第 3 层：LLM Few-shot 学习**

**作用对象**：TopicGate 的 LLM 决策提示词

**优化原理**：
- 从反馈数据中提取高质量的"人工示例"
- 将人工决策 + 原因 + 标签组合成 Few-shot 示例
- 注入到 LLM 的 system prompt 中

**示例**：
```
原始 LLM Prompt:
"你是播客选题编辑，评估主题是否值得制作..."

优化后 LLM Prompt:
"你是播客选题编辑，评估主题是否值得制作...

以下是人工审核的示例，供你参考：

【示例 1 - 拒绝】
标题: 创历史新高！今年 11 月中国品牌在欧洲电动车市场拿下近 13% 份额
系统决策: MUST (89.54分)
人工决策: REJECT
原因: 离国内消费者太远，不关心欧洲市场
标签: 受众不匹配

【示例 2 - 拒绝】
标题: 铂智 3X 推出 2026 年购置税限时全免政策
系统决策: MAYBE (72.08分)
人工决策: REJECT
原因: 小众品牌，消费者不关注
标签: 品牌知名度低

请参考这些人工判断标准来评估新主题。"
```

**生效方式**：
- 优化器自动从 `feedback_history/` 读取反馈数据
- 提取不一致的案例（系统 accept 但人工 reject，或反之）
- 生成新的 prompt 模板文件：`prompts/topic_gate_optimized.txt`
- 更新 `src/topic_selection/processing/topic_gate.py` 读取新 prompt

---

## 📊 完整优化流程

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 收集反馈                                                  │
│    用户在 CLI 中标注: reject/accept + 原因 + 标签            │
│    保存到: feedback_history/feedback_*.json                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 积累数据                                                  │
│    至少 20+ 条反馈，覆盖不同类型的主题                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 运行优化器（Phase 2 功能）                                │
│    $ python tools/optimize_strategy.py                       │
│                                                               │
│    优化器做三件事：                                           │
│    a) 分析反馈数据                                            │
│    b) 计算新阈值、新权重                                      │
│    c) 生成 Few-shot 示例                                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 应用优化结果                                              │
│    手动方式:                                                 │
│    - 查看 out/optimization_report.md                         │
│    - 复制建议的配置到 settings.yaml                          │
│                                                               │
│    自动方式（高级）:                                          │
│    - 设置 auto_apply: true                                   │
│    - 优化器直接更新配置                                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 验证效果                                                  │
│    - 运行新一轮选题                                           │
│    - 对比优化前后的通过率和准确率                             │
│    - 继续收集反馈，形成闭环                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 当前状态（Phase 1）

**已实现**：
- ✅ 反馈数据收集
- ✅ 反馈数据存储（JSON 格式）
- ✅ 反馈立即应用到当前选题（过滤 reject 的主题）

**待实现（Phase 2）**：
- ⏳ 阈值优化算法
- ⏳ 权重优化算法
- ⏳ Few-shot 提示生成器
- ⏳ 优化器工具 `tools/optimize_strategy.py`

---

## 💡 反馈数据示例

```json
{
  "session_id": "session_20251231_220507",
  "timestamp": "2025-12-31T22:05:07",
  "episode_date": "20251231",
  "total_reviewed": 10,
  "agree_count": 8,
  "disagree_count": 2,
  "feedbacks": [
    {
      "feedback_id": "fb_session_20251231_220507_1",
      "topic_id": "topic:cb30a2d5f826",
      "topic_snapshot": {
        "title": "创历史新高！今年 11 月中国品牌在欧洲...",
        "topic_score": 89.54
      },
      "system_decision": "must",
      "system_score": 89.54,
      "score_breakdown": {
        "archetype_mean": 24.44,
        "personal_impact": 6.67,
        "counter_intuitive": 3.33,
        "trend": 0.0,
        "time": 5.0,
        "persona": 4.83,
        "history_echo": 0.0,
        "continuity": 6.0,
        "data_enrichable": 6.0,
        "follow_up": 3.0
      },
      "human_decision": "reject",
      "human_priority": 2,
      "feedback_reason": "离国内消费者太远，不关心欧洲市场",
      "tags": ["受众不匹配", "地域性强"],
      "suggested_archetype": null,
      "suggested_score_adjustment": null
    }
  ]
}
```

---

## 🚀 优化器工具设计（Phase 2 预览）

### 命令行接口

```bash
# 基础用法
python tools/optimize_strategy.py

# 指定反馈数据目录
python tools/optimize_strategy.py --feedback-dir feedback_history

# 仅分析，不应用
python tools/optimize_strategy.py --dry-run

# 自动应用优化
python tools/optimize_strategy.py --auto-apply

# 生成详细报告
python tools/optimize_strategy.py --report-file out/optimization_report_20251231.md
```

### 输出示例

```
================================================================================
📊 反馈数据分析
================================================================================

反馈会话数: 3
总反馈条数: 24
不一致案例: 6 (系统 vs 人工)

不一致分布:
- 系统 MUST, 人工 REJECT: 3 条
- 系统 MAYBE, 人工 REJECT: 2 条
- 系统 DISCARD, 人工 ACCEPT: 1 条

================================================================================
🎯 优化建议
================================================================================

【阈值调整】
threshold_maybe_publish: 55.0 → 62.0 (+7.0)
threshold_must_publish: 70.0 → 75.0 (+5.0)

理由: 人工拒绝的主题平均分为 68.5，建议提高阈值

【权重调整】
persona_max: 5.0 → 7.0 (+2.0)
archetype_mean_max: 40.0 → 36.0 (-4.0)

理由: 被拒绝的主题在 persona 维度得分偏低，建议提高权重

【Few-shot 示例】
已生成 4 条人工示例，注入到 LLM prompt

================================================================================
✅ 优化完成
================================================================================

新配置已保存到: config/optimized_settings.yaml
Few-shot prompt 已保存到: prompts/topic_gate_optimized.txt

请执行:
  cp config/optimized_settings.yaml config/base/settings.yaml

然后重新运行选题测试效果。
```

---

## 📝 总结

**当前（Phase 1）**：
- 人工反馈**立即生效**，拒绝的主题直接从本轮选题中过滤
- 反馈数据已保存，为后续优化做准备

**未来（Phase 2）**：
- 反馈数据会**累积学习**，通过优化器调整系统参数
- 系统会**持续改进**，越用越精准

**时间线**：
1. 现在：收集 20-30 条反馈
2. 1-2 周后：实施 Phase 2 优化器
3. 长期：形成自我学习闭环
