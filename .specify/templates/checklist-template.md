# [CHECKLIST TYPE] 检查清单: [CAPABILITY NAME]

> 语言规范：本文档面向人工审核，使用中文为主。文件路径、模块名、
> API、字段名、枚举值、状态值、命令、测试名等技术标识必须保留英文原文。

**目的**: [本检查清单验证什么]
**创建时间**: [DATE]
**Feature**: [Link to spec.md]

## 人类审核摘要

> 该区是给人类 reviewer 的快速入口；不得替代或删减后续 AI/流程读取区。
> AI Agent 必须继续读取完整检查项、生成策略、证据说明和阻塞项后再判断是否进入下一阶段。

- **检查结论**: [Pass/Blocked/Needs adjustment，并说明一句话原因]
- **阻塞项**: [未勾选或需要 owner 决策的 CHK ID；无则写 N/A]
- **重点风险**: [最需要人工复核的兼容、验证、边界或分支风险]
- **N/A 总览**: [大量不适用项的压缩说明；具体原因仍保留在检查项中]
- **验证入口**: [校验脚本、人工检查或下一步 gate]
- **下一步**: [进入哪个 speckit stage，或先调整哪些上游文档]
- **必需人工决策**: [仅产品/业务取舍、owner-approved gap、外部验证、验收、commit/cherry-pick completion；无则写 N/A]

## 生成策略

- 结构来源：本文件提供稳定章节和基础 `CHK` 项，避免不同模型输出漂移过大。
- 规则来源：生成时必须读取 `.specify/checklist-rules/common.yml`，并按
  `.specify/feature.json` 的 `task_type` 选择 `new-feature.yml`、`migration.yml`
  或 `bugfix.yml`；涉及 CLI、脚本、生成物或文档工具时，同时读取 `tooling.yml`。
- 证据原则：每个勾选、未勾选或 `N/A` 判断都必须能追溯到 `spec.md`、
  `intake.md`、`.specify/feature.json`、`.specify/memory/constitution.md` 或
  被规格点名的项目文件。
- 弹性原则：可以补充任务专属检查项和说明，但不得删除适用的安全、兼容、
  验证或本地 Spec 分支检查项。`N/A` 必须说明原因，未勾选项必须说明缺口。
- 质量门：生成后应运行 `.specify/scripts/powershell/validate-checklist.ps1`
  `CHK`、无原因 `N/A`、无说明未勾选项等问题。

## 需求质量

- [ ] CHK001 `intake.md` 已将任务分为 `migration`、`bugfix`、`new-feature`
  或 `needs-routing`，并说明原因。
- [ ] CHK002 `needs-routing` 不会继续进入实现阶段。
- [ ] CHK003 能力场景可以被独立理解。
- [ ] CHK004 需求是可观察、可审核或可测试的。
- [ ] CHK005 待确认问题已标记为 `NEEDS CLARIFICATION`。

## 工程边界

- [ ] CHK006 已识别影响模块和 ownership boundaries。
- [ ] CHK007 如相关，已覆盖 Public API、SDK、plugin、UI state 或 script contracts。
- [ ] CHK008 已记录兼容性和迁移风险，或明确标记为 `N/A`。
- [ ] CHK008A 如涉及 UI 状态、UI interaction、operation availability 或操作权限，`spec.md`/`plan.md` 已明确
  `ServiceBridge` 仅做 API forwarding bridge，不实现业务逻辑；非 UI 专属 runtime/
  permission/capability 事实来自 `CoreRuntime`；仅用于 UI 展示的结构、顺序和
  visible/enabled 组织位于 frontend plugin。
- [ ] CHK008B 如涉及 UI interaction/action availability，已覆盖 frontend-owned interaction/action id、顺序、可见性、
  可用性、action id、依赖的 `CoreRuntime` permission/status/capability 来源和刷新时机。
- [ ] CHK008C 如为 Qt UI interaction 或 operation availability 迁移，已列出 Qt 源行为覆盖清单，
  覆盖对象/设备类型、设备状态、UI element/action 顺序、visible/enabled 规则、action handler 和目标契约来源；
  可使用表格、分组清单、决策表、状态机说明、fixture matrix 或按 Qt 函数分段的规则清单。

## 运行时与数据完整性

- [ ] CHK009 除非明确存在 simulation boundary，否则 device/runtime/cache/handle/
  permission behavior 基于真实状态。
