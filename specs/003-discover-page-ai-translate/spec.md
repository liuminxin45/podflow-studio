# 能力规格说明: 发现页采集列表管理与 AI 翻译

**Feature Directory**: `specs/003-discover-page-ai-translate`  
**创建时间**: 2026-06-25  
**状态**: Draft  
**用户输入**: 发现页删除 TrendRadar 更新检查按钮和返回按钮，补齐清空当前采集列表、失败来源明细查看，以及对纯英文采集条目的一次性 AI 翻译和已翻译标识。

## L1 Artifact Contract

- **Layer**: L1 Business Specification
- **Purpose**: capture observable behavior, user/business expectations, compatibility boundaries, assumptions, and validation expectations.
- **Required sections**: `人类审核摘要`, `能力概览`, `分流摘要`, `Workspace Repository Map`, `能力场景`, `功能需求`, `兼容性与集成边界`, `验证预期`, `非目标`, `假设`, `待确认问题`.
- **Structured state**: `.specify/feature.json` and `workflow-state.json` carry workflow metadata; do not encode routing state only in prose.
- **Next layer**: L2 `plan.md` must cite this spec and preserve unresolved questions as plan risks or blockers.

## 人类审核摘要

- **一句话结论**: 发现页应更贴合固定版本 TrendRadar 适配方式，并支持采集结果的列表清空、失败来源定位和纯英文条目批量 AI 翻译。
- **重点审核**: 固定版本下不再展示 TrendRadar 更新检查；失败来源明细不得臆造，必须来自 TrendRadar v6.10 或本项目接入层可观察事实；AI 翻译只作用于纯英文采集条目并保留原文。
- **改动范围**: `src/components/DiscoverPanel.tsx`、相关前端类型和 TrendRadar 接入层状态字段；如失败来源数据缺失，可能触及 `engine/bridge.py` 或 Electron IPC 状态整理。
- **不涉及 / N/A 汇总**: 不涉及 SDK、native device、Qt migration、real-device、public npm package API。
- **主要风险**: TrendRadar v6.10 是否暴露失败来源明细需要实现阶段从本地锁定源码确认；AI 翻译依赖当前大模型配置，必须有无配置降级状态。
- **验收入口**: 运行 `npm run build`，并在发现页验证按钮删除、列表清空、失败来源点击明细、英文条目批量翻译和翻译标识。
- **当前状态 / 下一步**: Draft，下一步进入 clarify，若无阻塞问题则进入 plan。
- **必需人工决策**: N/A，5 个产品行为已经由用户明确指定。

## 能力概览

发现页当前承担内容采集入口。固定版本适配后，TrendRadar 更新检查不再符合产品语义，应从 UI 删除。采集完成后，用户需要能清空当前列表以开始下一轮采集；失败来源需要可点击查看明细，帮助判断是源站、网络、配置还是接入层问题；采集到的纯英文条目需要一键调用已配置 AI 翻译成中文，并以轻量标识说明条目已翻译，同时保留原始英文内容用于追溯。

本能力不是直接迁移，也不是单点 bugfix，而是发现页已有 TrendRadar/NewsNow 采集体验的新增操作能力和 UI 收敛。

## 分流摘要

**Task Type**: new-feature  
**Routing Confidence**: high  
**Risk Level**: medium  
**Delivery Profile**: standard-bugfix  
**Intake Source**: 用户当前对发现页的 5 点明确请求  
**关键分流依据**:

- 这是既有发现页功能扩展，不是 Qt migration。
- 涉及可见 UI、AI 调用和 TrendRadar 接入数据，不适合 micro-fix。
- 失败来源明细需要先确认 TrendRadar v6.10 或本项目桥接层的可用字段。

## Workspace Repository Map

**workspace_root**: `.`  
**default_base_branch**: `main`  
**repository_map**: `.specify/memory/repository-map.md`

