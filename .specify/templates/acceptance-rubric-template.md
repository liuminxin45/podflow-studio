# 验收评分准则（Acceptance Rubric）

## 评分规则

- Hard gates: every `Essential` must be `PASS`; every relevant `Pitfall` must
  be `PASS` as "not triggered".
- 加权分只作参考，不能覆盖硬门禁失败。
- 状态值固定为：`PASS | FAIL | BLOCKED | N/A`。
- Layer weights for actual workflow scoring / 实际流程评分层级权重：
  - L1 功能与需求闭合: 0.30
  - L2 验证与证据: 0.25
  - L3 工作流阶段合规: 0.25
  - L4 交付与仓库状态: 0.10
  - L5 上下文与自动化治理: 0.10
- `workflow_score`、`ai_acceptance_score`、`ui_ux_score` 必须引用具体验证证据，
  例如测试、构建、API/E2E 计划、CDP 截图、日志、运行时事实、
  `.plugin` 包或验收记录。
- 最终 Rubric 评分只在一轮 post-commit self-check 之后输出；plan /
  implement / acceptance 阶段只维护准则定义、证据入口和 hard gates。
- 总分低于 90、任一 hard gate 失败、任一维度低于 80 且无 blocker 或
  owner/user accepted gap 证据时，禁止 complete-branch。

## 评分项

| ID | 层级 | 重要性 | 权重 | 准则 | 所需证据 | 通过条件 | 来源 | 状态 |
|----|-------|------------|--------|-----------|-------------------|----------------|--------|--------|
| R-001 | L1 功能与需求闭合 | Essential | 1.0 |  |  |  |  |  |
| R-002 | L2 验证与证据 | Essential | 1.0 |  |  |  |  |  |
| R-003 | L3 工作流阶段合规 | Essential | 1.0 |  |  |  |  |  |
| R-004 | L4 交付与仓库状态 | Important | 0.7 |  |  |  |  |  |
| R-005 | L5 上下文与自动化治理 | Important | 0.7 |  |  |  |  |  |
| P-001 | Pitfall | Pitfall | 0.9 |  |  | Not triggered |  |  |

## 评审摘要

- Essential 是否全部通过:
- Pitfall 是否均未触发:
- 加权分:
- 阻塞项:
- 下一步:

## 实际流程评分审计（Actual Workflow Rubric Audit）

> Only fill after `speckit-post-commit-self-check` completes. If self-check
> amended the commit, score the final amended state without running another
> self-check.

| 维度 | 权重 | 评分 0-100 | 证据 | 主要风险 / Pitfall |
|-----------|--------|-------------|----------|---------------------|
| L1 功能与需求闭合 | 0.30 |  |  |  |
| L2 验证与证据 | 0.25 |  |  |  |
| L3 工作流阶段合规 | 0.25 |  |  |  |
| L4 交付与仓库状态 | 0.10 |  |  |  |
| L5 上下文与自动化治理 | 0.10 |  |  |  |
| Hard gates | hard gate | PASS / FAIL / BLOCKED |  | AI Self-Acceptance, retrospective, API/E2E, `.plugin`, CDP/runtime, commit message, self-check |

- Overall Weighted Score / 总加权分:
- AI acceptance decision / AI 验收结论:
- Human acceptance readiness / 人工验收准备状态:
- Complete-branch allowed / 是否允许 complete-branch:
- 扣分原因:
- Accepted gap 证据:
