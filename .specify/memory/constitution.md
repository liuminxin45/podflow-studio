# [PROJECT_NAME] 工程宪章

> 语言规范：本文档面向人工审核，使用中文为主。仓库名、文件路径、模块名、
> API、字段名、枚举值、状态值、命令、测试名等技术标识必须保留英文原文。

## 核心原则

本宪章是 L0 原则摘要与冲突裁决入口。更细的长期规则拆分在：

- `ai/rules/engineering-principles.md`
- `ai/rules/architecture-constraints.md`
- `ai/rules/ai-coding-rules.md`

正常 feature workflow 不得静默修改 L0 规则文件。原则更新必须来自人工确认的
retrospective/promote-lessons 候选，并说明来源证据、变更原因和预期影响。

### 1. 最小范围变更

变更必须限制在当前 spec 描述的能力、缺陷、迁移或工具诉求内。除非已在
`plan.md` 中明确列出，否则不允许无关重构、格式化噪声、生成元数据扰动或
顺手清理。

### 2. 既有模式优先

实现前必须先阅读附近代码、既有 helper APIs、项目 scripts、build files 和集成约定。
只有在能消除真实复杂度、匹配既有项目模式，或由明确 contract 要求时，才允许新增抽象。

### 3. 兼容边界是一等约束

Public SDK headers、NativePlugin/ServiceBridge bridge contracts、HostApplication plugin APIs、
frontend plugin state/events、serialized fields、device status 和 operation permission
semantics 都是兼容边界。任何破坏兼容或改变行为的更新，都必须在 `spec.md`
和 `plan.md` 中说明影响、迁移方式和验证证据。

### 4. 运行时真实状态优先

系统必须保留真实 SDK、cache、device、transport、handle、permission 和 runtime
state。只有在明确限定的 virtual 或 simulation boundary 内，才允许 fake status、
placeholder handles 或 optimistic UI state。

### 5. UI 展示、Biz 转发与 Libs 事实边界

`NativePlugin/ServiceBridge` 插件只能作为 API forwarding bridge：负责把
frontend plugin 请求转发到下游 API，并把结果转回 frontend plugin；不得实现业务规则、
设备状态推导、权限/可用性判断、UI 行为计算或业务模型沉淀。非 UI 专属的业务能力、
device/runtime/cache/handle/transport/permission 事实和可复用规则必须落在
`CoreRuntime`。仅服务于当前 UI 展示的业务侧组合代码，例如展示结构、条目顺序、
视觉禁用态组织、交互入口编排，应落在 frontend plugin，但必须基于 `CoreRuntime`
经 `ServiceBridge` 转发得到的运行时事实和能力数据；不得用 label/string 推断真实状态，
不得伪造 device/runtime/permission 事实，或长期缓存业务状态作为事实来源。

### 6. 接口与数据实现必须按职责拆分

当新增或扩展 `CoreRuntime`、frontend plugin 或 `ServiceBridge` API forwarding bridge
的接口、DTO、permission model、UI display model、cache adapter 或数据转换逻辑时，Agent 必须先搜索既有
目录结构、相邻模块、helper APIs 和 ownership 边界，选择最合适的位置落代码。不得为了
省事把接口层、数据层、转换层、业务规则和 UI 适配全部堆进单个已有文件。若当前没有
合适承载文件，必须新增职责清晰的 header/source/module 文件，并在 `plan.md` 说明新增
文件的 ownership、依赖方向和替代方案。

### 7. 身份、状态和 API 只有一个归属

跨 `CoreRuntime` facade、`ServiceBridge`、N-API/JSON/RPC、JS 和 UI 边界的设备身份
只能使用十进制字符串 UUID。C++ 内部可以使用 `uint64_t uuid`，但不得在跨语言或跨进程
合同中引入 `deviceIndex`、`deviceId`、`handleId`、`virtualDeviceId` 等平行身份。
UUID 生成规则只能归属 `device::identity::generateUUID()`；`DeviceManager`、
`SdkService` 或 UI 层只能使用该身份，不得各自生成规则。SDK native id、virtual id 和
handle 只能作为底层实现细节留在 SDK/service 内部，不得泄漏到 Libs facade、Biz 或 UI。
前端业务操作只能读取 `node.uuid`；`node.id` 是 UI tree node id，不是设备身份，不得用
`node.id`、`entityId`、`metadata.uuid` 等兜底操作设备。

