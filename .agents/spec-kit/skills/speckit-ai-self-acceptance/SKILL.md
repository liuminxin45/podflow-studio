---
name: "speckit-ai-self-acceptance"
description: "Judge AI-owned validation after code changes before human acceptance."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/ai-self-acceptance.md"
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

Run the mandatory AI self-acceptance loop after code changes. This is a
judgeable gate: collect evidence, score `acceptance-rubric.md`, write
`validation.md`, and return `PASS`, `FAIL`, or `BLOCKED`. Human acceptance may
start only after `PASS` or a true external blocker.

## Required Inputs

- `plan.md` `AI Context Contract`
- `acceptance-rubric.md`
- `quality-vision.md` for UI/UX work
- selected gate packs from `select-gates`
- `progress.md`, `validation.md`, `evidence.md`, and `fact-pack.md` when present

## Evidence Menu

Use only evidence required by the plan, selected gates, rubric, and changed
surface:

- build/test results and regression tests
- API/network payload and response checks
- real host CDP `/json/list`, selected target id/title/url/webSocketDebuggerUrl
- key-path CDP screenshots saved under `FEATURE_DIR/cdp-screenshots/`,
  screenshots-index.md, visual comparison, DOM, console, network, computed
  style, box metrics, scrollbar/clipping/overflow geometry
- source edit -> build -> runtime replacement -> host verification evidence
- native build/export, runtime sync, proto/native export validation
- latest SDK/Biz logs for runtime/device issues
- device/host smoke when local device, host, and permissions are available

## Judge Steps

1. Confirm the original symptom or target scenario was reproduced or otherwise
   has a valid baseline.
2. Run or inspect the planned validations and selected gate evidence.
3. For every rubric row, assign `PASS`, `FAIL`, `BLOCKED`, or `N/A` and cite
   concrete evidence.
4. Fail immediately when any `Essential` row fails or any `Pitfall` triggers.
5. Treat missing UI baseline, wrong CDP target, missing key-path screenshot for
   UI-visible CDP validation, stale runtime artifact, uninspected console/log
   errors, or unrun feasible smoke as `FAIL`, not a human-acceptance item.
6. Use `BLOCKED` only for external facts the agent cannot fix or obtain:
   unavailable device, missing permission, unknown unsafe process owner, missing
   owner decision, or unavailable tool after recovery attempts.
7. Write `validation.md` `AI Self-Acceptance` / `AI Acceptance Result` with the
   rubric row results, blockers, evidence links, and next action.
8. Do not output final Rubric scores here. Record criteria coverage and
   triggered pitfalls only; final L1-L5 Rubric scoring is emitted by
   `speckit.rubric-score` after the one post-commit self-check.

## Loop Contract

- `PASS`: continue to `speckit-acceptance`.
- `FAIL`: return to `speckit-implement` or `speckit-fact-layer`; patch source,
  rebuild/sync when relevant, and rerun this skill.
- `BLOCKED`: stop with concrete blocker evidence and `next_required_human_action`.

## Output

Report in Chinese:

- AI Self-Acceptance status: `PASS | FAIL | BLOCKED`.
- Rubric failures or triggered pitfalls.
- Evidence collected, including CDP target, screenshot directory, and logs when
  used.
- Rubric criteria coverage and explicit note that final scoring is deferred
  until post-commit self-check.
- Next workflow stage.
- `next_required_human_action` only for true blockers or human acceptance.
