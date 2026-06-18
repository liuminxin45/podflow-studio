# 任务清单: [CAPABILITY NAME]

> 语言规范：`tasks.md` 面向开发人员和 AI Agent 共同执行，使用中文为主。
> 文件路径、模块名、类名、函数名、API、字段名、枚举值、状态值、命令、
> 测试名、任务编号和 `[P]` / `[CSx]` 标签必须保留英文原文。

**输入**: `spec.md`, `plan.md`, and available design artifacts from
`specs/[feature-name]/`
**前置条件**: `plan.md` 足够明确，可以识别影响模块和验证预期
**辅助产物**: `review.md` 面向人类快速导航；`progress.md` 面向 AI 连续工作恢复；
`lessons.md` 记录本 feature 的项目坑候选。

## L3 Artifact Contract

- **Layer**: L3 Executable Task Slices
- **Purpose**: convert L1/L2 decisions into executable work units with bounded
  write scope, validation, progress tracking, and stop conditions.
- **Required sections**: `人类审核摘要`, `格式`, `Phase 1`, `Phase 2`,
  `Implementation Slices`, scenario phases, final delivery phase, dependencies,
  parallelization notes, and automation/LLM boundary.
- **Slice requirements**: every slice must state target, linked tasks, allowed
  write scope, forbidden scope, validation command or manual check, search
  scope, stop conditions, and `progress.md` update expectations.
- **Structured state**: update `workflow-state.json` and `progress.md` during
  implementation; do not rely on chat history as the only state store.

## 人类审核摘要

> 该区是给人类 reviewer 的快速入口；不得替代或删减后续 AI/流程读取区。
> AI Agent 必须继续读取完整任务列表、依赖说明、并行说明、验证缺口和分支闭环任务后再执行。

- **执行目标**: [本任务清单完成后交付什么]
- **优先阅读**: [最需要人工先看的任务 ID、阶段、风险或确认项]
- **剩余/阻塞任务**: [未完成任务、阻塞原因、需要 owner 确认的操作；无则写 N/A]
- **验证入口**: [最终必须运行或人工检查的最短命令/步骤]
- **测试用例闭环**: [每个场景对应的 test-case update 摘要或 N/A 原因]
- **分支/仓库状态**: [local spec branch、dirty state、commit/cherry-pick completion 是否需要确认；默认保留 spec branch、不 push]
- **AI 执行注意**: [不得跳过的边界、顺序或读取要求]
- **必需人工决策**: [owner-approved gap、外部验证、验收、commit/cherry-pick completion；无则写 N/A]

## 格式: `[ID] [P?] [Scenario?] Description`

- **[P]**: 可以并行执行，且不会修改相同文件或相互依赖的 contracts。
- **[Scenario]**: 能力场景标签，例如 `[CS1]`。
- 任务描述必须点名文件、模块、产物或验证目标。
- 推荐写验证命令；没有命令时必须写清验证说明。
- 验证通过后，每个已实现行为都应补充 unit test、regression test、
  fixture、contract test、smoke case，或写明 explicit N/A reason。
- Bugfix 任务不得在根因证据不足时提前写死具体补丁。先写 repro、
  failing regression、证据补全或 bounded investigation。

## Phase 1: 上下文与边界

**目的**: 实现前确认范围。

- [ ] T001 审核 `spec.md`、`plan.md`、constitution principles，以及附近既有代码模式。
- [ ] T002 确认精确影响文件/模块，并确认不需要无关清理。
- [ ] T003 审核 `contracts/` 或 `plan.md` 中列出的兼容性边界。
- [ ] T003A 审核 `plan.md` 的 `测试用例计划`，确认 API/E2E/interface/regression/
  fixture/smoke 行已获 `approved-by-ai-obvious`、人工确认，或有 explicit N/A reason。
- [ ] T003B 如涉及 UI/UX/copy/parity，审核 `quality-vision.md`，确认 quality tier
  和 UI baseline 已 ready 或 owner-approved `N/A`。
- [ ] T003C 审核 `acceptance-rubric.md`，确认 Essential/Pitfall 条目可独立评判，
  且 `plan.md` 已写明 `speckit-ai-self-acceptance` 的 PASS/FAIL/BLOCKED 契约。
