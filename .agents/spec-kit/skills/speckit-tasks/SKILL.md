---
name: "speckit-tasks"
description: "Generate an actionable tasks.md for a CoreRuntime capability from spec and plan artifacts."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/tasks.md"
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

Create `tasks.md` for `full-sdd` or for standard work whose `plan.md` does not
already contain complete implementation slices. Do not create a redundant
task file when a `standard-bugfix` plan already has bounded, executable
`Implementation Slices`.

Verification commands are recommended, but not required. When no command is
available, use a clear verification note.
Also maintain the feature navigation and continuity artifacts:

- `review.md`: human-readable feature navigation and review focus.
- `progress.md`: AI resume entry for slice-by-slice implementation.
- `lessons.md`: feature-local project pitfall candidates. Promote items to
  `.specify/memory/pitfalls.md` only after explicit user confirmation.

For `micro-fix`, keep this stage compressed. Do not expand generic SDD phases
when a lightweight `micro-fix.md` / `progress.md` contract is enough. For
`standard-bugfix`, prefer the slices embedded in `plan.md`; create `tasks.md`
only when the plan explicitly needs a separate execution artifact. For
`blocked-investigation` or `validation-only`, generate only investigation or
validation tasks and do not produce implementation slices.

## Layered Artifact Contract

- This command creates the L3 artifact set from `.specify/templates/layer-manifest.yml`
  only when the selected delivery profile needs a separate L3 artifact.
- Required L3 output for `full-sdd` is `tasks.md`, backed by `progress.md`
  during execution and `workflow-state.json` for structured workflow state.
- For `standard-bugfix`, `plan.md` may be the execution artifact when its
  `Implementation Slices` include target, allowed write scope, forbidden scope,
  validation, search scope, stop conditions, and `progress.md` update rules.
- `tasks.md` must include the `L3 Artifact Contract` section from
  `.specify/templates/tasks-template.md`.
- Every Implementation Slice must include target, allowed write scope,
  forbidden scope, validation, search scope, stop conditions, and `progress.md`
  update rules.

## Language Rules

- `tasks.md` is reviewed and executed by humans and AI agents. Write task
  descriptions, phase summaries, validation notes, and handoff notes in
  Chinese-first style.
- `tasks.md` must include a top `## 人类审核摘要` section for fast human
  review. This section is additive only: it must summarize execution goal,
  priority review items, remaining/blocking tasks, validation entry,
  test-case closure, branch/repository state, and AI execution cautions, and
  不得替代或删减 later AI/流程读取区 such as full tasks, dependencies,
  parallelization notes, validation gaps, and branch completion tasks.
- Preserve technical identifiers in their original form: task IDs, `[P]`,
  `[CSx]`, file paths, module names, class names, function names, APIs, fields,
  enum/status values, commands, and test names.
- Keep input AI-oriented artifacts (`research.md`, `data-model.md`,
  `contracts/`) readable as English-first references; do not translate their
  technical identifiers into Chinese when summarizing them into tasks.

## Execution Steps

1. Run the setup script and parse:
   - `FEATURE_DIR`
   - `AVAILABLE_DOCS`
   - `TASKS_TEMPLATE`

2. Load available artifacts:
   - Required: `spec.md`, `plan.md`.
   - Intake: `intake.md` and `.specify/feature.json` task type when present.
   - Optional: `research.md`, `data-model.md`, `contracts/`, `quickstart.md`.
   - `.specify/memory/constitution.md` if present.

3. Generate `tasks.md` from `TASKS_TEMPLATE`.
   - Ensure the generated file contains `## Implementation Slices`.
   - Every slice must include target, 允许写入范围, 禁止范围, validation command
     or manual check, progress.md update expectation, and 停止条件.
   - Slices should be small enough that `speckit.implement` can finish one
     implementation-validation-record loop before continuing.
   - For bugfixes, read the plan's `Root Cause Evidence`. If confidence is not
     `high`, first slices must gather evidence, reproduce, or add a failing
     regression before any product-code edit.
   - Bugfix slices must explicitly consider `Counterexample`, `Blast Radius`,
     and `Validation Mapping` before they allow product-code changes.

