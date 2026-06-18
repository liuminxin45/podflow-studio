---
name: "speckit-analyze"
description: "Analyze spec.md, plan.md, and optional tasks.md for consistency before implementation."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/analyze.md"
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

Perform a non-destructive consistency review across `spec.md`, `plan.md`, and
`tasks.md` when it exists. For `standard-bugfix`, a complete `plan.md`
`Implementation Slices` section may replace `tasks.md`. Write the prioritized
report to `FEATURE_DIR/analysis.md`; do not change specification, plan, task,
or product files. This stage is auto-capable: it should not become a fixed
manual gate when no blocking issue exists.

For `micro-fix`, analyze the lightweight evidence artifact instead of requiring
the complete `spec.md`/`plan.md`/`tasks.md` set. For `standard-bugfix`, analyze
`plan.md` slices first and require `tasks.md` only when the plan says a separate
L3 artifact is needed. For `blocked-investigation`, analyze whether the
investigation scope is bounded and whether implementation is still blocked.

## Layered Artifact Contract

- Analyze L1 `spec.md`, L2 `plan.md`, and L3 `tasks.md` as separate artifact
  layers when L3 exists. For `standard-bugfix`, verify that L2 `plan.md`
  contains complete implementation slices instead of requiring a separate
  `tasks.md`.
- Use `.specify/templates/layer-manifest.yml` as the stable inventory of required
  per-feature artifacts and required sections.
- Treat `workflow-state.json` as structured state for attempts, validations,
  fact-layer status, acceptance, retrospective, and promotion; do not infer
  those facts from natural-language prose alone.

## Language Rules

- The analysis report is for human review. Write findings, risk summaries,
  questions, and next-step guidance in Chinese-first style.
- The analysis report must start with `## 人类审核摘要`. This section is
  additive only: summarize blocking findings, highest risks, validation gaps,
  current branch/workflow blockers, and suggested next action. It 不得替代或删减
  the detailed finding table, traceability summary, validation gaps, and other
  AI/流程读取区 below.
- Preserve technical identifiers in their original form: file paths, module
  names, class names, function names, APIs, fields, enum/status values,
  commands, and test names.

## Execution Steps

1. Run the prerequisite script and parse `FEATURE_DIR` and `AVAILABLE_DOCS`.
2. Load the first-pass sections named by
   `.specify/templates/layer-manifest.yml` `read_strategies.analyze`:
   - Required sections from `FEATURE_DIR/spec.md`.
   - Required sections from `FEATURE_DIR/plan.md`.
   - Required sections from `FEATURE_DIR/tasks.md` when present; optional for
     `standard-bugfix` with complete plan slices.
   - `.specify/feature.json` routing fields when present.
   - `FEATURE_DIR/workflow-state.json` attempts, validations, and fact-layer
     status when present.
   Expand to full files only when a required section is missing, a traceability
   link references unstated behavior, a blocker depends on exact surrounding
   prose, or a contract/UI inventory/validation mapping is ambiguous.
3. Load only when the first pass requires it:
   - `FEATURE_DIR/intake.md` if routing fields are incomplete.
   - `FEATURE_DIR/review.md`, `progress.md`, or `lessons.md` when a finding or
     resume decision depends on them.
   - `.specify/memory/constitution.md` for constitution compatibility issues.
   - Optional design artifacts listed in `AVAILABLE_DOCS` only when UI/design
     traceability cannot be judged from plan sections.
4. Build traceability:
   - Capability scenarios to requirements.
   - Intake task type to spec, plan, and tasks.
   - Requirements to plan decisions.
   - Plan decisions to tasks.
   - Contracts and validation expectations to tasks.