- [ ] CHK010 如相关，已记录 encoding 和 localization boundaries。
- [ ] CHK010A 如相关，已确认 `ServiceBridge` 未实现业务规则；frontend plugin 未用
  label/string 推断 runtime/permission 事实、未长期缓存 device/runtime/permission
  业务状态。

## 身份 / 状态 / API 边界

- [ ] CHK010D 跨 `CoreRuntime` facade、`ServiceBridge`、N-API/JSON/RPC、JS/UI 的设备身份
  只使用 UUID decimal string；未新增 `deviceIndex`、`deviceId`、`handleId`、
  `virtualDeviceId` 等平行身份。
- [ ] CHK010E UUID 生成入口唯一：`device::identity::generateUUID()`；`DeviceManager`、
  `SdkService`、UI 只使用身份，不实现生成规则。
- [ ] CHK010F SDK native id、virtual id、handle 仅留在底层内部，未泄漏到 Libs facade、
  Biz、JS 或 UI。
- [ ] CHK010G 前端业务操作只读 `node.uuid`；未使用 `node.id`、`entityId`、
  `metadata.uuid` 等兜底操作设备。
- [ ] CHK010H `ServiceBridge` 未缓存设备列表、连接状态、采集状态或 runtime state；
  事件仅触发刷新，刷新后重新获取 `CoreRuntime` snapshot/runtime facts。
- [ ] CHK010I 功能等价旧 API 已删除或迁移；若暂时保留，已有 owner-approved temporary gap。
- [ ] CHK010J 调试 API、测试 facade、临时 SDK 直通能力未进入生产 Biz exports。
- [ ] CHK010K 字段命名表达真实语义，例如 `uuid`、`deviceUuids`、`nodeId`、
  `listIndex`；未使用 `deviceId` 等含混词作为跨层身份。
- [ ] CHK010L 虚拟设备和真实设备在 SDK 外部都表现为同一套 UUID 语义。
- [ ] CHK010M `build/`、`export/`、`plugin-out/` 等构建产物未参与接口判断、
  diff 判断或安装包来源判断。
- [ ] CHK010N 如涉及 frontend/native plugin 修改，变更已落到仓库源码；未把
  `dist/`、`build/`、`export/`、`plugin-out/`、`app-data/plugins/**`、
  host-served `frontend/plugins/**` 等已安装运行目录或构建产物作为长期修复位置。

## 结构与文件职责

- [ ] CHK010B 新增或扩展接口层/数据层前，已搜索既有目录和相邻模块。
- [ ] CHK010C contract、DTO、permission/availability model、cache adapter、serialization 和 UI
  adapter 已按职责落到合适文件；若没有合适文件，已规划新增职责清晰的文件。

## 分流专项就绪度

- [ ] CHK011 `migration` 已说明 Qt 源行为和平迁等价预期，或记录 owner-approved `N/A`。
- [ ] CHK012 `bugfix` 已包含实际行为、预期行为、复现路径和回归预期。
- [ ] CHK013 `new-feature` 已说明为什么不是直接迁移，并给出验收信号。
- [ ] CHK014 UI 相关 `migration` 或 `new-feature` 已列出所需 UI 设计/来源目录，
  或记录明确 `N/A` 原因。
- [ ] CHK014G UI 开发、UI 变更、UI 修复、UX、图标、tooltip、按钮、菜单、
  可见文案、样式和布局变更已完成 UI / UX / 文案依据追踪；每个新增或修改的
  UI 元素、文案、图标、tooltip 样式和交互行为都有可靠来源（Qt UI/source/
  delegate/QSS/resource、设计稿/截图、既有产品规范或明确 owner/user 决策）。
  如缺失依据，已阻塞到 clarify / bounded investigation，没有凭空实现。
- [ ] CHK014D UI parity、frontend visual 或 host-embedded UI 任务已覆盖静态参考源
  （设计稿、Qt `.ui`/delegate/qss/source、截图）、dynamic states / 动态状态（hover、selected、
  disabled、expanded/collapsed、loading、empty、many-item、scrollbar appear/disappear）、
  几何约束（固定尺寸、padding/margin、line-height、overflow、flex/grid grow-shrink、
  scroll owner、clipping/compression 边界）和真实 host route/page。
