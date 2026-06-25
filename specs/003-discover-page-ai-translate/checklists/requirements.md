# 需求质量检查清单: 发现页采集列表管理与 AI 翻译

**目的**: 验证 `spec.md` 是否足以进入 clarify/plan，并覆盖 UI、新功能、集成和验证边界。  
**创建时间**: 2026-06-25  
**Feature**: `specs/003-discover-page-ai-translate/spec.md`

## 人类审核摘要

- **检查结论**: Pass，规格已覆盖用户提出的 5 个可观察行为和主要边界。
- **阻塞项**: N/A。
- **重点风险**: TrendRadar v6.10 是否提供失败来源明细需实现阶段源码确认；AI 翻译需要现有 LLM 配置降级。
- **N/A 总览**: Qt、设备、native plugin、ServiceBridge、SDK identity 均不适用，因为本任务是 Electron/React 发现页能力扩展。
- **验证入口**: `.specify/scripts/powershell/validate-checklist.ps1 -FeatureDir specs/003-discover-page-ai-translate`
- **下一步**: 进入 `speckit-clarify`，若无阻塞澄清则进入 `speckit-plan`。
- **必需人工决策**: N/A，产品行为由用户请求明确给出。

## 生成策略

- 结构来源：`.specify/templates/checklist-template.md`。
- 规则来源：`.specify/checklist-rules/common.yml` 和 `.specify/checklist-rules/new-feature.yml`。
- 证据原则：每个判断追溯到 `spec.md`、`.specify/feature.json`、`.specify/memory/constitution.md` 或用户当前请求。

## 需求质量

- [x] CHK001 `.specify/feature.json` 已将任务分为 `new-feature`，因为它扩展发现页操作能力而不是迁移或单一 bugfix。
- [x] CHK002 `needs-routing` 不适用；当前 task_type 是 `new-feature`。
- [x] CHK003 `spec.md` 中 CS1-CS4 均可独立理解和验证。
- [x] CHK004 FR-001 到 FR-009 均是可观察、可审核或可测试行为。
- [x] CHK005 待确认问题为 N/A，并说明没有阻塞 plan 的产品决策。

## 工程边界

- [x] CHK006 `spec.md` 已识别 `src/components/DiscoverPanel.tsx`、类型、`engine/bridge.py` 和 Electron IPC 等可能影响模块。
- [x] CHK007 `spec.md` 已覆盖 Frontend State/UI Contract、UI Display Contract、UI Interaction Display Contract，并将 Public SDK/API 标记为 N/A。
- [x] CHK008 `spec.md` 已记录 TrendRadar 明细字段和 AI 配置降级风险。
- [x] CHK008A N/A，任务不涉及 `ServiceBridge`、`CoreRuntime` 或设备操作权限。
- [x] CHK008B `spec.md` 已描述清空、失败来源点击、AI 翻译按钮的 visible/enabled 和反馈要求。
- [x] CHK008C N/A，任务不是 Qt UI interaction migration。

## 运行时与数据完整性

- [x] CHK009 N/A，不涉及 device/runtime/cache/handle/permission behavior。
- [x] CHK010 `spec.md` 已记录 AI 翻译 UTF-8 字符串和原文保留的 localization boundary。
- [x] CHK010A N/A，不涉及 ServiceBridge 或 frontend plugin 推断 runtime/permission 事实。

## 身份 / 状态 / API 边界

- [x] CHK010D N/A，不涉及设备身份。
- [x] CHK010E N/A，不涉及 UUID 生成入口。
- [x] CHK010F N/A，不涉及 SDK native id、virtual id 或 handle。
- [x] CHK010G N/A，不涉及前端设备业务操作。
- [x] CHK010H N/A，不涉及 ServiceBridge runtime state 缓存。
- [x] CHK010I N/A，不涉及功能等价旧 API。
- [x] CHK010J N/A，不新增调试 API 或测试 facade。
- [x] CHK010K N/A，不新增跨层设备身份字段。
- [x] CHK010L N/A，不涉及虚拟设备或真实设备。
- [x] CHK010M `spec.md` 已说明不使用构建产物作为来源；目标为仓库源码。
- [x] CHK010N N/A，不涉及 frontend/native plugin 安装运行目录。

## 结构与文件职责

- [x] CHK010B `spec.md` 已要求实现前确认现有 Discover UI、TrendRadar bridge 和 LLM service。
- [x] CHK010C `spec.md` 已初步拆分 UI、类型、bridge 和 LLM 调用职责。

## 分流专项就绪度

- [x] CHK011 N/A，任务不是 migration。
- [x] CHK012 N/A，任务不是单一 bugfix。
- [x] CHK013 `spec.md` 已说明这是发现页新增操作能力，并给出验收信号。
- [x] CHK014 `spec.md` 已列出 UI 设计来源目录，目标为 `src/components/DiscoverPanel.tsx`。
- [x] CHK014G `spec.md` 的 UI / UX / 文案依据追踪列出所有新增或删除 UI 元素，并以用户明确请求为 owner decision。
- [x] CHK014D `spec.md` 已记录既有 Ant Design 高密度工具界面基线；动态状态将在 plan/quality-vision 中展开。
- [x] CHK014E N/A，当前没有已失败的 CSS/layout patch。
- [x] CHK014H N/A，当前不是 host-embedded plugin UI。
- [x] CHK014F N/A，任务不是 0px 级视觉对齐。
- [x] CHK014A `delivery_profile=standard-bugfix` 与中等风险 UI/AI/bridge 影响面匹配。
- [x] CHK014B N/A，任务不是 bugfix。
- [x] CHK014C `spec.md` 未把 TrendRadar 失败来源 API 实现细节写死，要求实现阶段确认。

## 验证

- [x] CHK015 `spec.md` 已描述 build、UI smoke 和 downstream check。
- [x] CHK016 `spec.md` 已要求至少 TypeScript/Vite build，必要时补充轻量 smoke。
- [x] CHK017 `spec.md` 已要求 test-case updates 后重新运行受影响验证。
- [x] CHK018 无法执行的 UI 自动化验证需在后续 validation 中记录 known gap。
- [x] CHK018A `spec.md` 将搜索范围限制在 `src/`、`engine/bridge.py`、Electron IPC 和相关类型。
- [x] CHK018B N/A，非 host-embedded UI parity。
- [x] CHK018C N/A，非 host-embedded frontend plugin。
- [x] CHK018D N/A，非 native plugin。
- [x] CHK018E N/A，当前规格阶段不要求 host CDP。
- [x] CHK018F N/A，非 Qt-to-frontend UI parity。

## 本地 Spec 分支工作流

- [x] CHK019 当前能力使用本地 Spec branch `003-discover-page-ai-translate`，不需要 remote tracking 或 GitHub issue。
- [x] CHK020 单仓任务，受影响仓库为 `auto-podcast`。
- [x] CHK021 宪章要求 commit 或 cherry-pick 前取得用户明确确认；当前仅进入 plan/implement。
- [x] CHK022 本阶段完成后按 `ai/workflows/task-routing.md` 自动进入 clarify，除非出现 blocker。

## 说明

- 本清单保留适用的强制 CHK，并用 N/A 原因覆盖不相关的设备、Qt、native 和 host-plugin 边界。