功能等价旧 API 不得与新 API 长期并存。旧的 forwarding path、facade、RPC 或 helper
应删除或明确迁移，不得形成调用方分裂。调试 API、测试 facade、临时 SDK 直通能力不得进入
生产 Biz exports；验证需求应放在测试、脚本或明确隔离的 debug-only tooling 中。事件只能
触发刷新，不能成为真相源；连接、断开、采集状态变化后仍必须通过 Biz 转发重新获取
`CoreRuntime` snapshot/runtime facts。命名必须表达真实语义，例如 `uuid`、
`deviceUuids`、`nodeId`、`listIndex`，避免 `deviceId` 这类含混字段。虚拟设备和真实设备
在 SDK 外部必须表现为同一套 UUID 语义。`build/`、`export/`、`plugin-out/` 等构建产物
不得参与接口判断、diff 判断或安装包来源判断。

修改 frontend/native plugin 时必须修改仓库源码，不得把已安装运行目录或构建产物当作长期
修复位置。`dist/`、`build/`、`export/`、`plugin-out/`、`app-data/plugins/**`、
host-served `frontend/plugins/**` 仅作为验证/部署产物，除非该仓库明确将其作为源码。
若为紧急诊断临时修改产物，验收/提交前必须回写到源码，并排除产物补丁。

### 8. 验证证据必须闭环

每个 `plan.md` 都应识别合适验证方式：build、unit、integration、smoke、UI flow、
virtual-device、real-device、manual review 或 downstream consumer verification。
无法执行验证时，必须记录 gap 和明确后续动作。

### 9. 编码与本地化边界必须显式

Native string encoding、UTF-8 conversion、localized display text 和 protocol field
encoding 必须在文档化边界处理。不得在无关层级增加 ad hoc conversion。

### 10. 本地 Spec 分支工作流

每个 Spec 都必须从本地 `NNN-short-name` Spec branch 开始。当任务涉及多个仓库时，
每个受影响仓库都必须使用同名本地 Spec branch。Spec Kit 不得 push branches、
创建 remote tracking branches，或依赖 GitHub issue generation。Spec workflow
在通过用户验收、必要提交完成、每个受影响仓库都将本地 Spec branch 的提交
cherry-pick 回配置的 base branch 后才算完成；默认保留本地 Spec branch，不删除。
任何 agent 在执行 commit 或 cherry-pick branch completion 这类仓库状态变更命令前，
都必须请求并获得用户明确确认。

## 项目结构指引

宪章描述边界，而不是冻结的目录树。每个 `plan.md` 必须识别当前能力实际影响的
模块和文件 ownership，例如 SDK headers、NativePlugin/ServiceBridge bridge implementation、
frontend plugin code、scripts、generated assets、tests 或 documentation。

## 治理

- 当宪章与生成模板默认规则冲突时，以宪章为准。
- 当 `ai/rules/*` 与宪章冲突时，以宪章为准，并记录待人工修订项。
- 修订宪章必须摘要说明变更原则、受影响产物和预期迁移影响。
- 原则变更后，应重新检查既有 feature specs 和 plans。
- 任何原则例外都必须记录在 `plan.md` 的 complexity 或 risk tracking 中。
- L0.5 项目事实文件位于 `ai/knowledge/*` 与 `.specify/memory/*`。AI 只能在有来源证据、
  变更原因、验证证据和人工批准时推广长期事实。

**Version**: [CONSTITUTION_VERSION] | **Ratified**: [RATIFICATION_DATE] | **Last Amended**: [LAST_AMENDED_DATE]
