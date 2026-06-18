# MCP Usage Policy

MCP is an L4 capability layer. It is used to collect facts, not to replace
feature specifications, plans, or human approval.

MCP tools are optional capabilities, not always-on actions. The exception is
not "MCP must exist"; it is "runtime evidence must exist": after a first failed
UI/CSS/layout patch, collect Chrome DevTools/CDP runtime facts from the real
target or obtain user-provided DOM/CSS evidence before making a second patch.

## When To Use MCP

Use Chrome DevTools MCP when:

- UI, layout, CSS, DOM, console, or live runtime state is part of the problem.
- Host-embedded frontend plugin behavior must be validated in the real
  HostApplication Electron container. Prefer CDP at `http://127.0.0.1:9222`
  and targets matching `app-home`, `app-main-window`, or
  `frontend/static/index.html`.
- A fix has failed and source-only reasoning no longer explains the observed
  behavior.
- Screenshots or copied DOM show a mismatch that needs computed style or layout
  facts.
- The task explicitly asks to inspect a running page or Electron app.

Use external source MCP servers when:

- The user explicitly references an external source of truth, such as a Figma
  design or GitHub issue.
- The task depends on current external state that cannot be trusted from local
  memory alone.

## Required Behavior

- Collect the smallest useful evidence set.
- Summarize the facts used for any resulting fix.
- Keep tool output separate from LLM judgment.
- If MCP is unavailable, ask for user-provided DOM/CSS/log evidence instead of
  guessing repeatedly.
- For host-embedded UI work, run source build and optional source-to-runtime
  sync before CDP validation, then record screenshots, selected target URL,
  DOM/computed-style facts, and any CDP interaction method such as
  `Input.dispatchMouseEvent` or `CSS.forcePseudoState(['hover'])`.
- Do not apply a second UI/CSS/layout patch after the first failed patch until
  runtime DOM/CSS/computed style/box metrics or copied DOM/CSS evidence exists.
- Do not use MCP availability as a reason to skip local logs or source review.

## Prohibited Behavior

- Do not route workflow stages by matching user text keywords alone.
- Do not make destructive or write actions through external tools without
  explicit human confirmation.
- Do not use a blank or unrelated browser target as evidence for an Electron UI.
- Do not keep applying speculative fixes after repeated failure without a new
  fact source.