| Repository | Path | Role | Capability / Ownership | Why affected / N/A |
|------------|------|------|-------------------------|--------------------|
| `auto-podcast` | `.` | `electron-react-python-podcast-workbench` | Electron desktop shell, React/Vite authoring UI, Python podcast workflow nodes, shared state/config protocol, TrendRadar bridge, build/test scripts, docs, and runtime output conventions. | 发现页属于 React/Vite UI，TrendRadar 接入状态属于 engine bridge / Electron orchestration 边界。 |

## 能力场景

### CS1 - 收敛固定版本采集入口 (Priority: P1)

**目标**: 发现页不再展示固定版本场景下无意义的 TrendRadar 更新检查入口，也不展示返回按钮。

**优先级理由**: 这两个入口会暗示用户可更新或回退，但当前项目以锁定版本适配为准，容易造成误操作和认知负担。

**独立验证**: 打开发现页，确认 TrendRadar 更新检查按钮和返回按钮不再可见，其他采集入口仍可用。

**验收场景**:

1. **Given** 用户进入发现页，**When** 查看顶部和工具区操作，**Then** 不出现 TrendRadar 更新检查按钮和返回按钮。
2. **Given** 用户需要开始采集，**When** 点击现有采集或 NewsNow 操作，**Then** 原有采集流程不受删除按钮影响。

### CS2 - 清空当前采集列表 (Priority: P1)

**目标**: 用户可以显式清空当前发现页采集结果，开始新的采集轮次。

**优先级理由**: 当前列表会保留上一轮结果，缺少清空入口会影响重复采集和筛选判断。

**独立验证**: 在发现页存在采集条目时点击清空操作，确认列表为空且相关计数和选择状态同步清理。

**验收场景**:

1. **Given** 发现页已有采集条目和选中项，**When** 用户触发清空当前采集列表，**Then** 条目、选择状态、翻译标识和本轮失败来源摘要被清理或回到空状态。
2. **Given** 发现页列表为空，**When** 用户查看清空操作，**Then** 清空操作不可用或给出无条目可清空的安全反馈。

### CS3 - 失败来源明细可定位 (Priority: P1)

**目标**: 失败来源摘要可以点击查看具体失败来源、失败原因和可用上下文。

**优先级理由**: 只显示失败数量不能帮助用户判断失败是否可忽略或需要修复配置。

**独立验证**: 构造或读取存在失败来源的采集状态，点击失败来源摘要，确认可查看具体来源列表和原因。

**验收场景**:

1. **Given** TrendRadar 或接入层返回失败来源明细，**When** 用户点击失败来源摘要，**Then** UI 展示每个失败来源的名称、状态和错误原因。
2. **Given** 上游只返回失败数量但没有明细，**When** 用户点击失败来源摘要，**Then** UI 明确说明当前接入未提供明细，不臆造失败来源。

### CS4 - 纯英文条目批量 AI 翻译 (Priority: P2)

**目标**: 用户可以一次性把采集到的纯英文条目通过已配置 AI 翻译成中文，并看到已翻译标识。

**优先级理由**: 发现页采集常混入英文来源，批量翻译能降低进入后续选题和筛选的成本。

**独立验证**: 使用包含英文和中文条目的列表，触发 AI 翻译，确认只翻译纯英文条目，中文或已翻译条目不重复处理。

**验收场景**:

1. **Given** 当前采集列表包含纯英文条目，**When** 用户点击批量 AI 翻译，**Then** 系统调用 AI 翻译英文标题和摘要，条目显示中文内容和已翻译标识。
2. **Given** AI 配置缺失或调用失败，**When** 用户触发翻译，**Then** UI 显示明确错误，原条目不被破坏。

## 功能需求