4. Organize tasks by delivery flow:
   - Human review summary near the top. Keep it concise and current; use it to
     surface remaining blockers first without deleting the full task history.
   - Phase 1: Context and boundaries.
   - Phase 2: Shared setup or scaffolding.
   - Implementation Slices: the executable slice loop for the implement stage.
   - Phase 3+: One phase per Capability Scenario in priority order.
   - Final phase: validation, required test-case update, cleanup,
     documentation, `review.md`, `progress.md`, `lessons.md`, acceptance,
     simplify, quick acceptance, optional test-hardening, retrospective/留痕,
     optional promote-lessons, commit, and branch completion handoff.
   - For `migration`, include source Qt behavior review/parity tasks.
   - For `bugfix`, include repro confirmation and regression-test tasks.
   - For `new-feature`, include contract/design acceptance tasks.
   - For UI state/UI interaction/operation availability work, include explicit
     tasks for `ServiceBridge` forwarding-only API, `CoreRuntime`
     runtime/permission/capability facts, and frontend plugin display
     composition. Do not put business logic in `ServiceBridge`.
   - For UI-interaction or operation-availability `migration`, include a blocking
     early task to review the Qt source behavior coverage. If it does not cover
     device type/status dimensions that affect visible/enabled UI behavior,
     tasks must send the workflow back to `specify`/`plan` instead of
     implementing. Do not require a single fixed table; table, grouped list,
     decision table, state machine, or fixture matrix is acceptable if complete.
   - For device identity, runtime state, RPC/N-API, JS/UI, or public API work,
     include blocking tasks for Identity / State / API Boundary: UUID decimal
     string only across boundaries, single `device::identity::generateUUID()`
     owner, SDK native ids/handles internal only, `node.uuid` for frontend
     operations, Biz no runtime caches/state calculation, event refresh only,
     legacy API cleanup, debug/test API isolation, semantic naming, and
     generated artifact ignore/cleanup.

5. For each task, include:
   - Stable task ID.
   - `[P]` only when it can truly run in parallel without touching the same
     files or dependent contracts.
   - Capability scenario tag when applicable, such as `[CS1]`.
   - File path, module, or artifact to change.
   - A concrete outcome.

6. Include validation tasks or validation notes.
   - Use build, unit, smoke, runtime, UI, virtual-device, real-device, or manual
     review evidence as appropriate.
   - If validation cannot run locally, state the gap and who/what must verify.

7. Include test-case update tasks.
   - 必需测试 belongs to `speckit.implement`. After validation passes, each
     capability scenario should have a task to add or update a corresponding
     unit test, regression test, fixture, contract test, smoke case, or other
     reviewable test artifact.
   - Add a follow-up task to re-run the affected tests after the test case is
     added or updated.
   - If automated tests are not feasible, add a task to document the reason and
     the substitute evidence.
   - 额外测试强化 is optional and belongs to `speckit.test-hardening` after
     user acceptance and simplification.

8. Include UI design directory tasks when applicable.
   - For any UI/UX/visible-copy change, include tasks to inspect reliable
     references before implementation: original Qt UI/source/delegate/QSS/
     resource directories, design/mockup/export directories, screenshots,
     target frontend/plugin conventions, and shared asset directories.
   - Include a blocking task that maps every changed icon, tooltip, label, menu
     item, button, layout/style rule, and visible state to its source reference
     and expected implementation. Do not create implementation tasks for UI
     invented without that mapping.
   - If any directory is missing, add a task to resolve the gap before
     implementation or record an owner-approved N/A.

## Task Rules

- Do not create tasks for unrelated cleanup.
- Do not inflate task count by splitting every workflow gate into many tiny
  checklist chores. Group tasks by executable implementation work, validation
  evidence, and closure gates; closure gates should be traceable but should not
  read like product implementation tasks.
- Do not mix unrelated modules into one task when separate ownership would make
  review safer.
- Public interface changes must have downstream impact tasks.
- UI element/order/visibility/enabled/action/permission changes must identify
  which pieces are frontend display composition, which facts come from
  `CoreRuntime`, and which `ServiceBridge` bridge API forwards them.
- UI/UX/copy tasks must not ask the implementer to invent text, icons,
  tooltip style, layout, or interaction behavior. If the source reference is
  absent or contradictory, the task must be investigation/clarification, not a
  product-code edit.
- Interface/data-layer tasks must identify the chosen file/module. If no
  suitable existing file exists, create focused files and note their ownership;
  do not grow a single file with unrelated contract, DTO, adapter, cache,
  permission, and UI responsibilities.
- Multi-repo work must include same-name local spec branch tasks for every
  affected repository listed in `.specify/workspace.yml`.
