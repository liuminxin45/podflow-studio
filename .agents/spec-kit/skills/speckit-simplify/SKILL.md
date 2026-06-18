---
name: "speckit-simplify"
description: "Simplify accepted CoreRuntime code changes while preserving behavior and validation evidence."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/simplify.md"
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

After the user confirms acceptance, run one constrained cleanup pass that makes
the accepted code easier to maintain. This stage is behavior-preserving:
不新增行为, 不扩大 scope, and no requirement changes.

Use the `code-simplifier` subskill for simplification judgment and editing
guidance. Keep this command as orchestration only: acceptance gate, accepted
scope, validation rerun, and quick-acceptance handoff.

## Language Rules

- Human-facing summaries, `progress.md` notes, and quick-acceptance notes use
  Chinese-first style.
- Preserve technical identifiers in their original form.
- Keep validation commands and test names exact.

## Execution Steps

1. Run the prerequisite script and parse `FEATURE_DIR` and `AVAILABLE_DOCS`.
2. Load required context:
   - `FEATURE_DIR/tasks.md`
   - `FEATURE_DIR/progress.md`
   - `FEATURE_DIR/acceptance.md`
   - `FEATURE_DIR/acceptance-checklist.md`
   - `FEATURE_DIR/lessons.md` when present
3. Verify that the previous acceptance stage has explicit user confirmation.
   If there is no confirmation that 验收通过, stop and return to
   `speckit.acceptance`.
4. Inspect the already changed files and the accepted validation evidence.
5. Apply a small simplification pass only inside the accepted write scope.
   - Use the `code-simplifier` subskill.
   - Do not add behavior, requirements, public API, new dependencies, or new
     files unless the new file replaces a worse accepted structure inside the
     same scope and the user has approved the scope change.
6. 重跑 the affected validation commands from `tasks.md`, `progress.md`, or
   `acceptance.md`.
7. Update `progress.md` with:
   - Inspected files.
   - Simplification candidates considered.
   - Simplified files.
   - N/A decision and rationale when no change is useful.
   - Why behavior is unchanged.
   - Validation commands and results.
   - Remaining risk.
8. Update `acceptance.md` or append a quick-acceptance note when the user must
   re-check a changed surface.
   - If no product code changed during simplify, record the N/A rationale and
     reuse the existing user acceptance as quick acceptance; do not ask the user
     to reconfirm unchanged behavior.
9. Continue to quick acceptance; do not commit, merge, delete branches, push,
   or create remote tracking.

## Quality Rules

- If simplification would change behavior, stop and report it as a separate
  follow-up, not part of this stage.
- If validation fails after simplification, either fix within the same accepted
  scope or revert only your simplification changes. Do not revert unrelated
  user or teammate work.
- If no useful simplification exists, record N/A in `progress.md` and continue
  to quick acceptance. Keep this as a lightweight `progress.md` section; do not
  create a separate simplification document unless the evidence is too large
  for the progress entry.

## Output

Report in Chinese:

- Simplified files, or N/A reason.
- Behavior-preservation rationale.
- Validation rerun commands and result.
- Updated `progress.md` path.
- Required next stage: quick `speckit.acceptance` to confirm the accepted
  behavior still passes after simplification.
