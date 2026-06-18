# 需求分流: [CAPABILITY NAME]

> 语言规范：本文档面向人工审核，使用中文为主。文件路径、模块名、
> 类名、函数名、API、字段名、枚举值、状态值、命令、测试名等技术标识
> 必须保留英文原文。

**Feature Directory**: `specs/[feature-name]`
**创建时间**: [DATE]
**用户输入**: [USER REQUEST SUMMARY]

## 人类审核摘要

> 该区是给人类 reviewer 的快速入口；不得替代或删减后续 AI/流程读取区。
> AI Agent 必须继续读取完整分流依据、迁移/bugfix/new-feature 专项信息和待确认问题后再进入 specify。

- **分流结论**: [migration / bugfix / new-feature / needs-routing]
- **流程档位**: [micro-fix / standard-bugfix / full-sdd / blocked-investigation / validation-only]
- **重点审核**: [最需要人工确认的分流依据、范围或阻塞问题]
- **影响范围**: [主要模块/路径/仓库摘要]
- **不涉及 / N/A 汇总**: [压缩列出无关的 UI/Biz/Libs/device/design 等边界]
- **进入下一步条件**: [进入 specify 前必须满足的澄清、证据或 owner 决策]
- **必需人工决策**: [仅产品/业务取舍、owner-approved gap、外部输入、验收、commit/cherry-pick completion；无则写 N/A]

## 分流结论

**Task Type**: migration / bugfix / new-feature / needs-routing
**Routing Confidence**: high / medium / low
**Risk Level**: low / medium / high / blocked
**Delivery Profile**: micro-fix / standard-bugfix / full-sdd / blocked-investigation / validation-only
**原因**: [为什么选择该类型]

## 流程档位判定

| 维度 | 结论 | 证据 |
|------|------|------|
| Repository count | [single/multi/unknown] | [repo/path evidence] |
| Estimated changed files | [1-2 / few / many / unknown] | [why] |
| Boundary type | [internal/public-api/ui-biz-libs/device-identity/runtime-status/permission/cross-repo] | [why] |
| Semantic risk | [low/medium/high] | [state/permission/device/API risk] |
| Validation strength | [automated/local/manual/external/missing] | [commands or gaps] |
| Root-cause confidence | [known/suspected/unknown] | [evidence or missing evidence] |
| Reversibility | [high/medium/low] | [rollback or compatibility notes] |

**Micro-fix eligibility**:

- [ ] 单仓、通常 1-2 个文件。
- [ ] 内部实现改动，不涉及 public API、身份、权限/状态语义、真实设备、跨层或跨仓风险。
- [ ] 根因已有证据，不是猜测。
- [ ] 有本地可运行验证。

若任一项不满足，不得使用 `micro-fix`。

## 通用上下文

**能力 / 缺陷 / 迁移目标**: [名称或摘要]
**Affected Area**: [SDK, NativePlugin/ServiceBridge bridge, HostApplication, frontend plugin,
tooling, device/runtime, or mixed]
**目标模块**:

- [path or module]: [为什么可能修改]

## 迁移分流

当 `Task Type` 为 `migration` 时填写；否则标记为 `N/A`。

**Qt 源行为**: [必须保留的既有 Qt 功能]
**Qt Source Paths**:

- [path/class/function/.ui/qss/resource]: [作用]

**目标迁移路径**:

- [path/module]: [目标职责]

**等价预期**: exact / compatible / intentionally changed
**允许差异**:

- [difference]: [为什么可以接受]

**迁移验证信号**:

- [build/smoke/unit/fixture/real-device/virtual-device/manual comparison]

## Bugfix 分流

当 `Task Type` 为 `bugfix` 时填写；否则标记为 `N/A`。

**实际行为**: [当前发生了什么]
**预期行为**: [应该发生什么]
**最小复现**:

1. [步骤]
2. [步骤]

**疑似层级**: [SDK, NativePlugin/ServiceBridge bridge, frontend plugin, runtime/device,
tooling, unknown]
**回归测试预期**: [unit/regression/fixture/smoke/manual or N/A]
**根因状态**: [known / suspected / unknown；known 必须说明证据]
**语义风险提示**: [是否涉及状态、权限、真实设备、身份、cache、UI operation availability、public API；不涉及写 N/A]

## 新增功能分流

当 `Task Type` 为 `new-feature` 时填写；否则标记为 `N/A`。

**为什么不是迁移**: [为什么这不是直接的 Qt 行为迁移]
**新增能力意图**: [新增了什么价值或工作流]
**新增或变更契约**:

- [contract/interface/state/API]: [预期形态或 unknown]

## UI 展示、Biz 转发与 Libs 事实线索

UI 状态、UI interaction、操作权限或设备运行态展示相关时必填；否则标记 `N/A`。

- **ServiceBridge 边界**: [forwarding bridge only / unknown / N/A；不得写业务逻辑]
- **CoreRuntime 事实来源**: [runtime/permission/capability/device facts 来源，或 unknown / N/A]
- **Frontend display composition**: [UI elements/order/enabled/visible/action id 的 UI 展示组合位置，或 unknown / N/A]
- **UI 可持有状态**: [display-only state，如 open/hover/selection/loading，或 N/A]
- **缺口**: [需要补充的接口/数据/设计输入，或 N/A]

## Qt 源 UI 行为覆盖清单

当 `migration` 涉及 UI interaction、toolbar action、operation availability 或设备运行态 UI 时必填。
如果不相关，标记 `N/A` 并说明原因。该清单是进入 `plan` 前的审核输入，不能只写
“参考 Qt 实现”。必须覆盖以下信息，但不强制使用固定表格格式：

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

推荐使用表格；当状态组合复杂时，可以按设备类型分组、使用决策表、状态机说明、
fixture matrix 或按 Qt 函数分段的规则清单。

**验收信号**:

- [可观察行为、审核信号或验证路径]

## UI 设计来源目录

当 `migration` 和 `new-feature` 涉及 UI 行为、frontend plugin、视觉状态、图标、
截图或设计资产时必填。仅当 UI 不相关时，才能标记 `N/A` 并说明原因。

| 目录类型 | Path | 适用类型 | 说明 |
|----------------|------|------------|-------|
| Original Qt UI/source | [path or N/A] | migration | `.ui`, widgets, QSS, resources, screenshots, or behavior references |
| Product design/mockup/export | [path or N/A] | migration/new-feature | Figma export, image set, HTML mock, design package, or spec docs |
| Target frontend/plugin | [path or N/A] | migration/new-feature | FrontendPlugin、ProductModule plugin 或其他 UI implementation target |
| Shared assets/icons/screenshots | [path or N/A] | migration/new-feature | Assets needed for parity or acceptance |
| Missing design inputs | [path or N/A] | migration/new-feature | What must be supplied before planning |

## 待确认分流问题

- [NEEDS CLARIFICATION: 问题]
