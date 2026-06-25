# Implementation Plan: Discover Page Fixed-Version Workflow and AI Translation

**Branch**: `003-discover-page-ai-translate` | **Date**: 2026-06-25 | **Spec**: `specs/003-discover-page-ai-translate/spec.md`
**Input**: Feature specification from `specs/003-discover-page-ai-translate/spec.md`

## L2 Artifact Contract

Required sections for L2 are: `人类审核摘要`, `概览`, `分流对齐`,
`AI Context Contract`, `Root Cause Evidence`, `技术上下文`, `影响模块与边界`,
`Quality Vision Link`, `测试用例计划`, `Acceptance Rubric Link`,
`Implementation Slices`, `验证计划`, and `AI Self-Acceptance Contract`.

This plan is the decision map for the Discover page implementation. Command results are recorded in `progress.md` and `validation.md` after implementation.

## 人类审核摘要

该摘要只用于人工导航，不得替代或删减后续 AI/流程读取区。

- 目标: 让发现页符合固定 TrendRadar v6.10 适配策略，补齐清空列表、失败来源明细、英文素材 AI 翻译能力。
- 实际范围: `src/components/DiscoverPanel.tsx`, `src/types/trendradar.ts`, `src/App.tsx`, `src/index.css`, `engine/bridge.py`。
- 主要风险: TrendRadar v6.10 只返回失败来源 ID，不能伪造具体错误原因；AI 翻译必须保留原文。
- 验证入口: `npx tsc --noEmit --pretty false`, `python -m py_compile engine\bridge.py`, `npm run build`, `npm install`。
- 下一阶段: `speckit-analyze` / `speckit-checklist` / `speckit-implement` 证据补全后进入 AI 自验。

## 必需人工决策

- N/A

## 概览

发现页将从“可跟随上游更新”的 UI 调整为“固定版本适配”的采集工作台：删除 TrendRadar 更新检查和返回按钮，新增当前采集列表清空，失败来源计数支持查看 ID/name/type 明细，纯英文素材支持通过已有 Discover LLM 配置一键翻译并标识已翻译状态。

## 分流对齐

- task_type: new-feature
- delivery_profile: standard-bugfix
- risk_level: medium
- risk_flags: UI-visible, bridge-metadata
- affected_repositories: auto-podcast
- selected gate packs: `ui-baseline` required; `frontend-runtime-sync`, `host-cdp`, `plugin-package`, `native-bridge`, `qt-parity` N/A for this Electron app source change.
- selected knowledge guides: `inspect-validation-capabilities`; `ai/knowledge/build/validation-capabilities.yml` was selected but absent.

## AI Context Contract

### Required Facts

| Fact | Source or Command | Why Needed | Status |
|------|-------------------|------------|--------|
| Discover page owns collection state and controls | `src/components/DiscoverPanel.tsx` | Identify exact UI write scope | known |
| App passes Discover callbacks | `src/App.tsx` | Remove deleted update/back props safely | known |
| TrendRadar bridge emits `failed_sources` IDs | `engine/bridge.py` | Decide truthful failed-source details | known |
| TrendRadar v6.10 does not expose per-source error details through adapter | `engine/bridge.py`, local TrendRadar crawler call path | Avoid invented failure reasons | known |
| LLM calls already exist | `src/services/llmService.ts`, `src/services/settings/llmConfigResolver.ts` | Reuse existing AI config and service | known |
| No deterministic E2E runner discovered | `inspect-validation-capabilities.ps1 -Json` | Mark E2E N/A with reason | known |

### Context To Load

| Context | Trigger | Reason |
|---------|---------|--------|
| `src/components/DiscoverPanel.tsx` | Implement slices 1-3 | Main visible behavior |
| `engine/bridge.py` | Implement slice 2 | Metadata normalization |
| `src/types/trendradar.ts` | Implement slices 2-3 | Shared type contract |
| `src/App.tsx` | Remove deleted props | Parent callback cleanup |
| `src/index.css` | UI indicator/detail styling | Compact Ant Design UI polish |

### Context To Avoid

| Context | Reason |
|---------|--------|
| `engine/trendradar/` source edits | External locked repository, not durable app source |
| `dist/` | Build output, not source |
| Broad workspace scans | Affected files are known and bounded |

### Missing Context / Blockers

- N/A

## Root Cause Evidence

