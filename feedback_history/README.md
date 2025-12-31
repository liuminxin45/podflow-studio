# 人工反馈数据目录

此目录用于存储人工反馈数据，支持自动选题策略的持续优化。

## 文件结构

```
feedback_history/
├── README.md                          # 本文件
├── feedback_20251231_210024.json     # 反馈会话数据
├── feedback_20260101_153020.json     # 反馈会话数据
└── optimization_report.md             # 策略优化报告（自动生成）
```

## 反馈数据格式

每个 `feedback_*.json` 文件包含一次反馈会话的完整数据：

```json
{
  "session_id": "session_20251231_210024",
  "timestamp": "2025-12-31T21:00:24",
  "episode_date": "20251231",
  "report_path": "out/runs/.../report_*.json",
  "total_reviewed": 7,
  "agree_count": 5,
  "disagree_count": 2,
  "feedbacks": [
    {
      "feedback_id": "fb_session_20251231_210024_1",
      "topic_id": "topic:xxx",
      "human_decision": "reject",
      "feedback_reason": "话题过于硬核，不适合消费者",
      "tags": ["技术性强", "受众窄"]
    }
  ]
}
```

## 使用方式

### 自动模式（集成到 Pipeline）

在 `config/base/settings.yaml` 中启用：

```yaml
human_feedback:
  enabled: true  # 启用人工反馈
```

运行完整流程：

```bash
python run.py --step all --date 2025-12-31
```

执行流程：
1. Fetch → Cluster → Selection → TopicScoring → TopicGate
2. **【自动暂停】** 启动 CLI 反馈界面
3. 人工审核并提供反馈
4. **【自动继续】** Research → Script → Audio → Publish

### 独立模式（事后补充反馈）

```bash
python tools/feedback_cli.py \
  --report out/runs/20251231/.../report_*.json
```

### 禁用反馈收集

在配置文件中设置：

```yaml
human_feedback:
  enabled: false  # 禁用人工反馈
```

## 数据用途

反馈数据用于：

1. **策略优化**：调整选题阈值和权重
2. **LLM 学习**：生成 Few-shot 示例
3. **效果追踪**：监控系统准确率变化
4. **决策透明**：记录人工判断依据

## 隐私与安全

- 数据仅存储在本地
- 不包含个人身份信息
- 可随时删除历史数据

## 维护建议

- **定期备份**：重要的反馈数据应定期备份
- **定期清理**：超过 6 个月的数据可考虑归档
- **数据质量**：保持反馈的一致性和准确性

## 相关文档

- [设计文档](../docs/human_feedback_system_design.md)
- [策略优化指南](../docs/human_feedback_system_design.md#3-核心设计)
