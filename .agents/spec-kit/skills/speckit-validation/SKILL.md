---
name: "speckit-validation"
description: "Run a validation-only Spec Kit path without changing product code."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/validation.md"
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

Use this command when `.specify/feature.json` selects
`delivery_profile: validation-only`. It is for reproducing, auditing, smoke
checking, or regression validation without product-code changes.

## Validation Contract

Create or update these evidence artifacts:

- `FEATURE_DIR/validation.md`: normalized validation summary using
  `ai/templates/validation-template.md`.
- `FEATURE_DIR/evidence.md`: optional tool/test-facing evidence ledger using
  `ai/templates/evidence-template.md` when raw evidence would bloat
  `validation.md`.

`validation.md` must include:

- Scope and affected repositories.
- Commands or manual checks run.
- Expected results.
- Actual results.
- Evidence links or logs.
- Validation Context Contract: decision-critical facts used, evidence sources
  actually loaded, context intentionally not loaded, missing facts, sufficiency
  judgment, and why the evidence is enough for AI acceptance.
- AI Self-Acceptance: rubric rows judged, Essential/Pitfall result, UI baseline
  status, selected CDP/log/runtime evidence, and `PASS | FAIL | BLOCKED`.
- Gaps and who can close them.
- Whether the result changes routing to `micro-fix`, `standard-bugfix`,
  `full-sdd`, or `blocked-investigation`.

## Rules

- Do not edit production code.
- No validation claim is complete without evidence in `evidence.md`,
  `fact-pack.md`, logs, screenshots, named command output, or inline evidence
  links in `validation.md`.
- For host-embedded UI validation, prefer real HostApplication Electron CDP at
  `http://127.0.0.1:9222` after source build and source-to-runtime sync. First
  run `ensure-host-cdp` to reuse an existing valid host, start
  the host when no process owns the port, or identify a port owner before
  declaring a blocker. Do not turn a running process or occupied port into
  manual acceptance until this CDP host recovery ladder has concrete evidence. Then run
  `inspect-host-cdp-target` or inspect `/json/list`; record all
  page target `id/title/url/webSocketDebuggerUrl`, the selected target id, and
  the selected target URL. A note that `9222` is connected is not validation
  evidence. For host app or frontend-plugin validation, select targets matching
  `app-home`, `app-main-window`, or
  `frontend/static/index.html`; reject `Plugin Workbench`, `base-win.html`,
  `devtools://`, blank, and unrelated targets as `wrong-target / insufficient`
  product UI evidence. For `plugin-host` DevTools / Plugin Workbench changes,
  select `Plugin Workbench|plugin-workbench.html`; `npm run debug` opens this
  target directly and it is the primary evidence target for workbench
  DOM/CSS/click smoke. Save key-path screenshots with
  `capture-cdp-screenshot` under `FEATURE_DIR/cdp-screenshots/`; capture the
  baseline/reproduced and final validated states for visible UI behavior, plus
  intermediate dialog/error/hover/scroll states only when they decide
  acceptance. Record `screenshots-index.md` and report the screenshot directory
  to the human when CDP validation ends. If only isolated plugin preview was used, mark it as
  fallback evidence and keep host validation as a gap.
  For frontend plugin source edits, validation must also show the source edit
  -> frontend build -> direct runtime replacement -> real host CDP verification
  chain. Record build command/result, `sync-ui-runtime-artifacts` source/runtime
  dirs, removed stale count, plugin id, and loaded resource evidence from the
  real target, such as `performance.getEntriesByType('resource')` entries for
  plugin entry files and current split chunks. All plugin source edits,
  including frontend, native, JS, and integrated plugin changes, must also
  record final `.plugin` build/package evidence before
  commit/complete-branch. Frontend runtime hot replacement remains validation
  evidence, not final plugin delivery evidence.
  For height, clipping, scrollbar, bottom spacing, detail/footer panel, or
  information-panel validation, include box metrics for plugin root, shell,
  main panel, detail/footer panel, scroll owner, and last visible row/control.
  State whether each relevant bottom edge is `<= window.innerHeight`. Treat
  bare `100vh` in an embedded plugin as a risk requiring measured host-offset
  evidence, not as proof that the layout fits.
- For real-device, connection, acquisition, permission, status, SDK/Biz, or
  host-embedded runtime validation, the agent owns the primary smoke when local
  host and automation tools are available. Start or reuse HostApplication,
  select the real Electron target through CDP/browser automation, execute the
  user flow or equivalent host/API operation, and verify process liveness,
  latest SDK/Biz logs, console errors, and refreshed runtime/UI state. Do not
  mark validation complete by assigning these technical checks to human manual
  acceptance. If the smoke cannot run, record the concrete unavailable device,
  host, permission, or automation condition and route to investigation or a
  visible validation gap.
- If agent-owned smoke fails or the original symptom remains, validation is not
  complete. Return to implementation/investigation, collect fresh CDP/log/runtime
  evidence, adjust source, rebuild/deploy as needed, and rerun the smoke until it
  passes or a concrete blocker is proven. Human review is the final acceptance
  layer after this evidence, not the fallback debugger.
- When code changed, validation-only evidence may supplement but not replace
  `speckit-ai-self-acceptance`. Missing rubric judgment routes back to
  implementation/self-acceptance before human acceptance.
- Keep optional `evidence.md` factual and tool/test-facing.
- When repository-map and active artifacts do not identify enough validation
  commands, smoke routes, host/CDP evidence requirements, or repository-specific
  caveats, run `select-knowledge` for stage `validation` and read only the
  returned `ai/knowledge/*` guide paths, especially `validation-matrix.yml`.
  Do not load the whole knowledge tree and do not use full-text/BM25 search.
- Do not generate full implementation tasks unless validation discovers an
  actionable change and the profile is explicitly re-routed.
- Use bounded search only inside affected repositories and known directories.
- Do not search the whole workspace root.
- Do not commit, merge, push, or mutate branches.

## Output

Report in Chinese:

- `validation.md` path.
- `evidence.md` path when created.
- CDP screenshot directory when CDP was used.
- Checks run and results.
- Remaining gaps.
- Recommended next delivery profile.
