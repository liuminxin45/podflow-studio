---
name: "speckit-quality-vision"
description: "Create or update the quality baseline for UI/UX or user-facing work."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/quality-vision.md"
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

Create `quality-vision.md` when a feature changes UI, UX, copy, visual parity,
or user-facing behavior. The artifact is a compact quality anchor, not a design
manual. It records quality tier, references, `UI Baseline` evidence, and review
state so later AI self-acceptance does not judge UI by taste alone.

## Execution Steps

1. Load only the current `spec.md`, `plan.md` when present, and reference assets
   named by the user or selected gate packs.
2. Classify quality tier: `MVP`, `polished`, or `production`.
3. Record positive references with "what is good" and negative references with
   "why avoid".
4. For UI work, require at least one `UI Baseline` source:
   screenshot, design file, Qt `.ui`/QSS/source, product URL, or explicit
   owner-approved `N/A`.
5. If the baseline is missing and UI fidelity is material, stop with
   `next_required_human_action`; otherwise mark `needs-human-baseline` or
   `owner-approved-n/a` only when
   the user/owner explicitly accepted it.
6. Write `quality-vision.md` using `.specify/templates/quality-vision-template.md`
   when present; otherwise create the same compact sections inline.
7. Link `quality-vision.md` from `plan.md` `AI Context Contract` and
   `验证计划` when a plan exists.

## Quality Rules

- Keep stable intent here; detailed measurements belong in CDP screenshots,
  DOM/computed style/box metrics, logs, or source code.
- Do not store machine-specific absolute paths as long-term team knowledge.
- A baseline screenshot or Qt/design source is required for visual parity
  claims unless the owner explicitly accepts `N/A`.
- Do not treat "looks fine" as evidence. Cite the baseline and how it will be
  compared during AI self-acceptance.

## Output

Report in Chinese:

- `quality-vision.md` path.
- Quality tier.
- Baseline sources and missing baseline blockers.
- Whether human review is needed before implementation.
- Required next stage or `next_required_human_action`.
