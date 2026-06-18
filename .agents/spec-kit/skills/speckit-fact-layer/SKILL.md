---
name: "speckit-fact-layer"
description: "Collect runtime, log, source, and artifact facts before repeated or evidence-poor fixes."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/fact-layer.md"
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

Create or update `FEATURE_DIR/fact-pack.md` from concrete project facts before
AI continues a repeated or evidence-poor fix. This command is mandatory before a
second same-class fix when the first patch did not change the observed symptom,
when UI runtime structure contradicts source assumptions, or when device state,
permission, connection, acquisition, SDK, Biz, or plugin behavior cannot be
localized from source alone.

## Fact Sources

- Local logs are read from disk. Do not use MCP for log files.
- SdkConsumer log default directory: `<system-temp>/SDKLog`
- SdkConsumer log pattern: `SDK_*.log`
- CoreRuntime/Bridge log default directory: `<system-temp>/ServiceBridgeLog`
- CoreRuntime/Bridge log pattern: `ServiceBridge_*.log`
- Logs are usually generated after the HostApplication process exits. Use the
  latest file in each directory unless a user-supplied timestamp narrows the
  search.
- Chrome runtime facts use chrome-devtools when available. Use it for DOM,
  console, computed style, and box metrics, not for local log files.
- If Chrome DevTools MCP is present but cannot select the desired Electron
  target, use the direct CDP fallback from `collect-fact-layer.ps1`: query
  `/json/list`, select the HostApplication page target by URL/title pattern,
  and run `Runtime.evaluate` through the target WebSocket.
- HostApplication development CDP default is `http://127.0.0.1:9222`, usually
  enabled by running `<host-app-root>` `npm run debug`
  (`UTILITY_CHROME_REMOTE_DEBUGGING_PORT=9222`). For host app or frontend-plugin
  validation, prefer targets matching `app-home`,
  `app-main-window`, or `frontend/static/index.html`; reject DevTools,
  Plugin Workbench, blank Chrome, and unrelated targets as host app evidence.
  For `plugin-host` DevTools / Plugin Workbench changes, select
  `Plugin Workbench|plugin-workbench.html` instead; the workbench target is
  opened directly by `npm run debug` and is valid evidence only for workbench
  DOM/CSS/click behavior.

## Execution Steps

1. Run the prerequisite script when available and identify `FEATURE_DIR`.
2. Run the fact collector:
   - PowerShell: `.specify/scripts/powershell/collect-fact-layer.ps1 -Json`
   - Optional target override:
     `.specify/scripts/powershell/collect-fact-layer.ps1 -TargetUrlPattern "app-home|app-main-window|frontend/static/index.html" -Json`
   - Workbench target override:
     `.specify/scripts/powershell/collect-fact-layer.ps1 -TargetUrlPattern "Plugin Workbench|plugin-workbench.html" -Json`
3. Record the collector output in `fact-pack.md` using
   `.specify/templates/fact-pack-template.md`.
4. If chrome-devtools is available, inspect the real Electron/HostApplication
   target at `http://127.0.0.1:9222`; do not accept an unrelated blank Chrome
   page as evidence.
   - If MCP is in slim mode and cannot `list_pages` / `select_page`, rely on
     the collector's `devtools.selectedTarget` and `devtools.directCdp` output.
5. For UI work, capture:
   - DOM subtree for the relevant host/container chain.
   - computed style for size, display, position, overflow, flex/grid,
     min/max-height, min/max-width, box-sizing, and padding/margin.
   - box metrics for host panel, plugin root, scroll owner, tree container,
     info panel, headers, footers, and sibling panels.
   - Console errors/warnings.
   - Screenshots and interaction method. For CSS-only hover states, use
     `CSS.forcePseudoState(['hover'])` when `Input.dispatchMouseEvent` does not
     reliably apply Electron hover.
6. For device state/permission/connection/acquisition work, summarize latest
   `SDK_*.log` and `ServiceBridge_*.log` lines that correspond to the user's
   operation timeline.
7. Verify source/runtime consistency:
   - Repository source files changed.
   - Built artifact generated from those source files.
   - Installed plugin/runtime path checked only as evidence, not as edit target.
8. Separate confirmed facts from inferences. Do not write another patch until
   the next fix target is supported by the collected facts.

## Trigger Rules

Run `speckit.fact-layer` when any of these applies:

- A UI parity/layout patch fails or symptoms persist after the first attempt.
- AI is about to make a second same-class fix without new runtime facts.
- DOM/CSS/layout ownership is unclear.
- Scrollbar appearance, clipping, blank area, parent compression, toolbar
  displacement, or sibling resize is involved.
- Device list state differs from SDK/Biz expectation.
- Permission, connected/collecting/disconnected state, virtual device, or
  acquisition behavior differs across UI, Biz, and SDK.
- User says the rebuilt/reinstalled result is unchanged.
- The issue may be caused by editing installed runtime artifacts instead of
  repository source.
- Logs are needed after adding diagnostic logging.

## Output

Report in Chinese:

- `fact-pack.md` path.
- Latest SdkConsumer log path or missing reason.
- Latest CoreRuntime/Bridge log path or missing reason.
- Chrome DevTools target status.
- Whether chrome-devtools MCP was available for DOM / computed style / box
  metrics.
- Confirmed facts.
- Inferences.
- Next implementation target or blocker.
