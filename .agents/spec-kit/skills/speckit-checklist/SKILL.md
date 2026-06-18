---
name: "speckit-checklist"
description: "Generate a focused quality checklist for the active CoreRuntime capability."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/checklist.md"
---


## User Input

```text
$ARGUMENTS
```

## Context Contract

Default context is `AGENTS.md`, `.specify/workspace.yml`, `.specify/memory/repository-map.md`, `.specify/feature.json` when present, and `ai/workflows/task-routing.md`.
Load `ai/knowledge/*`, `ai/tools/*`, `ai/templates/*`, old `specs/*`, or design-history docs only when this command explicitly needs them.
Scripts provide `facts`, `blockers`, `unknowns`, and `hints`; LLM owns semantic routing, root-cause judgment, validation sufficiency, and tradeoff decisions.
Keep this command stage-specific. Do not duplicate long-term governance prose here.

## Stage Continuation Rule

Apply the central Stage Continuation Contract from `ai/workflows/task-routing.md`; if this stage cannot execute the next required stage, report `blockers` and `next_required_human_action`.

## Purpose

Create a checklist that tests the quality of the current spec, plan, tasks, or
implementation readiness. A checklist is a review tool, not an implementation
task list. This stage is auto-capable: only blocking checklist items should
stop the workflow.

For `micro-fix`, generate a compressed checklist that verifies the small-fix
contract rather than forcing every full-SDD section. For `standard-bugfix`,
accept complete `Implementation Slices` in `plan.md` and do not require a
separate `tasks.md` unless the plan explicitly chose one. For
`blocked-investigation` or `validation-only`, verify investigation/validation
readiness only.

## Language Rules

- Checklists are human-reviewed artifacts. Write checklist titles, purposes,
  checkbox text, and notes in Chinese-first style.
- Checklists must include a top `## 人类审核摘要` section for fast human
  review. This section is additive only: it must summarize pass/blocked status,
  blocking CHK IDs, highest risks, N/A overview, validation entry, and next
  step, and 不得替代或删减 later AI/流程读取区 such as generation strategy,
  individual check items, evidence notes, and blocking-item details.
- Preserve technical identifiers in their original form: file paths, module
  names, APIs, fields, enum/status values, commands, test names, and workflow
  constants such as `N/A` and `NEEDS CLARIFICATION`.

## Execution Steps

1. Run the prerequisite script and parse `FEATURE_DIR` and `AVAILABLE_DOCS`.
2. Read the first-pass sections named by
   `.specify/templates/layer-manifest.yml` `read_strategies.checklist`:
   - Required sections from `spec.md`.
   - Required sections from `plan.md` when present.
   - Required sections from `tasks.md` when present.
   - `.specify/feature.json` routing fields.
   - Checklist rules matching `task_type`.
   Expand to full files only when an item cannot be answered from required
   sections, runtime evidence/contracts/data-model artifacts are explicitly
   listed, or an N/A judgment needs exact owner-approved wording.
3. Read additional artifacts only when the first pass requires them:
   - `intake.md` if routing fields are incomplete.
   - `research.md`, `data-model.md`, `contracts/`, `quickstart.md` if present
     and explicitly relevant to a selected checklist item.
   - `analysis.md` when validating analyze-stage blockers or residual risk.
4. Determine checklist type from user input.
   - If unspecified, create `implementation-readiness.md`; implementation
     preflight checks this file before high-risk/full-sdd implementation.
5. Create `FEATURE_DIR/checklists/<type>.md`.
6. Use `.specify/templates/checklist-template.md` as the structure.
7. Fill `## 人类审核摘要` from the generated checklist result after deciding
   checkbox status, so human reviewers see blockers before detailed evidence.

## Checklist Focus Areas

Choose only items relevant to the feature:

- Requirement clarity and independent capability scenarios.
- Intake routing: migration, bugfix, new-feature, or needs-routing.
- Interface and compatibility boundaries.
- Affected modules and file ownership.
- SDK, NativePlugin/ServiceBridge bridge, HostApplication, or frontend plugin contracts.
- Runtime/device state, permissions, handles, cache, and refresh behavior.
- Identity / State / API Boundary: UUID decimal string is the only
  cross-boundary device identity; `device::identity::generateUUID()` is the
  only UUID generation owner; SDK native IDs/handles remain bottom-layer
  internals; frontend business operations use `node.uuid`; events trigger
  refresh but never replace `CoreRuntime` as the truth source.
- UI/Biz/Libs layering: `ServiceBridge` only forwards APIs; `CoreRuntime`
  provides non-UI runtime/permission/capability facts; frontend plugin owns
  UI-display-specific structure, order, visibility, availability
  presentation, and action entry composition.
- Interface/data file ownership and avoidance of single-file contract/data
  layer growth.
- Encoding and localization boundaries.
- Validation coverage and known gaps.
- Test-case plan review status: API/E2E/interface/regression/fixture/smoke
  rows are traced to scenarios, requirements, contracts, or explicit N/A
  reasons before implementation.
- Quality vision status for UI/UX/copy/parity work: `quality-vision.md`
  exists, quality tier is recorded, and UI baseline is ready or owner-approved
  `N/A`.
- Acceptance rubric readiness: `acceptance-rubric.md` contains self-contained
  `Essential` and `Pitfall` rows across relevant L1-L4 layers.
- AI self-acceptance contract: `plan.md` names `speckit-ai-self-acceptance`,
  required evidence, PASS condition, FAIL loop, and BLOCKED condition.
