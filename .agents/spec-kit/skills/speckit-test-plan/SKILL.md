---
name: "speckit-test-plan"
description: "Draft and negotiate API/E2E test-case plans before implementation."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/test-plan.md"
---


## User Input

```text
$ARGUMENTS
```

## Context Contract

Default context is `AGENTS.md`, `.specify/workspace.yml`,
`.specify/memory/repository-map.md`, `.specify/feature.json` when present, and
`ai/workflows/task-routing.md`. This skill is loaded only through
`ai/workflows/skill-routing.yml` when clarify or plan needs a negotiated test
plan. Load team test knowledge with `select-knowledge`; do not load all
`ai/knowledge/*`.
Load `ai/knowledge/*`, `ai/tools/*`, `ai/templates/*`, old `specs/*`, or
design-history docs only when this command explicitly needs them.
Scripts provide `facts`, `blockers`, `unknowns`, and `hints`; LLM owns semantic
routing, root-cause judgment, validation sufficiency, and tradeoff decisions.

## Stage Continuation Rule

Apply the central Stage Continuation Contract from `ai/workflows/task-routing.md`;
if this skill needs human review, report `blockers` and
`next_required_human_action` instead of continuing.

## Purpose

Create the smallest useful test-case plan before implementation. Test cases are
product/contract decisions, not free-form AI coverage. API tests, E2E/interface
tests, regression tests, fixture updates, UI smoke, and manual/device gaps must
trace to scenarios, requirements, or explicit risk.

## Language Rules

- Human-facing summaries and review prompts use Chinese-first style.
- Preserve technical identifiers: API names, paths, commands, test names,
  fixture names, DTO fields, status values, and selectors.

## Execution Steps

1. Load the active `spec.md`; load `plan.md` only when it already exists or the
   caller is the plan stage.
2. Read `.specify/feature.json` routing fields when present.
3. Select context on demand:
   - Read selected `ai/knowledge/build/validation-capabilities.yml` first when
     `select-knowledge` returns it. Use its deterministic API/E2E support facts
     before reading source to discover test commands.
   - If the matrix is missing, stale, or does not include an affected
     repository, run `inspect-validation-capabilities`. For workspace refresh,
     run it with `-Workspace -OutputPath ai/knowledge/build/validation-capabilities.yml`.
   - Run `select-gates` if UI runtime, native bridge, real device, Qt parity,
     or host CDP validation may shape the test plan.
   - Run `select-knowledge` only when repository-map and feature artifacts do
     not identify test locations or command families. Prefer selected guides
     such as validation matrix, repository guides, native bridge, frontend
     runtime, or virtual-device/SDK tests.
   - API plan remains required for affected contracts or interfaces even when
     no executable API test command is detected.
   - E2E unsupported repositories may mark E2E `N/A` with the
     script-provided reason; this never removes the API plan requirement.
4. Build a scenario-to-test map:
   - Each capability scenario or changed requirement gets at least one planned
     validation row or an explicit `N/A` reason.
    - Include `api-test` for public SDK/API, Biz bridge, RPC/N-API, CLI/script,
      DTO/field, or serialized contract behavior when affected.
      If no executable API test command is detected, API test planning is still
      required: record a manual/interface/regression/API row with the best
      available command or validation path.
    - Include `e2e/interface-test` for cross-repo call paths, frontend-to-Biz,
      Biz-to-Libs, host plugin route, or user-visible workflow behavior when
      affected.
      If the current repository does not support E2E, mark E2E `N/A` with the
      script-provided reason; do not use E2E absence to skip the API plan.
   - Include `unit/regression/fixture/smoke/manual/device` only when it reduces
     a named risk or protects a changed behavior.
5. Decide review status:
   - `approved-by-ai-obvious`: no ambiguity; test rows directly follow from
     requirements/risk and can proceed to later human review.
   - `needs-human-review`: choices affect product behavior, public contract,
     hardware/device coverage, fixture semantics, test cost, or accepted gaps.
   - `owner-approved-gap`: use only when the owner explicitly approved a gap.
6. If review status is `needs-human-review`, stop before implementation and
   ask concise choices. Do not continue to implementation until the choice is
   recorded.
7. Update artifacts:
   - In `spec.md`, update `验证预期` or `待确认问题` with the test-plan review
     status when needed.
   - In `plan.md`, add or update `## 测试用例计划` with this table:

```markdown
| ID | Type | Scenario/Requirement | Test Intent | Target Path/Command | Fixture/Data | Review Status |
|----|------|----------------------|-------------|---------------------|--------------|---------------|
```

8. Keep the plan compact. Put raw commands or long test setup notes in selected
   knowledge guides, `validation.md`, or `evidence.md`, not in this section.

## Quality Rules

- Do not invent tests unrelated to specified behavior.
- Do not hide missing API/E2E coverage behind generic validation wording.
- Do not require humans to judge test sufficiency when the mapping is
  deterministic; record `approved-by-ai-obvious` and continue.
- Do stop for human review when multiple valid test strategies imply different
  product/contract risk or accepted gap decisions.

## Output

Report in Chinese:

- Updated artifact path(s).
- Test-case plan review status.
- API/E2E rows added or explicit N/A reasons.
- Selected knowledge/gate context, if any.
- Whether the workflow can continue to `speckit.plan` / `speckit.analyze` or
  must wait for human review.
