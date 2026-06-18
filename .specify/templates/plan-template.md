# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

## L2 Artifact Contract

Required sections for L2 are: `人类审核摘要`, `概览`, `分流对齐`,
`AI Context Contract`, `Root Cause Evidence`, `技术上下文`, `影响模块与边界`,
`Quality Vision Link`, `测试用例计划`, `Acceptance Rubric Link`,
`Implementation Slices`, `验证计划`, and `AI Self-Acceptance Contract`.

Keep this plan as a decision map. Put detailed runtime facts in `fact-pack.md`,
raw command evidence in `evidence.md`, and durable facts in code or selected
knowledge/gate maps.

## 人类审核摘要

该摘要只用于人工导航，不得替代或删减后续 AI/流程读取区。

- 目标:
- 实际范围:
- 主要风险:
- 验证入口:
- 下一阶段:

## 必需人工决策

- N/A

## 概览

[Summarize the planned implementation in one short paragraph.]

## 分流对齐

- task_type:
- delivery_profile:
- risk_level:
- risk_flags:
- affected_repositories:
- selected gate packs:
- selected knowledge guides:

## AI Context Contract

### Required Facts

| Fact | Source or Command | Why Needed | Status |
|------|-------------------|------------|--------|
|  |  |  | known/missing |

### Context To Load

| Context | Trigger | Reason |
|---------|---------|--------|
|  |  |  |

### Context To Avoid

| Context | Reason |
|---------|--------|
|  |  |

### Missing Context / Blockers

- N/A

## Root Cause Evidence

For bugfix work, fill the fields below. For non-bugfix work, write `N/A` with a
short reason.

- Symptom:
- Call Path:
- Evidence:
- Excluded Alternatives:
- Counterexample:
- Blast Radius:
- Validation Mapping:
- Confidence:

## 技术上下文

- Existing pattern/API/helper to reuse:
- Source behavior or design source:
- Build/package/runtime facts:
- External constraints:

## 影响模块与边界

| Repository | Files / Areas | Responsibility | Write Scope | Forbidden Scope |
|------------|---------------|----------------|-------------|-----------------|
|  |  |  |  |  |

## UI 展示、Biz 转发与 Libs 事实边界

Fill only when UI/Biz/Libs boundaries are relevant; otherwise `N/A`.

- `CoreRuntime` runtime/business facts:
- `ServiceBridge` forwarding APIs:
- Frontend display composition:
- UI must not infer/cache:
- Refresh/event timing:

## Identity / State / API Boundary

Fill only when identity, state, bridge, RPC/N-API, JS/UI, or public API is
affected; otherwise `N/A`.

- Cross-boundary identity:
- Runtime state owner:
- API/DTO/field owner:
- Legacy/debug/test API handling:

## Gate Pack Plan

Use `select-gates` and cite selected gate ids. Do not paste full gate details
here.

| Gate | Why Selected | Required Evidence | Missing Facts |
|------|--------------|-------------------|---------------|
|  |  |  |  |

## Source Behavior Execution Map

Required for Qt-to-frontend migration that crosses UI/Biz/SDK or real-device
state semantics; otherwise `N/A`.

| Source UI Behavior | Native/Biz/SDK Path | State/DTO/API Fact | Frontend Runtime Proof |
|--------------------|---------------------|--------------------|------------------------|
|  |  |  |  |

## UI / UX / 文案 Evidence Gate

Required only for visible UI/UX/copy/style changes; otherwise `N/A`.
For UI parity work, cite the selected `qt-parity` and `host-cdp` gate facts.
Include dynamic states, host constraints, scrollbar, clipping, compression, and
runtime DOM / computed style / box metrics when layout can differ at runtime.
For 0px-level visual repair, include a UI Element Traversal Inventory / 0px Alignment Matrix with baseline anchors and batch patch strategy.

| Visible Change | Evidence Source | Target Selector/Component | Status |
|----------------|-----------------|---------------------------|--------|
|  |  |  |  |

## Quality Vision Link

Required for UI/UX/copy/parity work; otherwise `N/A`.

- `quality-vision.md`:
- Quality tier:
- UI baseline status:

## 宪章检查

- N/A

## 测试用例计划

> 由 `speckit-test-plan` 在 clarify/plan 阶段协商生成。测试用例不能由 AI
> 自由发挥；每行必须追溯到场景、需求、契约或风险。若存在歧义，先停下等待
> 人工审核。

| ID | Type | Scenario/Requirement | Test Intent | Target Path/Command | Fixture/Data | Review Status |
|----|------|----------------------|-------------|---------------------|--------------|---------------|
| TP-001 | api-test / e2e/interface-test / unit / regression / fixture / smoke / manual/device / N/A |  |  |  |  | approved-by-ai-obvious / needs-human-review / owner-approved-gap |

## Acceptance Rubric Link

- `acceptance-rubric.md`:
- Essential gate count:
- Pitfall count:

## Implementation Slices

| Slice | Goal | Allowed Write Scope | Forbidden Scope | Validation | Stop Condition |
|-------|------|---------------------|-----------------|------------|----------------|
| 1 |  |  |  |  |  |

## Supporting Artifacts

Record optional artifact paths only when used: `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`, `fact-pack.md`, `evidence.md`.

## 兼容性与迁移风险

- Compatibility risk:
- Migration risk:
- Rollback or containment:

## 验证计划

| Validation | Command / Tool | Evidence Location | AI-Owned? |
|------------|----------------|-------------------|-----------|
|  |  |  | yes/no |

## AI Self-Acceptance Contract

- Judge skill: `speckit-ai-self-acceptance`
- Rubric source: `acceptance-rubric.md`
- Required evidence:
- PASS condition:
- FAIL loop target: `speckit-implement` / `speckit-fact-layer`
- BLOCKED condition:

## 项目结构说明

- Existing files reused:
- New focused files:
- Generated/runtime artifacts excluded:

## 复杂度跟踪

Record only deviations from existing patterns.

- N/A