5. Identify issues:
   - Missing or conflicting requirements.
   - Plan decisions unsupported by the spec.
   - Tasks that implement behavior not planned or specified.
   - Missing or weak `Root Cause Evidence` for bugfixes: Symptom, Call Path,
     Evidence, Excluded Alternatives, Counterexample, Blast Radius,
     Validation Mapping, and Confidence.
   - Bugfix plan/tasks that pre-write a concrete patch before evidence is high.
   - Plans that treat module similarity as sufficient proof without proving the
     current call path and failure mode.
   - Plans that use a `Known Gap` to pass the exact core behavior changed by
     the fix.
   - Fallback/status/permission changes that affect real devices or public
     behavior without a virtual-only guard, compatibility proof, or explicit
     high-risk decision.
   - Compatibility risks without tasks.
   - Device/runtime/encoding/UI display boundaries missing from plan or tasks.
   - `ServiceBridge` implementing business logic instead of forwarding, UI
     label/string-based runtime/permission inference, fake device facts, or
     missing `CoreRuntime` runtime/permission/capability facts.
   - Cross-boundary device identity that is not UUID decimal string, or new
     parallel identity fields such as `deviceIndex`, `deviceId`, `handleId`, or
     `virtualDeviceId`.
   - UUID generation outside `device::identity::generateUUID()`.
   - SDK native id, virtual id, or handle leaking beyond bottom-layer SDK/service
     internals.
   - Frontend business operations using `node.id`, `entityId`, `metadata.uuid`,
     or other fallbacks instead of `node.uuid`.
   - `ServiceBridge` caching device lists, connection/acquisition status, or
     runtime state.
   - Events replacing the truth source instead of triggering refresh from
     `CoreRuntime` snapshot/runtime facts.
   - Functionally equivalent old APIs, debug/test APIs in production Biz
     exports, ambiguous identity names, or build artifacts influencing interface
     or package-source judgment.
   - Interface/data-layer work concentrated into an oversized file instead of
     following existing ownership or adding focused files.
   - Validation gaps.
   - Missing `测试用例计划`, missing review status, or missing API/E2E/interface
     rows or explicit N/A reasons for changed contracts/user flows.
   - Missing `quality-vision.md` or missing UI baseline / owner-approved `N/A`
     for UI/UX/copy/parity work.
   - Missing `acceptance-rubric.md`, missing Essential/Pitfall rows, or criteria
     that are not self-contained enough for AI self-acceptance.
   - Missing `AI Self-Acceptance Contract` in `plan.md` for code-changing work.
   - Missing test-case update or re-run tasks for validated behavior.
   - Missing migration parity tasks for source Qt behavior.
   - UI-interaction or operation-availability migration that lacks Qt source
     behavior coverage, or has coverage items without matching `CoreRuntime`
     facts tasks, `ServiceBridge` forwarding tasks, frontend display tasks,
     validation, or owner-approved gaps.
   - Missing bugfix repro or regression tasks.
   - Missing new-feature acceptance or compatibility tasks.
   - Missing UI design/source directory map for UI-related migration or
     new-feature.
   - Unrelated cleanup or refactor tasks.
   - Missing local spec branch completion path.
   - Missing `Implementation Slices`, 允许写入范围, 禁止范围, validation command,
     progress.md update, or 停止条件.
   - Missing `review.md` human navigation for generated documents.
   - Missing `lessons.md` pitfall capture when the feature exposes reusable
     project traps.
   - Premature promotion into `.specify/memory/pitfalls.md` without user
     confirmation.
   - Remote push, remote tracking, or GitHub issue workflow assumptions.
   - Searches or tasks that default to the whole `workspace_root`, broad
     `find` commands, missing `rg` / `rg --files` bounded alternatives, or
     unbounded explorer/subagent work for simple local lookup.
   - Human review text that asks developers to confirm root cause correctness,
     test sufficiency, fallback/code quality, or ordinary technical plan
     acceptability.

6. Severity:
   - CRITICAL: breaks constitution, public compatibility, runtime truth, or
     makes implementation unsafe.
   - HIGH: blocks correct implementation or validation.
   - MEDIUM: likely causes rework or review confusion.
   - LOW: clarity, wording, or maintainability improvement.

## Report Format

Write this content to `FEATURE_DIR/analysis.md` and also summarize the same
conclusion in the chat response:

```markdown
## 人类审核摘要

- **结论**: [No blocking issues / Blocked / Needs adjustment]
- **阻塞项**: [finding IDs or N/A]
- **最高风险**: [highest reviewer-relevant risk]
- **验证缺口**: [validation/test-case gaps or N/A]
- **工作流状态**: [branch/completion/gate status]
- **建议下一步**: [next speckit stage or required adjustment]

## Specification Analysis Report

| ID | Severity | Area | Location | Issue | Recommendation |
|----|----------|------|----------|-------|----------------|

## Traceability Summary

## Intake Routing Summary

## Validation Gaps

## Test-Case Closure Gaps

## UI Design Directory Gaps

## Suggested Next Action
```

## Output Rules

- Write the report to `FEATURE_DIR/analysis.md`.
- Do not rewrite spec, plan, tasks, checklist, generated source, or product
  artifacts.
- Reference exact files and sections where possible.
- Limit findings to actionable items.
- If no issues are found, say so and list residual risk.
- Report in Chinese.
- If no blocking issues remain, explicitly state the required next stage:
  `speckit.checklist` / `$speckit-checklist`.
- If blocking issues remain, ask the user to confirm whether to adjust
  spec/plan/tasks before rerunning this stage.
- Human review prompt:
  - Only ask the developer for decisions that AI cannot own: product/business
    tradeoffs, owner-approved gaps, external validation, acceptance, commit, or
    branch completion.
  - Do not ask the developer to approve root cause correctness, test
    sufficiency, fallback semantics, or implementation correctness.
  - If root cause, tests, fallback semantics, or implementation correctness are
    uncertain, report a blocking/high finding instead of asking for approval.
  - If no blocking issues remain, continue to the auto-capable
    `speckit.checklist` / `$speckit-checklist`.
