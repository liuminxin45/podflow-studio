---
name: "speckit-implement"
description: "Execute approved implementation slices while preserving scope and evidence."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/implement.md"
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

Implement the active capability as a slice loop:

1. Read the approved slice.
2. Patch only its allowed source scope.
3. Run the selected validation and gate packs.
4. Record evidence in `progress.md`.
5. Continue only when validation passes and no stop condition is met.

This stage does not perform user acceptance, simplification, optional test-hardening, commit, branch completion, branch deletion, push, or remote tracking setup.

## Required Inputs

- `FEATURE_DIR/spec.md`
- `FEATURE_DIR/plan.md`
- `FEATURE_DIR/tasks.md` when present
- `FEATURE_DIR/progress.md` when present, otherwise create it before the first slice update
- `.specify/feature.json` routing fields when present
- `.specify/memory/constitution.md` when present

Optional artifacts such as `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `checklists/`, `review.md`, and `lessons.md` are loaded only when the active slice or selected gate needs them.

## Execution Steps

1. Run the prerequisite script and parse `FEATURE_DIR` and `AVAILABLE_DOCS`.
2. Run `validate-feature-artifacts` with stage `implement`.
   - Let the tool infer `delivery_profile`, `risk_level`, and `risk_flags` from `.specify/feature.json`.
   - Stop and return to the named prior stage when required artifacts or sections are missing, including `analysis.md` and `checklists/implementation-readiness.md` for gates that require them.
   - `full-sdd` and high-risk UI/runtime/cross-repo work require analyze/checklist evidence before implementation.
3. Read `## AI Context Contract` in `plan.md` before broad artifact reading.
   - Treat it as the minimal context manifest for decision-critical facts, source/command inputs, selected knowledge guides, selected gate packs, and context to avoid.
   - If the contract is missing, contradicted, or marks required facts as missing, return to `speckit.plan` or fact-layer.
4. Run `select-gates` for stage `implement`.
   - Read only selected `ai/workflows/gates/*` packs.
   - Use selected packs as mandatory evidence gates for their trigger condition.
   - If no gate is selected, continue with this command contract and active artifacts only.
5. Run `select-knowledge` only when repository-map, active artifacts, and selected gate packs still lack repository/domain/build/validation context.
   - Read only returned `ai/knowledge/*` guide paths.
   - Do not load the whole knowledge tree and do not use full-text/BM25 search.
6. Check `Implementation Slices`.
   - Use `tasks.md` when present.
   - For `standard-bugfix`, use complete slices embedded in `plan.md` when `tasks.md` is absent.
   - Each slice must name target, allowed write scope, forbidden scope, validation command or manual check, progress update expectation, and stop conditions.
   - `micro-fix` may use `micro-fix.md` or `progress.md` only when it names changed files, validation, stop conditions, and evidence.
7. Execute one slice at a time.
   - Read nearby code before editing.
   - Preserve user or teammate changes.
   - Modify only allowed source files; never patch runtime/build/export output as the durable fix.
   - Use bounded search from repository-map, affected repositories, known directories, and named symbols/files.
   - Run documented validation plus selected gate evidence.
   - Update `progress.md` with current slice, changed files, validation result, selected gates, remaining risk, and next slice.
8. Respect selected gate packs.
   - `host-cdp`: run `ensure-host-cdp`, confirm `http://127.0.0.1:9222`, inspect `/json/list`, record `webSocketDebuggerUrl`, select `app-main-window` or another valid product target, reject `Plugin Workbench`, `base-win.html`, `devtools://`, and complete the CDP host recovery ladder before manual acceptance. Use the Workbench target only for `plugin-host` DevTools / Workbench itself. Isolated plugin preview is fallback evidence, not primary host evidence.
   - `frontend-runtime-sync`: source edit -> frontend build -> direct runtime replacement -> real host CDP verification; record source-to-runtime mapping, host-served runtime plugin directory, removed stale runtime files, and final `.plugin` package evidence before commit/complete-branch.
   - `plugin-package`: for frontend, native, JS, or integrated plugin work, use `inspect-plugin-build-plan` to find the shared package command and `validate-plugin-package` to verify the final `.plugin` artifact. Local build/export/runtime replacement is not the final plugin delivery gate.
   - `native-bridge`: build/export native source, use `sync-native-runtime-artifacts`, restart host, and run `validate-rpc-proto-bundle` when bridge/proto fields change.
   - `qt-parity`: read `qt-source-behavior-map.md`, record source behavior, and require a Source Behavior Execution Map for cross-layer migration.
   - `real-device`: keep SDK/Biz/device smoke AI-owned until a concrete device, host, permission, or automation blocker is proven.
   - UI parity/layout anchors: dynamic states, scrollbar, clipping, compression, runtime DOM / computed style / box metrics, 0px-level visual repair, simulating core clicks, and best-effort AI self-validation. If the first CSS/layout patch fails, stop guessing CSS and collect facts.
