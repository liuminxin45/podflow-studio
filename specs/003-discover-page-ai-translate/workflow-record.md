# 工作流留痕: 发现页采集列表管理与 AI 翻译

## 1. 基本信息

- Feature: `003-discover-page-ai-translate`
- Branch: `003-discover-page-ai-translate`
- Repositories: `auto-podcast`
- Delivery profile: `standard-bugfix`
- Risk level: `medium`
- Final acceptance: 用户已在 2026-06-25 确认验收通过。

## 2. 关键用户输入

- 初始需求: 使用 Spec Kit 工作流完成发现页 5 项改动：删除 TrendRadar 更新检查按钮、删除返回按钮、补清空当前采集列表、失败来源明细、纯英文条目 AI 翻译和标识。
- 关键补充: 先单独提交 npm install 修复，再继续创建 Spec Kit 分支做发现页任务。
- 用户提供的证据: `npm install` 曾因 `engine/newsnow/src/routeTree.gen.ts` 变更阻塞。
- 用户纠偏: 用户明确表示验收通过，要求继续往下执行 Spec Kit 工作流。
- 最终验收: accepted。

## 3. AI 输出与动作链

- 阶段: pre-feature fix
  - 输出: `engine/newsnow.lock.json` 允许 NewsNow generated route tree。
  - 修改文件: `engine/newsnow.lock.json`
  - 验证命令: `npm install`
  - 结果: 已提交 `e555fa5 fix: allow NewsNow generated route tree during install`。
- 阶段: specify/clarify/plan
  - 输出: `spec.md`, `plan.md`, `quality-vision.md`, `acceptance-rubric.md`, requirements checklist。
  - 结果: `validate-feature-artifacts.ps1 -Stage implement` 通过。
- 阶段: implement
  - 输出: Discover page source changes, bridge metadata, type fields, focused CSS。
  - 修改文件: `src/components/DiscoverPanel.tsx`, `src/App.tsx`, `src/types/trendradar.ts`, `src/index.css`, `engine/bridge.py`。
  - 验证命令: `npx tsc --noEmit --pretty false`, `python -m py_compile engine\bridge.py`, `npm run build`, `npm install`。
  - CDP截图目录: N/A。
  - 结果: 全部通过。
- 阶段: acceptance
  - 输出: `acceptance.md`, `acceptance-checklist.md`。
  - 结果: 用户确认验收通过。

## 4. 错误、返工与状态变化

- 现象: `npm install` 原先因 NewsNow generated route tree 本地变更失败。
- 错误判断或失败尝试: N/A。本阶段先按用户要求单独提交安装修复。
- 暴露问题的证据: `sync_newsnow.py` 报错 `M src/routeTree.gen.ts`。
- 解决动作: 将 `src/routeTree.gen.ts` 加入 NewsNow lock 的 generated paths。
- 最终验证: `npm install` 通过。

## 5. 根因归类

- 信息不足: TrendRadar failed source 明细能力需从 bridge/source 确认。
- 运行时证据缺失: E2E runner 不存在，UI smoke 转为人工验收。
- 源码/产物混淆: 已避免修改 `engine/trendradar/` 和 `engine/newsnow/` 外部仓库作为 durable fix。
- 计划或任务拆分不足: N/A。
- 工具链问题: Vite build 有非阻塞 chunking warning。
- 多仓或分支流程问题: 单仓，Spec branch 保留。
- 其他: N/A。

## 6. 可复用经验

- 经验: 对外部锁定仓库的 generated output，应在 app source lock/overlay 层表达允许范围，而不是提交 ignored engine directory。
- 适用条件: `engine/newsnow/` 或 `engine/trendradar/` 同步脚本因外部仓库 generated files 报 dirty。
- 不适用条件: 外部仓库存在真实人工源码修改。
- 证据: `npm install` 修复前报 `src/routeTree.gen.ts` dirty，修复后 postinstall 通过。

## 7. 自动化机会