- The final phase must include delivery closure tasks:
  - Run mandatory `speckit.analyze` and keep `analysis.md` before implementation
    for `full-sdd` or high-risk work.
  - Run `speckit.checklist` and keep
    `checklists/implementation-readiness.md` before implementation for
    `full-sdd` or high-risk work.
  - Implement required validation and required test-case closure before user
    acceptance.
  - Generate `acceptance.md` and `acceptance-checklist.md`.
  - Wait for user confirmation that 验收通过.
  - Run behavior-preserving `simplify` within the accepted write scope and
    rerun affected validation.
  - Ask for quick user acceptance after simplify.
  - Treat `test-hardening` as optional extra protection, not required
    implementation closure.
  - Run mandatory `speckit.retrospective` / 留痕 after quick acceptance and before
    commit; run `speckit.promote-lessons` only for human-approved candidates.
  - Use `commit-message` skill for commits; stage/commit automatically only
    after commit preflight and message validation pass.
  - After commit, run exactly one post-commit self-check, then final Rubric
    scoring; if self-check amends, do not run another self-check.
  - Run branch completion only after retrospective/留痕, commit, self-check, and
    `validate-rubric-score` pass; cherry-pick back to the base branch, 保留 spec
    branch, 不删除 local spec branch by default, and 不 push.
- Migration tasks must preserve or explicitly change source Qt behavior.
- UI-interaction or operation-availability migration tasks must trace every Qt
  source behavior coverage item to an implementation task, test/review task,
  or owner-approved gap.
- Bugfix tasks must include repro and regression closure.
- Bugfix tasks must not encode an unproven patch or unproven fix as an instruction such as
  "change `Unreachable` to `Disconnected`" unless Root Cause Evidence is high,
  the counterexample is handled, and blast radius is guarded. Phrase uncertain
  tasks as investigation or behavior objectives instead.
- New-feature tasks must include new acceptance and compatibility coverage.
- Real device behavior must not be replaced by fake status unless explicitly
  scoped as virtual/simulated.
- `ServiceBridge` tasks must be forwarding-only. UI tasks may implement
  UI-display-specific composition, but must not infer runtime/permission
  truth from labels/strings or persist business state as the source of truth.
- Device identity tasks must not introduce or preserve parallel cross-boundary
  identity fields. Use UUID decimal string across Libs facade, Biz, N-API/JSON/RPC,
  JS, and UI.
- Equivalent old API tasks must remove or migrate the old path; do not leave
  duplicate production entry points unless an owner-approved temporary gap is
  recorded.
- Debug/test validation tasks must use tests or scripts, not production Biz
  exports.
- Encoding conversion tasks must name the boundary where conversion happens.
- Generated tasks must avoid GitHub issue, remote push, and remote tracking
  assumptions. Local spec branches are allowed and expected.
- Generated tasks must keep `review.md`, `progress.md`, and `lessons.md`
  current when those artifacts exist or are created by this feature.
- Do not promote feature-local `lessons.md` items into
  `.specify/memory/pitfalls.md` without explicit user confirmation.

## Search and Slice Budget

- Implementation slices must name the affected repository and bounded search
  scope when additional code reading is needed.
- Do not create tasks that search the entire `workspace_root`. Use
  `rg --files <affected-repo> | rg "name"` or `rg -n "symbol" <known-dir>`.
- Do not use an explorer/subagent for a simple local lookup. If investigation
  is broad enough to need delegation, make it a bounded investigation slice
  with explicit stop conditions.

## Output

Report in Chinese:

- Tasks path.
- Total task count.
- Count by capability scenario.
- Parallelization opportunities.
- Validation gaps.
- Test-case update gaps or explicit N/A reasons.
- Implementation Slices summary and any missing slice stop conditions.
- `review.md`, `progress.md`, and `lessons.md` status.
- Acceptance/simplify/test-hardening/retrospective/commit/complete-branch
  closure tasks.
- Post-commit self-check, Rubric score, branch completion task, 保留 spec branch
  policy, and any repositories that still need manual cherry-pick/completion
  handling due to blockers.
- Required next stage: `speckit.analyze` / `$speckit-analyze`.
- Human review prompt:
  - Only ask for required human decisions: owner-approved gaps, external
    validation inputs, or user acceptance.
  - Do not ask the developer to confirm root cause correctness, test sufficiency,
    fallback quality, task technical correctness, or ordinary plan acceptability.
    If those are uncertain, mark a blocking task or return to
    plan/analyze.
  - If no blocking issue remains, continue to the auto-capable
    `speckit.analyze` / `$speckit-analyze`.