- [ ] CHK014E 如涉及裁剪、空白、挤压、滚动条影响外部 UI、嵌入式布局或首轮 CSS 修复失败，
  已要求 runtime DOM / computed style / box metrics 证据，或已进入 bounded UI runtime investigation。
- [ ] CHK014H Host-embedded frontend UI 如修改高度、flex、overflow、底部间距、详情栏/信息栏，
  已在真实 HostApplication 宿主通过 CDP 记录 plugin root、shell、main panel、detail/footer panel、
  scroll owner、last visible row/control 的 top/bottom/height；没有使用裸 `100vh` 或单插件预览高度
  作为嵌入式裁切问题的唯一依据。
- [ ] CHK014F 如涉及 UI parity、截图对齐或 0px 级视觉修复，`plan.md` 已包含 UI element traversal
  inventory / 0px alignment matrix：baseline anchors、从外到内的 affected elements、dynamic states、
  expected geometry/style、current runtime evidence、delta 和 batch patch strategy，避免逐症状猜 CSS。
- [ ] CHK014A `delivery_profile` 与影响面匹配；`micro-fix` 仅用于单仓、小范围、
  内部、根因已证实、有本地验证且不涉及状态/权限/API/身份/跨层风险的改动。
- [ ] CHK014B Bugfix 进入实现前已有 `Root Cause Evidence`：Symptom、Call Path、
  Evidence、Excluded Alternatives、Counterexample、Blast Radius、Validation Mapping
  和 Confidence。
- [ ] CHK014C 计划和任务没有把未证实方案提前写死；核心路径 known gap 未被当作 PASS。

## 验证

- [ ] CHK015 已描述 build、test、smoke、manual、virtual-device 或 real-device
  validation。
- [ ] CHK016 每个已验证行为都有计划补充 unit test、regression test、fixture、
  contract test、smoke case，或明确 `N/A` 原因。
- [ ] CHK017 test-case updates 后会重新运行受影响测试。
- [ ] CHK018 无法执行的验证已记录为 known gap。
- [ ] CHK018A 搜索范围被限制在受影响仓库和已知目录；没有默认扫描整个
  `workspace_root`，简单本地查找没有交给 explorer/subagent。
- [ ] CHK018B UI parity 或 host-embedded UI 验证优先在真实宿主页/路由执行；
  已覆盖大量条目、滚动条出现/消失、动态状态和 sibling/header/footer 不被压缩或重排。
- [ ] CHK018C Host-embedded frontend plugin 源码改动已计划并验证固定链路：
  source edit -> frontend build -> direct runtime replacement -> real host CDP verification；
  已记录 build 命令/结果、runtime 替换目录、removed stale count、plugin id 和真实 target 加载的资源。
- [ ] CHK018D Native plugin 源码改动没有套用 frontend runtime 热替换；已要求 `.plugin`
  构建产物路径、安装/重启验收路径，或记录 native 无法热更新的原因。
- [ ] CHK018E host CDP 验证已先列出 `/json/list` page targets，并记录
  `id/title/url/webSocketDebuggerUrl`、选中 target id/URL；产品 UI 验证没有使用
  Plugin Workbench、`base-win.html`、`devtools://`、blank 或无关 target。
- [ ] CHK018F Qt-to-frontend UI parity 已先查
  `.specify/memory/qt-source-behavior-map.md` 或 `ai/knowledge/qt-source-behavior-map.md`；
  缺失/过期条目已转为有界源码证据或明确 blocker，没有默认全工作区搜索。

## 本地 Spec 分支工作流

- [ ] CHK019 该能力使用本地 Spec branch，不需要 remote push、remote tracking
  或 GitHub issue generation。
- [ ] CHK020 多仓任务已识别每个受影响仓库，并要求它们使用同名本地 Spec branch，
  完成前合回配置的 base branch。
- [ ] CHK021 分支 cherry-pick 完成动作必须在 agent 执行 completion command 前取得
  用户明确确认；默认保留 spec branch，不删除，不 push。
- [ ] CHK022 当前阶段完成后的衔接遵守 `ai/workflows/task-routing.md` 中央
  Stage Continuation Contract；若停止，必须写明 `blockers` 和
  `next_required_human_action`。

## 说明

- 可以增删检查项，使最终清单贴合当前能力。
- 优先使用具体检查项，避免泛泛的质量建议。
