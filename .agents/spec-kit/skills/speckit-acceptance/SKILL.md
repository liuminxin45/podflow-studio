---
name: "speckit-acceptance"
description: "Generate user acceptance instructions and checklist for a completed CoreRuntime capability."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/acceptance.md"
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

Create the user-facing acceptance entry for the active feature after
implementation validation has passed. This stage does not change product code.
It explains how the user should test and how the workflow records whether
验收通过.

## Language Rules

- Write `acceptance.md`, `acceptance-checklist.md`, user-facing summaries, and
  confirmation prompts in Chinese-first style.
- Preserve technical identifiers in their original form: paths, module names,
  APIs, fields, commands, test names, branch names, and repository names.
- Keep AI-oriented evidence such as `progress.md`, optional `tasks.md`,
  validation commands, and test output references readable and unmodified.

## Execution Steps

1. Run the prerequisite script and parse `FEATURE_DIR` and `AVAILABLE_DOCS`.
2. Load required context:
   - `FEATURE_DIR/spec.md`
   - `FEATURE_DIR/plan.md`
   - `FEATURE_DIR/tasks.md` when present; for `standard-bugfix`, `plan.md`
     slices may replace it.
   - `FEATURE_DIR/progress.md` when present
   - `FEATURE_DIR/validation.md` when present
   - `FEATURE_DIR/evidence.md` when present
   - `FEATURE_DIR/fact-pack.md` when present
   - `FEATURE_DIR/review.md` when present
   - `FEATURE_DIR/quickstart.md` when present
   - `FEATURE_DIR/checklists/` when present
3. Confirm implementation status from `tasks.md` when present, otherwise from
   `plan.md` slices and `progress.md`.
   - If blocking implementation tasks remain, stop and report the blocking
     task IDs instead of writing acceptance as passed.
   - If validation is missing, write the gap and require the workflow to return
     to `implement`.
   - If AI changed code and `validation.md` does not contain an explicit AI
     acceptance `PASS` or an evidence-backed blocker, stop and return to
     `implement`. Human acceptance is after AI-owned technical validation; it
     must not be used to debug CDP target selection, runtime sync, host process
     recovery, bridge/proto field loss, or source/build/deploy gaps that the
     agent can still validate.
   - If `acceptance-rubric.md` exists but `validation.md` lacks an AI
     Self-Acceptance rubric judgment, stop and load `speckit-ai-self-acceptance`
     before writing human acceptance.
4. Ensure validation artifacts are visible:
   - `acceptance.md` remains user-facing.
   - `evidence.md` remains tool/test-facing when complex/runtime/tool-heavy
     evidence needs a separate ledger.
   - Create or update `validation.md`, `acceptance.md`, and
     `acceptance-checklist.md` before asking for `用户确认 验收通过`.
   - If validation evidence exists only in `progress.md`, `fact-pack.md`, or
     command output, summarize the concrete evidence references in
     `validation.md`; create `evidence.md` only when raw facts would otherwise
     bloat acceptance or validation.
   - If CDP validation was used, include the local screenshot directory
     `FEATURE_DIR/cdp-screenshots/` and `screenshots-index.md` so the human can
     review the same visual checkpoints.
   - Use `ai/templates/validation-template.md` and
     `ai/templates/evidence-template.md` as structure references when creating
     those files.
5. Classify every proposed verification item before writing acceptance:
   - `AI automated validation`: unit tests, integration tests, modelled thread
     scenarios, CLI/build checks, log assertions, contract checks, or runtime
     evidence the agent can collect and interpret. For UI/UX work, include
     agent-collected screenshots, screenshot comparisons, simulated clicks,
     hover/expand/collapse/scroll flows, DOM/computed/box metrics, and console
     checks when the host and MCP/CDP/browser automation are available. For
     host-embedded frontend plugins, prefer real HostApplication Electron CDP
     evidence at `http://127.0.0.1:9222` with targets matching
     `app-home`, `app-main-window`, or
     `frontend/static/index.html`; isolated plugin preview is fallback evidence.
     CDP screenshots must be saved under `FEATURE_DIR/cdp-screenshots/` rather
     than living only in chat or transient tool output.
     For `plugin-host` DevTools / Plugin Workbench changes, use the direct
     workbench target `Plugin Workbench|plugin-workbench.html` opened by
     `npm run debug`.
     For real-device, connection, acquisition, permission, status, SDK/Biz, or
     host-embedded runtime work, include agent-run host/device smoke whenever
     the local host, device, permissions, and CDP/browser automation are
     available: launch/reuse HostApplication, operate the flow, inspect
     process liveness, latest SDK/Biz logs, console errors, and refreshed
     runtime/UI state.
   - `Human manual UI validation`: GUI smoke checks and user-visible flows that
     cannot be automated with available tools, seeing host rendering when no
     screenshot/DOM automation is available, or confirming real-device presence
     only when the agent has evidence that the device/permission/host target is
     unavailable.
   - `Human product decision`: owner/business judgment, rollout risk, accepted
     gap, or UX/product preference.
   - Internal runtime semantics such as thread model, scheduling, concurrency,
     lifecycle, serialization, error propagation, and timeout behavior must be
     assigned to `AI automated validation` whenever they can be modelled with
     tests or scripts. Do not ask humans to manually verify these by eye.
