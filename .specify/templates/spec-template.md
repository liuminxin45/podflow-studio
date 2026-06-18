# 能力规格说明: [CAPABILITY NAME]

> 语言规范：本文档面向人工审核，使用中文为主。文件路径、模块名、
> 类名、函数名、API、字段名、枚举值、状态值、命令、测试名等技术标识
> 必须保留英文原文。

**Feature Directory**: `specs/[feature-name]`
**创建时间**: [DATE]
**状态**: Draft
**用户输入**: [USER REQUEST SUMMARY]

## L1 Artifact Contract

- **Layer**: L1 Business Specification
- **Purpose**: capture observable behavior, user/business expectations,
  compatibility boundaries, assumptions, and validation expectations.
- **Required sections**: `人类审核摘要`, `能力概览`, `分流摘要`, `Workspace Repository Map`,
  `能力场景`, `功能需求`, `兼容性与集成边界`, `验证预期`, `非目标`, `假设`, `待确认问题`.
- **Structured state**: `.specify/feature.json` and `workflow-state.json` carry
  workflow metadata; do not encode routing state only in prose.
- **Next layer**: L2 `plan.md` must cite this spec and preserve unresolved
  questions as plan risks or blockers.

## 人类审核摘要

> 该区是给人类 reviewer 的快速入口；不得替代或删减后续 AI/流程读取区。
> AI Agent 必须继续读取完整的能力场景、功能需求、边界、验证预期和检查清单后再判断或实施。

- **一句话结论**: [这项能力、缺陷修复、迁移或工具变更最终交付什么]
- **重点审核**: [最需要人工确认的 1-3 个行为、边界、取舍或开放问题]
- **改动范围**: [主要模块、路径或仓库摘要；详细清单仍写在后续章节]
- **不涉及 / N/A 汇总**: [压缩列出已确认不涉及的 SDK/Biz/UI/runtime/device 等边界]
- **主要风险**: [兼容性、验证、数据、设备、编码、分支或生成物风险；无则写 N/A 和原因]
- **验收入口**: [最短人工验收路径、关键命令或预期输出]
- **当前状态 / 下一步**: [Draft/Needs clarification/Ready for plan 等状态和下一阶段]
- **必需人工决策**: [仅产品/业务取舍、owner-approved gap、外部验证、验收、commit/cherry-pick completion；无则写 N/A]

## 能力概览

[用中文描述能力、缺陷修复、迁移、集成或工具变更的产品目标和工程边界。
除非属于契约要求，否则避免展开实现细节。]

## 分流摘要

**Task Type**: migration / bugfix / new-feature / needs-routing
**Routing Confidence**: high / medium / low
**Risk Level**: low / medium / high / blocked
**Delivery Profile**: micro-fix / standard-bugfix / full-sdd / blocked-investigation / validation-only
**Intake Source**: [link to intake.md]
**关键分流依据**:

- [Qt 源行为、Bug 复现路径或新增能力理由]

## Workspace Repository Map

> 仓库路径、角色和能力归属来自 `.specify/memory/repository-map.md`。
> specify 阶段不得通过扫描仓库源码来推断仓库职责；只在需要确认具体 API/path/source behavior
> 时读取已识别影响仓库中的局部文件。

**workspace_root**: [from repository-map / branch script]
**default_base_branch**: [from repository-map / branch script]
**repository_map**: `.specify/memory/repository-map.md`

| Repository | Path | Role | Capability / Ownership | Why affected / N/A |
|------------|------|------|-------------------------|--------------------|
| [repo] | [path] | [role] | [capability from fixed map] | [affected reason or N/A] |

## 能力场景 *(必填)*

能力场景用于替代泛化的 user story。每个场景都必须能被独立理解、独立审核
或独立验证。

### CS1 - [Scenario Title] (Priority: P1)

**目标**: [交付什么能力]

**优先级理由**: [价值或风险理由]

**独立验证**: [该场景如何单独审核或测试]

**验收场景**:

1. **Given** [初始状态], **When** [触发动作], **Then** [可观察结果]
2. **Given** [失败或边界状态], **When** [触发动作], **Then** [预期安全行为]

### CS2 - [Scenario Title] (Priority: P2)

**目标**: [交付什么能力]

**优先级理由**: [价值或风险理由]

**独立验证**: [该场景如何审核或测试]

**验收场景**:

1. **Given** [初始状态], **When** [触发动作], **Then** [可观察结果]

## 功能需求 *(必填)*

- **FR-001**: 系统必须 [具体能力]。
- **FR-002**: 系统必须 [具体行为或边界]。
- **FR-003**: 系统必须 [可观察结果]。
- **FR-004**: 系统必须 [错误处理、降级或兼容行为]。
- **FR-LAYERING**: 若能力涉及 UI 状态、UI interaction、操作权限或设备运行态，系统必须明确
  三层边界：`ServiceBridge` 只能作为 API forwarding bridge；非 UI 专属的业务/运行时
  事实和可复用规则属于 `CoreRuntime`；仅用于当前 UI 展示的结构、顺序、
  visible/enabled 组织和交互入口编排属于 frontend plugin，并必须基于经 Biz 转发获得的
  `CoreRuntime` 事实数据。
  不适用时必须说明 `N/A` 原因。

## 兼容性与集成边界

列出相关边界。不适用项标记为 `N/A`，并用中文说明原因。

- **Public SDK/API**: [Headers, exports, CLI, script API, or N/A]
- **NativePlugin / ServiceBridge Bridge Contract**: [forwarded request/response fields; no business logic, or N/A]
- **HostApplication / Plugin Contract**: [plugin API, events, assets, or N/A]
- **Frontend State/UI Contract**: [UUID string identity, statusKey, operationPermissions,
  display state, or N/A]
