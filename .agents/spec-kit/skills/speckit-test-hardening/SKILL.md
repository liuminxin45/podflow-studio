---
name: "speckit-test-hardening"
description: "Optionally add focused regression protection after acceptance and simplification."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/test-hardening.md"
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

Perform optional extra test-hardening after implementation, acceptance, and
simplification are complete. 必需测试 and required validation belong to
`speckit.implement`; this stage is for 额外测试强化 only when it reduces real
regression risk without inflating the feature scope.

## Language Rules

- Human-facing summaries and `progress.md` notes use Chinese-first style.
- Preserve technical identifiers in their original form.
- Keep commands, test names, fixture names, and paths exact.

## Execution Steps

1. Run the prerequisite script and parse `FEATURE_DIR` and `AVAILABLE_DOCS`.
2. Load:
   - `FEATURE_DIR/tasks.md`
   - `FEATURE_DIR/progress.md`
   - `FEATURE_DIR/acceptance.md`
   - `FEATURE_DIR/acceptance-checklist.md`
   - `FEATURE_DIR/lessons.md` when present
3. Confirm required tests or substitute evidence are already closed by
   `implement`.
   - If required test closure is missing, stop and return to `speckit.implement`.
4. Decide whether optional hardening is worthwhile.
   - Good candidates: a cheap regression test for a high-risk boundary, a
     missing fixture around a bugfix, a contract test for public API behavior,
     or a smoke script that protects a previously manual check.
   - Poor candidates: broad rewrites, unrelated coverage chasing, fragile UI
     snapshots, or tests that require unavailable real hardware without clear
     owner value.
5. If useful, add or adjust the focused test artifact and run the narrowest
   affected verification.
6. If not useful, record optional N/A in `progress.md` with reviewed risk
   areas, existing coverage/evidence, and why extra hardening would add burden
   without reducing meaningful risk.
7. Update `progress.md` with:
   - optional decision.
   - reviewed risk areas.
   - existing coverage/evidence.
   - test files changed or N/A reason.
   - commands run and result.
8. Do not commit, merge, delete branches, push, or create remote tracking.

## Quality Rules

- This stage must not become a second implementation phase.
- Do not change product behavior to make optional tests easier.
- Keep the optional hardening smaller than the feature implementation.
- If the user declines optional hardening, record N/A and continue to commit.
- Keep N/A as a lightweight `progress.md` entry; do not create separate
  hardening documents unless the evidence is too large for progress.

## Output

Report in Chinese:

- optional hardening decision.
- Test artifacts changed, or N/A reason.
- Verification commands and results.
- Updated `progress.md` path.
- Required next stage: `speckit.retrospective` / `$speckit-retrospective`.
