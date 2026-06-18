---
name: "speckit-rubric-score"
description: "Generate and validate the final Spec Kit Rubric score after post-commit self-check."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/rubric-score.md"
---


## User Input

```text
$ARGUMENTS
```

## Context Contract

Default context is `AGENTS.md`, `.specify/workspace.yml`,
`.specify/memory/repository-map.md`, `.specify/feature.json` when present, and
`ai/workflows/task-routing.md`. Read the active feature evidence only after the
single post-commit self-check is complete.
Load `ai/knowledge/*`, `ai/tools/*`, `ai/templates/*`, old `specs/*`, or
design-history docs only when this command explicitly needs them.
Scripts provide `facts`, `blockers`, `unknowns`, and `hints`; LLM owns semantic
routing, root-cause judgment, validation sufficiency, and tradeoff decisions.

## Stage Continuation Rule

Apply the central Stage Continuation Contract from
`ai/workflows/task-routing.md`; if this stage cannot execute the next required
stage, report `blockers` and `next_required_human_action`.

## Purpose

Output the final workflow Rubric score only after post-commit self-check. The
score is a hard gate for `speckit.complete-branch`.

## Scoring Rules

Use 0-100 for every dimension and compute the weighted total:

| Dimension | Weight | Required Evidence |
| --- | ---: | --- |
| L1 功能与需求闭合 | 0.30 | Requirements, acceptance items, user confirmation, and scoped source changes are closed. |
| L2 验证与证据 | 0.25 | Build/test/API/E2E/CDP/log/runtime/plugin package evidence is sufficient or has true blockers. |
| L3 工作流阶段合规 | 0.25 | Stage order, mandatory artifacts, retrospective, self-check, and final Rubric timing are compliant. |
| L4 交付与仓库状态 | 0.10 | Commit/amend state, dirty classification, message validation, and complete-branch readiness are safe. |
| L5 上下文与自动化治理 | 0.10 | Minimal context, selected knowledge/skill/gates, scripts first, and no temporary guessing. |

Hard gates:

- `AI Self-Acceptance = PASS`.
- `retrospective.status = completed`.
- API/E2E plan exists, or E2E has explicit `N/A` reason.
- Applicable plugin changes have `.plugin` build/package evidence.
- CDP/host/runtime gates have selected target, screenshot/DOM/log evidence, or
  true blocker.
- Commit message validation passed.
- Post-commit self-check completed.

Block `complete-branch` when:

- Any hard gate fails.
- Weighted total is below 90.
- Any dimension is below 80 without a blocker or owner/user accepted-gap
  evidence.
- The Rubric output lacks scores, evidence paths, deduction reasons, hard-gate
  conclusion, or complete-branch allow/deny conclusion.

## Execution Steps

1. Confirm post-commit self-check completed.
2. Generate `rubric-score.md`, or write the final Rubric section into
   `validation.md`, using final commit/amend state.
3. Run `validate-rubric-score`.
4. If blocked, fix deterministic evidence gaps or report blockers. If a fix
   amends the commit, do not run another self-check; regenerate and validate
   the Rubric against the final state.

## Output

Report in Chinese:

- L1-L5 scores and weighted total.
- Overall Weighted Score.
- Evidence paths.
- Deduction reasons.
- Hard-gate conclusion.
- Whether `speckit.complete-branch` is allowed.