- [ ] T004 如涉及 UI 状态、UI interaction、操作权限或 operation availability，确认 `ServiceBridge` 仅做 API 转发；
  非 UI 专属的 runtime/permission/capability 事实来自 `CoreRuntime`；仅用于 UI 展示的
  结构、顺序、visible/enabled 组织和交互入口编排位于 frontend plugin。
- [ ] T005 如为 Qt UI interaction 或 operation availability 迁移，先审核 `intake.md` / `spec.md` /
  `plan.md` 中的 Qt 源行为覆盖清单，确认设备类型、设备状态、UI element/action 顺序、
  visible/enabled 规则、action handler 和目标契约来源已覆盖；缺失时暂停实现并回到
  上阶段补齐。
- [ ] T006 如涉及设备身份、状态、API/RPC 或 operation availability，审核 Identity / State /
  API Boundary：跨层设备身份只用 UUID decimal string，Biz 不缓存状态或实现业务逻辑，
  SDK native id/handle 不出底层，事件只触发刷新，旧 API/调试 API/构建产物不污染生产合同。

## Phase 2: 共享准备

**目的**: 准备多个场景共用的基础支撑。

- [ ] T007 [P] 如需要，在 [path] 准备共享 test、smoke、fixture 或 script scaffolding。
- [ ] T008 [P] 如 plan 要求，在 [path] 更新共享 type、DTO、interface 或 template definitions。
- [ ] T009 如需要新增/扩展接口层或数据层，先搜索既有目录和相邻模块；若无合适承载点，
  新增职责清晰的 header/source/module 文件，避免把 contract、DTO、cache adapter、
  permission/availability model 和 UI adapter 堆进单个文件。

## Implementation Slices

> slice 是 `speckit.implement` 的连续工作单位。每个 slice 应足够小，能在一次
> 实现-验证-记录循环内完成；AI Agent 必须按 slice loop 更新 `progress.md`。

### Slice S1 - [Name]

- **目标**: [本 slice 结束后可独立验证的最小结果；bugfix 优先为复现/失败测试/证据闭环]
- **关联任务**: [T010, T011, ...]
- **允许写入范围**: [允许修改的文件/目录/模块]
- **禁止范围**: [不得修改的文件、仓库、行为、API 或生成产物]
- **验证命令**: [build/test/smoke/manual review command；无命令时写清人工检查步骤]
- **搜索范围**: [affected repo + known dirs/symbols；不得默认搜索 workspace_root]
- **停止条件**: [验证失败、缺源行为、root-cause evidence 不成立、counterexample 命中、
  scope 扩大、真实设备/权限/状态风险未覆盖、遇到 owner-approved gap、跨越禁止范围等]
- **progress.md 更新**: [记录当前 slice、变更文件、验证结果、剩余风险]

### Slice S2 - [Name]

- **目标**: [本 slice 结束后可独立验证的最小结果]
- **关联任务**: [T018, T019, ...]
- **允许写入范围**: [允许修改的文件/目录/模块]
- **禁止范围**: [不得修改的文件、仓库、行为、API 或生成产物]
- **验证命令**: [build/test/smoke/manual review command；无命令时写清人工检查步骤]
- **搜索范围**: [affected repo + known dirs/symbols；不得默认搜索 workspace_root]
- **停止条件**: [验证失败、缺源行为、root-cause evidence 不成立、counterexample 命中、
  scope 扩大、真实设备/权限/状态风险未覆盖、遇到 owner-approved gap、跨越禁止范围等]
- **progress.md 更新**: [记录当前 slice、变更文件、验证结果、剩余风险]

## Phase 3: 能力场景 1 - [Title] (Priority: P1)

**目标**: [CS1 交付什么]

**独立验证**: [CS1 如何检查]

### 实现

- [ ] T010 [CS1] 更新 [module/path] 以提供 [behavior]。
- [ ] T011 [CS1] 更新 [contract/path] 以保留或暴露 [interface]。
- [ ] T012 [CS1] 如涉及 UI interaction 或 operation availability，在 `CoreRuntime` 侧提供 runtime/permission/capability
  事实契约，在 `ServiceBridge` 侧只提供转发接口，在 frontend plugin 侧实现 UI 展示
  结构、顺序、visible/enabled 和 action 入口编排。
- [ ] T013 [CS1] 如涉及设备操作，在 [path] 确认只使用 UUID decimal string 作为跨层身份；
  前端业务操作只读 `node.uuid`，不使用 `node.id`、`entityId`、`metadata.uuid` 兜底。