- Symptom: 发现页仍暴露 TrendRadar 更新检查和返回按钮，缺少清空当前采集、失败来源明细和采集条目 AI 翻译。
- Call Path: `App` renders `DiscoverPanel`; `DiscoverPanel` renders controls and item list; `engine/bridge.py run_once` returns `TrendRadarMeta`.
- Evidence: Source inspection showed `DiscoverPanel` had `onCheckUpdate`, update button, update state, and back button; `engine/bridge.py` only returned `failed_sources` IDs.
- Excluded Alternatives: 不修改锁定的 `engine/trendradar/`；不在 UI 伪造具体网络错误；不新增独立 AI 服务。
- Counterexample: 删除 UI 控件但不清理 props/state 会触发 `noUnusedLocals`; 只显示失败数量仍无法满足明细需求。
- Blast Radius: Discover page state, TrendRadar metadata type, Python bridge metadata only；不改采集算法、不改 NewsNow、不改下游整理 API。
- Validation Mapping: `tsc` 覆盖 props/import/types；`py_compile` 覆盖 bridge 语法；`npm run build` 覆盖前端生产构建；`npm install` 覆盖 postinstall 同步修复。
- Confidence: High for source/build correctness; UI click behavior requires human smoke because no E2E runner is available.

## 技术上下文

- Existing pattern/API/helper to reuse: Ant Design controls, `llmConfigResolver.getLLMConfig('discover')`, `llmService.call`, current `TrendRadarMeta`.
- Source behavior or design source: Existing DiscoverPanel dense tool layout; fixed TrendRadar lock at v6.10.
- Build/package/runtime facts: `npm run build` uses `tsc` + Vite; `npm install` postinstall syncs TrendRadar and NewsNow.
- External constraints: `engine/trendradar/` and `engine/newsnow/` are ignored external synced repos; durable fixes stay in app source, scripts, overlays, or lock files.

## 影响模块与边界

| Repository | Files / Areas | Responsibility | Write Scope | Forbidden Scope |
|------------|---------------|----------------|-------------|-----------------|
| auto-podcast | `src/components/DiscoverPanel.tsx` | Discover page UI and state | Remove/update controls, add clear/detail/translation UI | unrelated workflow panels |
| auto-podcast | `src/types/trendradar.ts` | Shared metadata/item types | Optional failure detail and translation fields | public unrelated settings types |
| auto-podcast | `engine/bridge.py` | Adapter metadata | Map failed IDs to source detail records | edit locked TrendRadar source |
| auto-podcast | `src/App.tsx` | Parent callback wiring | Remove deleted Discover props | workflow state architecture changes |
| auto-podcast | `src/index.css` | Focused Discover UI styles | Compact tag/modal/status styling | global redesign |

## UI 展示、Biz 转发与 Libs 事实边界

- `CoreRuntime` runtime/business facts: N/A
- `ServiceBridge` forwarding APIs: N/A
- Frontend display composition: `DiscoverPanel` owns visible controls, detail modal, translated-item tag, and clear-list state.
- UI must not infer/cache: UI must not infer specific failure reasons beyond failed source IDs/name/type.
- Refresh/event timing: Clear list affects current page session only; new collection overwrites with fresh bridge result.

## Identity / State / API Boundary

- Cross-boundary identity: TrendRadar item identity remains `trendradar_id` or existing fallback.
- Runtime state owner: Current collection state is local `DiscoverPanel` state until proceeding to organize.
- API/DTO/field owner: `TrendRadarMeta.failed_source_details` and item translation fields are optional UI-facing DTO extensions.
- Legacy/debug/test API handling: Existing Electron TrendRadar update APIs may remain available elsewhere, but DiscoverPanel no longer uses them.

## Gate Pack Plan

| Gate | Why Selected | Required Evidence | Missing Facts |
|------|--------------|-------------------|---------------|
| `ui-baseline` | Visible Discover page changes | Existing UI source, `quality-vision.md`, build validation | No runtime screenshot automation available |
| `frontend-runtime-sync` | Selected by script but not applicable | N/A for main Electron app source | N/A |
| `host-cdp` | Selected by script but not hard-applicable | N/A; no host-embedded plugin target | N/A |
| `plugin-package` | Selected by script but not applicable | N/A; no `.plugin` artifact | N/A |
| `native-bridge` | Selected by script but not applicable | N/A; Python metadata only | N/A |
| `qt-parity` | Selected by script but not applicable | N/A; no Qt migration | N/A |

## Source Behavior Execution Map

N/A. This is not Qt-to-frontend migration work.

## UI / UX / 文案 Evidence Gate

| Visible Change | Evidence Source | Target Selector/Component | Status |
|----------------|-----------------|---------------------------|--------|
| Remove update/back controls | `DiscoverPanel` header source | `.discover-actions` | planned |
| Add clear current collection | `DiscoverPanel` toolbar source | `.discover-toolbar` | planned |
| Add failure detail modal | `DiscoverPanel` status grid + modal | `.discover-status-grid`, `.discover-failed-source-list` | planned |
| Mark translated entries | `DiscoverPanel` item card source | `.discover-item h3`, `.discover-translation-tag` | planned |

## Quality Vision Link

- `quality-vision.md`: `specs/003-discover-page-ai-translate/quality-vision.md`
- Quality tier: polished
- UI baseline status: ready; existing Ant Design dense tool surface retained.

## 宪章检查