- **FR-001**: 系统必须从发现页删除 TrendRadar 更新检查按钮。
- **FR-002**: 系统必须从发现页删除返回按钮，不影响面板关闭或导航由上层容器控制的能力。
- **FR-003**: 系统必须提供清空当前采集列表的操作，并同步清理当前轮次的选中项、翻译状态和可见列表状态。
- **FR-004**: 系统必须让失败来源摘要可点击查看明细；明细字段必须来自 TrendRadar v6.10、本项目接入层或可观察运行结果，不得根据来源名列表臆造失败。
- **FR-005**: 当失败来源没有明细数据时，系统必须展示“当前接入未提供明细”一类的可理解降级状态。
- **FR-006**: 系统必须识别纯英文采集条目，并支持一次性调用 AI 翻译这些条目的标题和摘要。
- **FR-007**: 系统必须跳过非纯英文条目和已翻译条目，避免重复翻译或覆盖用户可读内容。
- **FR-008**: 系统必须为已翻译条目显示轻量图标或标签，并保留原始英文内容用于查看或追溯。
- **FR-009**: AI 翻译失败时不得破坏原始采集结果，必须给出错误反馈和可重试状态。
- **FR-LAYERING**: N/A。本能力是 Electron/React 应用内发现页 UI 和本地 TrendRadar 接入状态，不涉及 `ServiceBridge`、`CoreRuntime` 或设备操作权限边界。

## 兼容性与集成边界

- **Public SDK/API**: N/A，不改变公开 SDK 或包导出。
- **NativePlugin / ServiceBridge Bridge Contract**: N/A，不涉及 native plugin 或 ServiceBridge。
- **HostApplication / Plugin Contract**: N/A，当前应用是 Electron 主应用，不是外部 host plugin。
- **Frontend State/UI Contract**: 发现页新增的清空、失败来源明细、翻译状态必须只影响当前发现页采集会话和传给后续流程的条目字段，不破坏已有 `ContentItem` 基础字段。
- **UI Display Contract**: 发现页保持 Ant Design 体系和现有布局密度；新增按钮、弹窗、标签必须服务于当前工作流，不引入营销式视觉改版。
- **UI Interaction Display Contract**: 清空操作必须有空列表禁用或确认反馈；失败来源点击只在有失败摘要时可用；AI 翻译按钮在无可翻译条目或 AI 配置不可用时必须给出清晰状态。
- **Device/Runtime Contract**: N/A，不涉及设备或运行时采集状态。
- **Encoding/Localization Boundary**: 翻译结果以 UTF-8 字符串保存在前端状态或工作流状态；原始英文必须保留，避免本地化覆盖数据来源。

## Identity / State / API Boundary

N/A。本能力不涉及设备身份、设备列表、连接状态、采集状态 RPC/N-API 或 public API。发现页条目身份继续使用既有 URL/id/title 派生逻辑，不新增设备身份或跨层 identity。

## Qt 源行为覆盖清单

N/A。本能力不是 Qt UI migration，不存在 Qt source path/function 平迁目标。

## UI 设计来源目录

| 目录类型 | Path | 说明 |
|----------------|------|-------|
| Original Qt UI/source | N/A | 非 Qt migration。 |
| Product design/mockup/export | 用户当前明确请求 | 删除按钮、清空列表、失败来源明细、AI 翻译和翻译标识均来自用户 owner decision。 |
| Target frontend/plugin | `src/components/DiscoverPanel.tsx`、`src/index.css` | 发现页 UI 和现有样式目标。 |
| Shared assets/icons/screenshots | `src/icons/antdCompat.tsx` | 继续使用现有 Ant Design icon 兼容层，不新增图标库。 |

## UI / UX / 文案依据追踪

