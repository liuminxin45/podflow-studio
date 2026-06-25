# 发现页采集列表管理与 AI 翻译 - Review

## 快速入口

- **Spec**: `specs/003-discover-page-ai-translate/spec.md`
- **Plan**: `specs/003-discover-page-ai-translate/plan.md`
- **Analysis**: `specs/003-discover-page-ai-translate/analysis.md`
- **Implementation Checklist**: `specs/003-discover-page-ai-translate/checklists/implementation-readiness.md`
- **Progress**: `specs/003-discover-page-ai-translate/progress.md`
- **Validation**: `specs/003-discover-page-ai-translate/validation.md`
- **Acceptance**: `specs/003-discover-page-ai-translate/acceptance.md`
- **Acceptance Checklist**: `specs/003-discover-page-ai-translate/acceptance-checklist.md`
- **Workflow Record**: `specs/003-discover-page-ai-translate/workflow-record.md`
- **Improvement Candidates**: `specs/003-discover-page-ai-translate/improvement-candidates.md`
- **当前阶段**: retrospective complete，准备进入 commit。
- **风险等级**: medium。
- **主要目标**: 发现页删除固定版本下不需要的入口，补齐清空列表、失败来源明细和纯英文条目 AI 翻译。

## 重点审核

- TrendRadar 更新检查按钮和返回按钮应从发现页移除。
- 失败来源明细必须来自 TrendRadar v6.10 或本项目接入层可观察数据；没有明细时展示降级说明。
- AI 翻译只处理纯英文且未翻译条目，必须保留原文并显示已翻译标识。

## Workspace Repository Map

- **workspace_root**: `.`
- **default_base_branch**: `main`
- **repository_map**: `.specify/memory/repository-map.md`

| Repository | Path | Role | Capability / Ownership | Why affected |
|------------|------|------|-------------------------|--------------|
| `auto-podcast` | `.` | `electron-react-python-podcast-workbench` | Electron desktop shell, React/Vite authoring UI, Python podcast workflow nodes, shared state/config protocol, TrendRadar bridge, build/test scripts, docs, and runtime output conventions. | 发现页属于 React/Vite UI；失败来源可能需要 TrendRadar bridge 状态字段。 |

## 设计基线

Reading this as: 既有 Electron/React 产品里的发现页定向演进，面向内容采集工作流用户，采用现有 Ant Design + 低动效高密度工具界面。

- `DESIGN_VARIANCE=3`
- `MOTION_INTENSITY=2`
- `VISUAL_DENSITY=8`

## 下一步

用户已确认验收通过；下一步执行 Spec Kit commit、post-commit self-check、Rubric scoring 和 branch completion。