6. Generate or update `FEATURE_DIR/acceptance.md` with:
   - Feature and branch summary.
   - What changed, grouped by user-visible capability or engineering boundary.
   - Exact user test steps.
   - Expected results.
   - Failure signals and rollback/stop notes.
   - Evidence already collected by the agent.
   - Links to `validation.md` and `evidence.md` when present.
   - Known gaps that need user judgment.
   - `Accepted Gaps`: any known missing validation, unsupported automation,
     product tradeoff, or follow-up scope that the owner/user explicitly accepts
     as not blocking this delivery.
   - For UI parity or host-embedded frontend work, host-level acceptance steps:
     run in the real embedding page/route, verify static visual parity and
     dynamic states, verify many-item and scrollbar appear/disappear behavior,
     and confirm no clipping, blank area, parent/sibling compression, toolbar
     displacement, or unintended resize occurs.
7. Generate or update `FEATURE_DIR/acceptance-checklist.md` with checklist
   items the user can execute directly.
   - Include pass/fail space for each item.
   - Include an explicit final item: "用户确认验收通过".
   - Human checklist items should be limited to observable UI/user smoke,
     real-device availability checks, and product decisions. Command reruns may
     be listed only as optional independent audit, not as the primary way to
     prove AI-owned thread/runtime semantics.
   - Acceptance is the human review layer after agent-owned technical validation.
     If host/device/CDP smoke has not passed, or the symptom still reproduces,
     send the work back to implementation/validation instead of asking the human
     to debug or confirm the technical fix.
   - If the previous stage edited code, the checklist may start only after AI
     validation evidence shows `PASS` for the changed behavior or records a
     true external blocker such as unavailable device, permission, unknown
     process owner, or missing owner decision.
   - Include an explicit failure path: if any item fails, return to
     `speckit.implement` or `speckit.tasks` depending on whether the failure is
     implementation or scope/design.
8. Update `validation.md` when internal/thread/runtime semantics were verified
   by AI: list the scenario model, commands, assertions, and pass/fail result
   there instead of delegating those checks to manual acceptance.
9. Update `review.md` when present so the human navigation page links to
   `acceptance.md`, `acceptance-checklist.md`, `validation.md`, and
   `evidence.md` when those artifacts exist.
10. Do not mark acceptance as passed yourself.
   - If the user already gave pre-confirmed acceptance before this stage ran,
     backfill `validation.md`, `acceptance.md`, and `acceptance-checklist.md`,
     record `pre-confirmed acceptance`, list `Accepted Gaps`, and continue from
     that explicit user signal instead of asking the user to repeat the same
     acceptance.
   - Ask the user to run the checklist and reply with the验收结论.
   - Stop until the user explicitly confirms 验收通过.

## Quality Rules

- Acceptance steps must be executable by a human without reading every design
  artifact first.
- No validation claim is complete without concrete evidence from
  `validation.md`, `evidence.md`, `fact-pack.md`, logs, command output,
  screenshots, or another named artifact.
- UI/UX acceptance should list what the agent already self-validated through
  screenshots, visual comparison, simulated interactions, or runtime metrics
  when those tools were available; unsupported automation remains a visible
  gap, not a blocker by itself.
- UI/UX acceptance must reference `quality-vision.md` baseline status when the
  feature changed visible behavior. Missing baseline is a workflow gap unless
  owner-approved `N/A` is recorded.
- Keep `acceptance.md` user-facing and keep `evidence.md` tool/test-facing when
  `evidence.md` is needed.
- Expected results must be observable, not just "works".
- Failure signals must tell the user what counts as not accepted.
- Do not turn AI-owned technical judgments into manual checklist items. Thread
  model, worker scheduling, timeout/error semantics, parser behavior, contract
  compatibility, and non-UI regressions should be proved by automated or
  modelled validation whenever feasible.
- UI parity acceptance must prefer the real host page over isolated plugin
  preview when layout depends on parent containers or sibling plugins.
- Do not hide validation gaps. If device, UI, real SDK, or multi-repo behavior
  cannot be verified locally, keep it visible in both acceptance files.
- Do not commit, merge, delete branches, push, or create remote tracking.

## Output

Report in Chinese:

- `acceptance.md` path.
- `acceptance-checklist.md` path.
- Existing validation evidence.
- CDP screenshot directory when CDP was used.
- Known gaps or manual checks.
- User-facing checklist summary.
- Required user action: run the checklist and explicitly confirm whether
  用户确认 验收通过.