- Simplicity: pass, no new service boundary.
- Source truth: pass, source files only.
- Test-first planning: pass, test rows defined.
- Integration: pass, failure detail truthfulness recorded.
- Observability: pass, validation evidence planned.

## 测试用例计划

| ID | Type | Scenario/Requirement | Test Intent | Target Path/Command | Fixture/Data | Review Status |
|----|------|----------------------|-------------|---------------------|--------------|---------------|
| TP-001 | interface-test | Fixed-version UI removes update/back controls | Ensure props/imports/buttons are removed | `npx tsc --noEmit --pretty false`; source review | DiscoverPanel source | approved-by-ai-obvious |
| TP-002 | interface-test | Clear current collection | Ensure items/meta/selection/filter reset | `npm run build`; source review | current list state | approved-by-ai-obvious |
| TP-003 | interface-test | Failed source details | Ensure IDs map to name/type and no reason is invented | `python -m py_compile engine\bridge.py`; source review | `failed_sources` IDs | approved-by-ai-obvious |
| TP-004 | interface-test | AI translate pure-English entries | Ensure only eligible entries are sent and originals preserved | `npx tsc --noEmit --pretty false`; source review | English item payload | approved-by-ai-obvious |
| TP-005 | N/A | E2E UI automation | No deterministic E2E runner discovered | `inspect-validation-capabilities.ps1 -Json` | N/A | owner-approved-gap not required; unsupported by local capability |

## Acceptance Rubric Link

- `acceptance-rubric.md`: `specs/003-discover-page-ai-translate/acceptance-rubric.md`
- Essential gate count: 5
- Pitfall count: 5

## Implementation Slices

| Slice | Goal | Allowed Write Scope | Forbidden Scope | Validation | Stop Condition |
|-------|------|---------------------|-----------------|------------|----------------|
| 1 | Remove fixed-version update/back controls and add clear collection | `DiscoverPanel.tsx`, `App.tsx`, `index.css` | unrelated panels, Electron APIs | `npx tsc --noEmit --pretty false` | props/import/build errors or UI scope expansion |
| 2 | Normalize failed source details | `engine/bridge.py`, `src/types/trendradar.ts`, `DiscoverPanel.tsx` | locked TrendRadar source | `python -m py_compile engine\bridge.py`; `npm run build` | any invented error reason or bridge syntax failure |
| 3 | Add AI translation and translated marker | `DiscoverPanel.tsx`, `src/types/trendradar.ts`, `index.css` | new AI service or downstream workflow refactor | `npx tsc --noEmit --pretty false`; `npm run build` | original text not preserved or non-English sent |
| 4 | Validate install/build and record evidence | specs progress/validation files | product code churn after validation unless failure found | `npm install`; `npm run build` | postinstall/build failure |

## Supporting Artifacts

- `quality-vision.md`
- `acceptance-rubric.md`
- `analysis.md`
- `checklists/implementation-readiness.md`
- `progress.md`
- `validation.md`
- `acceptance.md`
- `acceptance-checklist.md`

## 兼容性与迁移风险

- Compatibility risk: Optional metadata fields are additive; deleted Discover props are internal.
- Migration risk: None for persisted config; clear-list only affects current local panel state.
- Rollback or containment: Revert DiscoverPanel/App/type/bridge/CSS changes on this branch.

## 验证计划

| Validation | Command / Tool | Evidence Location | AI-Owned? |
|------------|----------------|-------------------|-----------|
| TypeScript check | `npx tsc --noEmit --pretty false` | `progress.md`, `validation.md` | yes |
| Python bridge syntax | `python -m py_compile engine\bridge.py` | `progress.md`, `validation.md` | yes |
| Production frontend build | `npm run build` | `progress.md`, `validation.md` | yes |
| Postinstall sync | `npm install` | `progress.md`, `validation.md` | yes |
| Manual UI smoke | User acceptance checklist | `acceptance-checklist.md` | no |

## AI Self-Acceptance Contract

- Judge skill: `speckit-ai-self-acceptance`
- Rubric source: `acceptance-rubric.md`
- Required evidence: source diff, `tsc`, `py_compile`, `npm run build`, `npm install`, E2E N/A rationale.
- PASS condition: all essential rubric rows PASS with no triggered rejection triggers.
- FAIL loop target: `speckit-implement`
- BLOCKED condition: unavailable external UI automation or product decision that cannot be inferred from repo/user request.

## 项目结构说明

- Existing files reused: `src/components/DiscoverPanel.tsx`, `src/App.tsx`, `src/types/trendradar.ts`, `engine/bridge.py`, `src/index.css`.
- New focused files: Spec Kit artifacts under `specs/003-discover-page-ai-translate/`.
- Generated/runtime artifacts excluded: `dist/`, `engine/trendradar/`, `engine/newsnow/`.

## 复杂度跟踪

- N/A