- **UI Display Contract**: [frontend plugin 如何基于 Biz 转发的 CoreRuntime 事实组织
  UI 展示、UI element/action 顺序、visible/enabled、临时 display state；或 N/A]
- **UI Interaction Display Contract**: [frontend-owned interaction/action ids、order、enabled/disabled、
  visibility、action id、permission/capability facts source、refresh timing；或 N/A]
- **Device/Runtime Contract**: [GigE/U3V/GenTL/virtual device/cache/runtime
  state, or N/A]
- **Encoding/Localization Boundary**: [ANSI/GBK/UTF-8/localized text boundary,
  or N/A]

## Identity / State / API Boundary

涉及设备身份、设备列表、运行态、连接/采集状态、UI operation availability、RPC/N-API
或 public API 时必填；否则标记 `N/A` 并说明原因。

- **Canonical device identity**: [UUID decimal string / N/A；跨 Libs facade、Biz、
  N-API/JSON/RPC、JS/UI 边界只允许这一种语义]
- **Internal native ids**: [SDK handle/native id/virtual id 仅存放在哪个底层实现内；
  不得跨到 Libs facade/Biz/UI]
- **UUID generation owner**: [`device::identity::generateUUID()` / N/A；其它模块只使用]
- **Truth source**: [`CoreRuntime` snapshot/runtime facts fields；Biz 不缓存、不计算]
- **Biz boundary**: [forwarding、参数校验、JSON/RPC/N-API 边界转换、事件转发；无业务逻辑]
- **Frontend operation identity**: [业务操作只读 `node.uuid`；`node.id` 仅为 UI tree node id]
- **Event semantics**: [事件只触发刷新；刷新后重新获取 Libs facts]
- **Deprecated API handling**: [remove / migrate / owner-approved temporary gap]
- **Debug/test API handling**: [test/script/debug-only tooling / N/A；不进入生产 Biz exports]
- **Naming boundary**: [`uuid` / `deviceUuids` / `nodeId` / `listIndex` 等真实语义命名]

## Qt 源行为覆盖清单

`migration` 涉及 UI interaction、operation availability 或设备运行态 UI 时必填；否则写 `N/A`
并说明原因。该清单必须覆盖影响 UI 显示/可用性的设备类型和状态维度，作为人工审核依据。
不强制使用固定表格格式，但必须包含：

- Qt source path/function。
- 对象/设备类型，例如 `GigE`、`U3V`、`GenTL`、`interface`。
- 状态/条件，例如 `connected`、`disconnected`、`acquiring`、`abnormal`、
  `unreachable`。
- UI element 顺序或 action 顺序。
- visible/enabled 规则。
- action handler / Qt slot。
- 迁移要求：`keep` / `change` / `gap`。
- 目标契约来源：`CoreRuntime` runtime/business facts、`ServiceBridge` forwarding bridge、
  frontend display composition / `N/A`。

推荐使用表格；复杂场景可以按设备类型分组、使用决策表、状态机说明、
fixture matrix 或按 Qt 函数分段的规则清单。

## UI 设计来源目录

UI 相关的 `migration`、`new-feature`、bugfix、UX/文案/tooltip/icon/style 改动必填；
否则标记为 owner-approved `N/A` 并说明原因。任何新增或修改的 UI 元素、
图标、tooltip、文案、样式和交互都必须能追溯到可靠来源，不能凭空想象。

| 目录类型 | Path | 说明 |
|----------------|------|-------|
| Original Qt UI/source | [path or N/A] | [迁移源 UI、QSS、resource、screenshot 或行为参考] |
| Product design/mockup/export | [path or N/A] | [设计包、mockup、Figma export、图片集或规格文档] |
| Target frontend/plugin | [path or N/A] | [FrontendPlugin、ProductModule plugin 或其他 UI 实现目标] |
| Shared assets/icons/screenshots | [path or N/A] | [平迁或验收需要的 assets] |

## UI / UX / 文案依据追踪

UI/UX/文案相关任务必填；否则标记为 `N/A` 并说明为什么没有任何可见 UI
变化。可靠来源优先级：Qt UI/source/delegate/QSS/resource、产品设计稿/截图、
既有目标应用规范、明确 owner/user 决策。

| Target UI element / copy | Reliable source | Expected implementation | Intentional delta / approval |
|--------------------------|-----------------|-------------------------|------------------------------|
| [element/text/icon/tooltip/style] | [path, screenshot, design artifact, or owner decision] | [exact icon/text/style/interaction] | [none or approved change] |

## 影响模块 *(初始判断)*

- [Module or path]: [为什么可能受影响]

## 验证预期

- **Test-Case Plan Review**: [approved-by-ai-obvious / needs-human-review /
  owner-approved-gap；说明 API/E2E/interface test 是否需要人工先审]
- **Quality Vision**: [quality-vision.md / N/A；UI/UX/copy/parity work requires
  baseline screenshot/design/Qt source or owner-approved N/A]
- **Acceptance Rubric**: [acceptance-rubric.md / N/A；说明 Essential/Pitfall 是否覆盖关键风险]
- **Build**: [预期构建或 N/A]
- **Automated Tests**: [预期 unit/integration/smoke tests 或 N/A]
- **Runtime/UI Smoke**: [预期人工或自动化流程，或 N/A]
- **Device Validation**: [real device、virtual device 或 N/A]
- **Downstream Check**: [consumer/plugin/regression check 或 N/A]
- **AI Self-Acceptance**: [PASS 前置验收要求；说明 CDP/log/runtime/API/test 证据入口]

## 非目标

- [明确不做的事项]

## 假设

- [假设及其合理性]

## 待确认问题

- [NEEDS CLARIFICATION: 问题]