9. Add or update focused regression protection when feasible, then rerun affected tests.
   - If a unit/regression test is not feasible, record the narrowest substitute evidence and why.
10. After any source change or completed slice, load `speckit-ai-self-acceptance`
    through `ai/workflows/skill-routing.yml`.
    - Judge `acceptance-rubric.md` with build/test/CDP/browser/log/runtime
      evidence required by the plan and selected gates.
    - Write `validation.md` AI Self-Acceptance status: `PASS`, `FAIL`, or
      `BLOCKED`.
    - `PASS` may continue to `speckit.acceptance`; `FAIL` loops back to this
      stage or fact-layer; `BLOCKED` requires concrete external blocker evidence.
11. Stop and route back when validation fails, the original symptom persists, scope expands, source behavior is missing, root cause evidence fails, or a user/owner decision is required.

## Implementation Discipline

- Do not invent SDK, device, permission, or status data.
- Do not make global fallback/status/permission changes from a virtual/simulated bug unless the guard is explicit and proven.
- `ServiceBridge` remains forwarding-only; reusable runtime facts belong in `CoreRuntime`, and UI-display composition belongs in frontend plugin source.
- Cross-boundary device identity is UUID decimal string only; do not expose SDK handles, native ids, or parallel frontend ids above their owning layer.
- Generated artifacts and built artifacts such as `dist/`, `build/`, `export/`, `plugin-out/`, app-data, and host-served frontend runtime are validation/deployment artifacts unless a repository explicitly says otherwise.
- Product/plugin changes must not target installed runtime plugin directories as the durable fix.
- Do not commit or rely on `app-data/plugins/**` or `frontend/plugins/**` runtime artifacts. If patched for emergency diagnosis, port the artifact patch to repository source before acceptance; runtime artifacts a durable fix location or commit target is non-compliant.
- If a required repository from `.specify/workspace.yml` is missing, run
  `inspect-workspace-repositories` and block instead of scanning sibling
  repositories to guess an implementation owner.
- Keep encoding/localization conversions at documented boundaries.
- Maintain `review.md` and feature-local `lessons.md` when human navigation or pitfall records change.
- Confirm Root Cause Evidence before bugfix edits when applicable, and use bounded search with `rg`; do not scan the whole `workspace_root` or spawn an explorer for simple lookup.
- UI evidence sources include Qt UI/source/delegate/QSS/resource, product design/mockup/export, tooltip, visible copy, and owner/user decision. Do not substitute a text button for an icon+tooltip; stop for clarify or blocked investigation when evidence is missing.

## Fact Layer Gate

- Before a second same-class fix, run `speckit.fact-layer` and create or update `fact-pack.md`.
- For UI/CSS/layout failures, collect runtime DOM, console, computed style, box metrics, scroll owner, overflow, flex/grid grow/shrink, clipping, compression, and visible bounds with chrome-devtools or equivalent before the next patch.
- For device, SDK, Biz, plugin, connection, acquisition, permission, or status issues, inspect the latest logs from `<system-temp>/SDKLog\SDK_*.log` and `<system-temp>/ServiceBridgeLog\ServiceBridge_*.log`.

## Implementation completion gate

- Do not report `/speckit-implement 完成` and do not continue to
     `speckit.acceptance` while AI-owned validation is still pending.
- A report that lists "宿主运行时验证待执行", "CDP 验证待执行", or "需启动 HostApplication Electron" as normal residual risk is non-compliant.
- When AI changed code, completion requires explicit AI acceptance `PASS` in `validation.md` or an evidence-backed blocker.
- Completion also requires the `speckit-ai-self-acceptance` skill result to be
  reflected in `validation.md`; missing rubric judgment is incomplete work.
- Human acceptance is after AI-owned technical validation. It is not a substitute for fixable CDP/browser/device/build/runtime validation.
- UI self-validation is advisory rather than a hard gate only when lower-level automated tests fully cover behavior and host rendering/event/runtime state is irrelevant.
- If validation fails or the symptom persists, keep the loop inside this stage: collect facts, patch repository source, rebuild, sync runtime output when relevant, and rerun validation until it passes or a real blocker is recorded.

## Output

Report in Chinese:

- Tasks completed.
- Files changed.
- Validation run and result.
- Test cases added or updated, plus rerun result.
- Selected gate packs and evidence.
- `progress.md` slice status and remaining risk.
- `review.md` / `lessons.md` updates when relevant.
- Confirmation that no commit, branch cherry-pick/delete, push, or remote tracking action was performed.
- Remaining gaps or blocked tasks.
- Required next stage: `speckit.acceptance` / `$speckit-acceptance`.
- Human review prompt: do not ask for root cause correctness or test sufficiency; report a blocker instead when those remain uncertain.