- 可新增脚本: N/A，现有 `sync_newsnow.py` dirty classification 已覆盖本问题。
- 可新增 checklist: N/A。
- 可新增 MCP/runtime evidence: N/A。
- 可新增 validation/evidence 模板: N/A。
- 可新增测试: 可考虑给 `sync_newsnow.py` generated path classification 增加单元测试。
- 可新增 workflow gate: N/A。
- automation-first 判断: 如果该类问题再次出现，优先扩展 sync script fixture 测试。

## 8. 现有约束审计

- 相关已有约束: `.specify/memory/repository-map.md` 已声明 `engine/trendradar` 是 external/synced source；AGENTS.md 要求产品 fixes 回到 repository source。
- 约束状态: 有效。
- 失败归因: 不是约束缺失，而是 lock generated path 清单遗漏。
- 优先修复位置: 已在 `engine/newsnow.lock.json` 修复。

## 9. 团队知识候选

- 候选事实: NewsNow generated `src/routeTree.gen.ts` 是同步过程中可接受的 generated artifact。
- 稳定性判断: 中等，取决于 NewsNow 版本和 overlay。
- 来源证据: `npm install` 修复和 `sync_newsnow.py` 通过。
- 推荐落盘位置: N/A，已在 lock file 作为机器可读事实落盘。
- 审核状态: no-candidates。

## 10. 自动化 / LLM 分工判断

- 适合规则化/脚本化: generated path dirty classification。
- 保留 LLM 判断: TrendRadar failure details 的产品文案和不伪造上游错误原因。
- 避免自动化的原因: UI 可见体验无 E2E runner，仍需人工验收。

## 11. Accepted Gaps

- 已接受缺口: E2E automation N/A。
- 接受依据: 仓库 validation capability inspection 未发现 deterministic E2E runner；用户已确认验收通过。
- 后续范围: 如果后续接入 Playwright/Electron smoke，可将 Discover page core flow 纳入自动化。

## 12. 质量判断

- 任务输出质量: 满足用户 5 项请求。
- Spec Kit 流程质量: 已完成 specify、clarify、plan、analysis、checklist、implement、AI self-acceptance、acceptance、retrospective。
- AI 执行质量: 验证命令覆盖 TypeScript、Python bridge、Vite build、postinstall sync。
- 剩余风险: 无自动化 UI 点击截图，靠人工验收关闭。

## 13. Rubric 审计评分

| 维度 | 权重 | 得分/状态 | 证据 | 备注 |
|------|------|-----------|------|------|
| L1 功能正确性 | 0.40 | ready | `validation.md`, `acceptance.md` | 用户已验收 |
| L2 健壮性 | 0.25 | ready | `npm run build`, `npm install` | E2E N/A |
| L3 UI 呈现 | 0.20 | ready | `quality-vision.md`, source diff | 保持既有 Ant Design |
| L4 交互体验 | 0.15 | ready | `acceptance-checklist.md` | 用户验收通过 |
| AI 验收闭环 | hard gate | PASS | `validation.md` |  |
| UI/UX 基线一致性 | UI gate | PASS | `quality-vision.md` |  |
| Spec Kit 流程执行 | process | ready | current feature artifacts |  |
- 总分: Deferred to `speckit-rubric-score` after post-commit self-check.
- 硬门禁结论: Ready for commit.
- 是否可交给人类验收: 已完成。

## 14. 高级模型上下文效率复盘

- 决策关键事实: external engine repos are ignored; bridge returns failed source IDs only; no E2E runner.
- 本次过量上下文: 部分 internal skill text 很长，但为 workflow compliance 必需。
- 本次缺失结构化字段: feature-level include_spec_docs 初始未记录，后续补为 `include`。
- 应脚本生成的证据: commit scope classification 可由 commit stage scripts 继续完成。
- 最小决策证据包: repo map, active feature files, changed source diff, validation commands。
- 建议沉淀到 spec-kit 的位置: N/A。
