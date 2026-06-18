---
name: "speckit-micro-fix"
description: "Execute a lightweight bugfix path when the change is small, internal, evidenced, and locally verifiable."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/micro-fix.md"
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

Use this command when `.specify/feature.json` selects `delivery_profile:
micro-fix`. It replaces the heavy `spec -> plan -> tasks -> analyze ->
checklist` document chain with a compact evidence contract for very small
bugfixes.

This is not a shortcut around engineering judgment. If the fix touches public
API, device identity, runtime status, permission semantics, real-device
behavior, UI/Biz/Libs boundaries, cross-repo behavior, or lacks local
validation, upgrade the profile to `standard-bugfix`, `full-sdd`, or
`blocked-investigation`.

## Required Micro-Fix Contract

Create or update `FEATURE_DIR/micro-fix.md` with:

- `## 人类审核摘要`
  - Goal.
  - Real changed scope.
  - Validation entry.
  - Remaining risk.
  - Required human decisions.
- `## Root Cause Evidence`
  - Symptom.
  - Call Path.
  - Evidence.
  - Excluded Alternatives.
  - Counterexample.
  - Blast Radius.
  - Validation Mapping.
  - Confidence.
- `## Change Plan`
  - Files allowed to change.
  - Files/behaviors forbidden.
  - Minimal implementation objective.
- `## Validation`
  - Commands or manual checks.
  - Expected result.
  - Failure signal.
- `## Acceptance Lite`
  - User-executable steps.
  - Expected observable behavior.
  - Checklist.

Also update `progress.md` as the AI resume entry.

## Execution Rules

- Do not generate full `research.md`, `data-model.md`, `contracts/`, or
  expanded `tasks.md` unless the profile is upgraded.
- Do not ask the user to confirm root cause correctness, test sufficiency, or
  code-level fix quality.
- Ask the user only for acceptance, owner-approved gaps, commit, or branch
  completion.
- Use bounded search only: affected repo, known dirs, `rg`, and `rg --files`.
  Do not search the whole `workspace_root`.
- Do not use an explorer/subagent for simple local lookup.
- Required tests still belong to implementation. Extra hardening remains
  optional after acceptance.
- Do not commit, merge, push, create remote tracking, or delete branches.

## Output

Report in Chinese:

- `micro-fix.md` path.
- Whether the profile remained `micro-fix` or was upgraded, with reason.
- Root-cause confidence.
- Changed/allowed scope.
- Validation to run.
- Acceptance-lite checklist.
- Required next stage: implement and validate the micro-fix, then
  `speckit.acceptance` / `$speckit-acceptance` or `speckit.commit` after user
  acceptance.