- Bugfix Root Cause Evidence: Symptom, Call Path, Evidence, Excluded
  Alternatives, Counterexample, Blast Radius, Validation Mapping, and
  Confidence.
- Semantic safety for fallback/status/permission/device behavior. A known gap
  on the exact changed core behavior is blocking, not a pass.
- Delivery profile correctness: `micro-fix` must be single-repo, small,
  internal, evidenced, locally validated, and free of status/permission/API/
  identity/cross-layer risk.
- Unit/regression test-case update strategy after successful validation.
- Migration parity, bugfix repro/regression, or new-feature acceptance.
- Qt source behavior coverage for UI-interaction or operation-availability
  migration, including device type/status dimensions and visible/enabled rules.
  A single fixed table is not required when grouping, decision tables,
  state-machine notes, fixture matrices, or per-Qt-function rule lists are
  clearer.
- UI design/source directory map for UI-related migration or new-feature.
- UI parity runtime coverage for frontend visual or host-embedded UI work:
  static visual references, dynamic states, exact geometry constraints,
  runtime DOM / computed style / box metrics evidence, scroll owner, host page
  validation, many-item behavior, and scrollbar appear/disappear stability.
- Migration, rollback, and downstream impact.
- Local-only spec branch coverage and absence of remote push / GitHub issue
  workflow coupling.
- Implementation Slices completeness: target, 允许写入范围, 禁止范围, validation
  command or manual check, progress.md update, and 停止条件.
- `review.md` human navigation, `progress.md` resume contract, and `lessons.md`
  feature pitfall capture.
- Acceptance/simplify/test-hardening/retrospective/commit/complete-branch
  closure path, including user acceptance, 留痕, and branch completion that
  keeps the spec branch.

## Output Rules

- Use checkbox items only for verifiable review questions.
- Avoid generic advice that cannot be checked.
- Prefer 8-20 high-signal items over long exhaustive lists.
- Each item should be understandable without reading this command template.
- Treat missing blocking validation or test-case closure as a gate before
  implementation.
- Treat missing `测试用例计划`, missing review status, or ambiguous API/E2E
  test choices as blocking before implementation unless the plan records
  `approved-by-ai-obvious` or an explicit owner-approved gap.
- Treat missing quality baseline for UI/UX/copy/parity work as blocking unless
  `quality-vision.md` records owner-approved `N/A`.
- Treat missing `acceptance-rubric.md`, missing Essential/Pitfall criteria, or
  missing AI self-acceptance contract as blocking for code-changing work.
- Treat missing Implementation Slices or missing progress.md update contract as
  blocking before implementation.
- For bugfixes, treat missing Root Cause Evidence, missing counterexample or
  blast-radius review, or tasks that pre-write an unproven concrete patch as
  blocking before implementation.
- Treat whole-workspace searches, unbounded `find` commands, or simple lookups
  delegated to explorer/subagent as checklist failures unless explicitly
  bounded.
- Treat `needs-routing`, missing migration source behavior, or missing required
  UI design/source directories as blocking unless an explicit N/A reason is
  recorded.
- Treat missing Qt source behavior coverage for UI-interaction or
  operation-availability migration as blocking unless an explicit owner-approved
  N/A reason is recorded.
- Treat missing UI parity runtime evidence as blocking when the task changes
  host-embedded layout, fixed sizes, clipping, scrollbars, blank areas, or
  flex/grid parent-child behavior. Static design files alone are not enough for
  these cases.
- Treat plugin changes made only in installed runtime plugin directories or
  built artifacts such as `app-data/plugins/**`, `frontend/plugins/**`,
  `dist/`, `build/`, `export/`, or `plugin-out/` as blocking unless the same
  change is ported to repository source before acceptance/commit.
- Treat parallel cross-boundary device identities, Biz-side device/runtime
  caches, UUID generation outside `device::identity::generateUUID()`, SDK
  native ID/handle leakage, frontend operation fallbacks such as `node.id`,
  equivalent legacy production APIs, or debug/test APIs in production Biz
  exports as blocking unless an explicit owner-approved gap is recorded.
- Treat missing `speckit.fact-layer` evidence as blocking when the work is a
  second same-class fix, a UI parity patch failed once, DOM/CSS/layout ownership
  is unclear, scrollbar/clipping/compression behavior is involved, device state
  mismatches SDK/Biz expectation, permission/connection/acquisition behavior is
  inconsistent, virtual-device behavior is unclear, or the rebuilt/reinstalled
  result is unchanged.
- For required fact-layer evidence, verify `fact-pack.md`, latest log discovery
  from `<system-temp>/SDKLog\SDK_*.log` and
  `<system-temp>/ServiceBridgeLog\ServiceBridge_*.log`, plus chrome-devtools
  runtime DOM, console, computed style, and box metrics when UI runtime facts
  are needed. Local logs are read directly from disk; do not use MCP for log
  files.

## Output

Report in Chinese:

- Checklist path.
- Checklist type.
- Count of items.
- Any blocking concerns discovered while creating it.
- Required next stage: if no blocking concerns remain, `speckit.implement` /
  `$speckit-implement`; otherwise resolve the concerns and rerun
  `speckit.checklist`.
- Human review prompt:
  - Only ask for product/business decisions, owner-approved gaps, external
    validation inputs, acceptance, commit, or branch completion.
  - Do not ask humans to judge root cause correctness, test sufficiency, or
    fallback/code quality. Mark those as blocking/high when uncertain.
  - If no blocking concerns remain, continue to `speckit.implement` /
    `$speckit-implement`.
