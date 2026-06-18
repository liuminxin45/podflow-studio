---
name: "speckit-bounded-investigation"
description: "Run a bounded investigation when root cause, source behavior, or validation evidence is missing."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/bounded-investigation.md"
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
`delivery_profile: blocked-investigation` or when a later stage discovers that
root cause, source behavior, design input, validation condition, or requirements
are missing.

The goal is to collect enough evidence to re-route the work safely. It does not
implement product-code fixes by default.

## UI Runtime Investigation Triggers

Use a bounded UI runtime investigation before another implementation patch when
frontend parity or host-embedded UI work has any of these symptoms and the owner
chain is not already proven:

- Clipping, blank area, unexpected compression, overflow, or scrollbars changing
  sibling/header/footer sizes.
- UI works in a plugin preview but fails in the real host route/page.
- Static design or Qt source is known, but runtime parent containers, flex/grid
  grow-shrink, overflow, fixed dimensions, or scroll owner are unknown.
- A first CSS/layout patch did not change the observed result.

## Investigation Contract

Create or update `FEATURE_DIR/investigation.md` with:

- **Question**: what must be learned before implementation.
- **Affected repository**: from `.specify/memory/repository-map.md` and
  `.specify/feature.json`.
- **Search scope**: exact repo directories, files, or symbols to inspect.
- **Command budget**: a small list of intended `rg` / `rg --files` commands.
- **Stop conditions**:
  - Evidence found.
  - Scope expands beyond affected repo/module.
  - Real-device/API/cross-layer risk appears.
  - Search would require whole-workspace scan.
  - Validation condition is unavailable.
- **Evidence collected**.
- **UI runtime evidence**, when applicable:
  - Runtime DOM / computed style / box metrics summary.
  - Real route/page and host plugin chain.
  - DOM ancestry from host container to target element.
  - Computed style and box metrics for target, siblings, and scroll owner.
  - `height`/`min-height`/`max-height`, `padding`/`margin`, `overflow`,
    `position`, `display`, `flex`/`grid`, `flex-shrink`, `flex-grow`, and
    scrollbar reservation behavior.
  - Screenshots or inspector evidence for normal, hover, selected, disabled,
    expanded/collapsed, many-item, and scrollbar appear/disappear states.
  - Which repository/plugin owns each container that must change.
- **Routing decision**: micro-fix, standard-bugfix, full-sdd, validation-only,
  or still blocked.

## Search Rules

- Never default to scanning the whole `workspace_root`.
- Prefer `rg -n "symbol" <known-dir>` and
  `rg --files <affected-repo> | rg "name"`.
- Do not use broad `find <workspace-root> ...` style searches.
- Do not start an explorer/subagent for simple local lookup.
- If investigation needs delegation, define a concrete bounded question and
  write the allowed search scope before delegating.

## Fact Layer Investigation

- Use `speckit.fact-layer` when the investigation needs runtime facts instead
  of more source reading. Create or update `fact-pack.md` before a second same-class fix,
  before another UI/CSS/layout patch after one failed attempt, or when SDK,
  Biz, UI, and runtime state disagree.
- The investigation may call `.specify/scripts/powershell/collect-fact-layer.ps1 -Json`
  probe the Chrome debugging endpoint. Read local logs directly from
  `<system-temp>/SDKLog\SDK_*.log` and
  `<system-temp>/ServiceBridgeLog\ServiceBridge_*.log`. Use chrome-devtools
  only for DOM, console, computed style, and box metrics.

## Output

Report in Chinese:

- `investigation.md` path.
- Evidence found.
- Remaining blockers.
- Updated delivery profile recommendation.
- Required next stage.