- [ ] T014 [CS1] 在 [path] 处理 error、fallback、runtime state 或 compatibility case。

### 验证

- [ ] T015 [CS1] 执行 [build/test/smoke/manual/device check]，并记录结果或 known gap。
- [ ] T016 [CS1] 新增或更新 [unit/regression/fixture/contract/smoke case] 以固化已验证行为；若无法自动化，记录原因。
- [ ] T017 [CS1] 测试用例更新后重新运行受影响测试，或执行替代验证并记录结果。

## Phase 4: 能力场景 2 - [Title] (Priority: P2)

**目标**: [CS2 交付什么]

**独立验证**: [CS2 如何检查]

### 实现

- [ ] T018 [CS2] 更新 [module/path] 以提供 [behavior]。
- [ ] T019 [CS2] 更新 [path] 中的 downstream 或 UI/plugin integration。

### 验证

- [ ] T020 [CS2] 执行 [build/test/smoke/manual/device check]，并记录结果或 known gap。
- [ ] T021 [CS2] 新增或更新 [unit/regression/fixture/contract/smoke case] 以固化已验证行为；若无法自动化，记录原因。
- [ ] T022 [CS2] 测试用例更新后重新运行受影响测试，或执行替代验证并记录结果。

## Phase N: 横切事项与交付

- [ ] TXXX 如相关，审核 encoding/localization boundaries。
- [ ] TXXX 如相关，审核 real-device、virtual-device、cache、handle、permission behavior。
- [ ] TXXX 如相关，审核虚拟设备和真实设备在 SDK 外部都只暴露 UUID decimal string；
  SDK native id、virtual id、handle 仅保留在底层内部。
- [ ] TXXX 如相关，删除或迁移功能等价旧 API；若暂时保留，记录 owner-approved temporary gap。
- [ ] TXXX 如相关，确认调试 API、测试 facade、临时 SDK 直通能力未进入生产 Biz exports。
- [ ] TXXX 如相关，确认事件只触发刷新，刷新后重新从 `CoreRuntime` 获取 snapshot/runtime facts。
- [ ] TXXX 如相关，确认 `build/`、`export/`、`plugin-out/` 等构建产物未参与 diff、接口判断或安装来源判断。
- [ ] TXXX 如相关，审核 Qt 源行为覆盖清单中的每个设备类型/状态组合都有实现、测试或
  owner-approved gap。
- [ ] TXXX 如相关，审核 `ServiceBridge` 未实现业务逻辑；frontend plugin 未伪造或推断
  runtime/permission 事实；UI 展示组合只依赖 `CoreRuntime` 事实数据和临时
  display state。
- [ ] TXXX 如相关，审核接口层/数据层是否按职责拆分，新增文件或复用位置是否符合
  existing patterns，未造成单文件职责膨胀。
- [ ] TXXX 如需要，更新 docs、quickstart 或 migration notes。
- [ ] TXXX 更新 `review.md`，同步人类审核摘要、验证入口、验收入口和剩余风险。
- [ ] TXXX 更新 `progress.md`，记录当前 slice、完成任务、验证结果和剩余风险。
- [ ] TXXX 更新 `lessons.md`，记录本 feature 暴露的项目坑候选；只有用户确认后才提升到
  `.specify/memory/pitfalls.md`。
- [ ] TXXX 执行最终验证，或记录 unverified gaps。
- [ ] TXXX 运行 `speckit-ai-self-acceptance`，将 Rubric 判定、CDP/log/runtime/API/test
  证据和 `PASS | FAIL | BLOCKED` 写入 `validation.md`。
- [ ] TXXX 确认每个已验证行为都有对应 test-case update、substitute evidence 或 explicit N/A reason。
- [ ] TXXX 确认 `tasks.md` 反映已完成工作和剩余风险。

## 依赖说明

- 当共享准备任务定义 common contracts 时，它们会阻塞场景任务。
- Public contract changes 应先于 downstream implementation。
- 除非明确说明，一个场景的验证不应依赖无关场景。

## 并行说明

- 修改不同文件且没有 shared contract 的任务可以标记 `[P]`。
- 修改相同 header、contract、generated state file 或 shared UI state model 的任务不要标记 `[P]`。
- 涉及同一 contract、DTO、permission/availability model、cache adapter 或 UI state source 的任务
  不要标记 `[P]`，除非已明确拆分文件且依赖方向清楚。