| Target UI element / copy | Reliable source | Expected implementation | Intentional delta / approval |
|--------------------------|-----------------|-------------------------|------------------------------|
| 删除 TrendRadar 更新检查按钮 | 用户明确请求 1 | 不再渲染该按钮 | approved change |
| 删除返回按钮 | 用户明确请求 2 | 不再渲染返回入口 | approved change |
| 清空当前采集列表 | 用户明确请求 3 | 增加清空操作，空状态禁用或安全反馈 | approved change |
| 失败来源明细 | 用户明确请求 4 | 失败来源摘要可点击，展示明细或无明细降级说明 | approved change |
| AI 翻译纯英文条目 | 用户明确请求 5 | 批量翻译按钮、loading/error 状态、已翻译图标或标签 | approved change |

## 影响模块

- `src/components/DiscoverPanel.tsx`: 发现页主要 UI、列表状态、操作按钮、结果渲染。
- `src/types/trendradar.ts` / `src/types/workflow.ts`: 如需要承载失败来源或翻译状态，补充前端类型。
- `engine/bridge.py`: 如 TrendRadar v6.10 返回失败来源明细但桥接层未透出，需要规范化字段。
- `electron/main.js`: 如发现页只通过 Electron IPC 获取 TrendRadar 状态，可能需要传递失败来源明细。
- `src/services/settings/llmConfigResolver.ts` 或现有 LLM service: AI 翻译应复用现有模型配置和调用路径。

## 验证预期

- **Test-Case Plan Review**: approved-by-ai-obvious。该 UI 功能可由构建和本地交互 smoke 验证。
- **Quality Vision**: `quality-vision.md`。涉及 UI/UX/文案，需记录现有 Ant Design 高密度工具界面基线。
- **Acceptance Rubric**: `acceptance-rubric.md`。需覆盖按钮删除、清空、失败明细、AI 翻译、降级状态和不破坏原文。
- **Build**: `npm run build` 必须通过。
- **Automated Tests**: 至少运行 TypeScript/Vite build；若项目已有相关轻量测试，可补充单元或脚本 smoke。
- **Runtime/UI Smoke**: 最好运行前端或 Electron dev，手动或自动检查发现页核心交互。
- **Device Validation**: N/A，不涉及设备。
- **Downstream Check**: 已翻译条目进入后续选题/整理时仍保留标题、摘要、URL 等基础字段。
- **AI Self-Acceptance**: PASS 前需具备构建结果和至少一次发现页状态级检查证据；若无法启动 UI，记录原因和人工验收步骤。

## 非目标

- 不升级 TrendRadar 到浮动版本。
- 不恢复或新增 TrendRadar 更新检查能力。
- 不改变 NewsNow 启停、同步或构建流程。
- 不做整页视觉重设计。
- 不翻译非英文条目，不自动翻译用户已编辑内容。

## 假设

- 用户明确同意固定版本适配，因此删除更新检查入口不需要再确认。
- 当前项目已有 LLM 调用能力，AI 翻译应复用现有配置，而不是新增独立 API Key。
- 纯英文条目可通过标题和摘要中的字符分布进行前端启发式识别；该识别用于降低误翻译，不作为内容真实性判断。
- 失败来源明细是否由 TrendRadar v6.10 原生提供，需要实现阶段读取本地锁定源码或桥接输出确认。

## Clarifications

### 2026-06-25 - 无阻塞澄清

- **Questions asked**: 0。
- **结论**: 当前没有会改变模块边界、产品行为或验证路径的阻塞歧义，可以进入 `speckit-plan`。
- **测试计划前置**: `inspect-validation-capabilities` 显示本仓库没有确定 E2E runner，也没有确定 API test command；计划阶段必须保留 API/interface/regression 或 smoke 级验证行，并将 E2E 标记为 N/A，理由为仓库未配置 E2E runner。
- **质量基线前置**: 本任务是既有 Ant Design 高密度工具页定向演进，不是视觉重设计或像素级 parity。UI baseline 来自 `src/components/DiscoverPanel.tsx` 的现有布局和用户明确 owner decision。

## 待确认问题

- N/A。当前没有阻塞 plan 的产品决策；TrendRadar 失败来源 API 属于实现阶段可验证事实。
