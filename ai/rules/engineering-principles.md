# Engineering Principles

This file is L0 long-term governance. It contains stable engineering principles
that normal feature workflows may cite but must not silently change.

## Scope Control

- Prefer the smallest change that satisfies the accepted capability, bug fix,
  migration, or tooling request.
- Avoid unrelated refactors, formatting churn, generated metadata churn, and
  opportunistic cleanup unless the active plan explicitly includes them.
- Keep edits inside the affected repositories identified by
  `.specify/memory/repository-map.md`.

## Existing Patterns First

- Read nearby code, helper APIs, scripts, build files, and existing integration
  conventions before introducing a new abstraction.
- Add an abstraction only when it removes real complexity, matches local
  patterns, or is required by a public contract.
- Preserve local naming, ownership boundaries, and error handling style.

## Evidence Before Completion

- Claims of completion require concrete validation evidence or an explicit
  validation gap with follow-up.
- Prefer build, unit, integration, smoke, UI flow, virtual-device, real-device,
  manual review, or downstream consumer validation depending on risk.
- LLM may judge validation sufficiency, but scripts provide only hard facts,
  blockers, unknowns, and hints.

## Source Ownership

- Product and plugin fixes must modify repository source files.
- Installed runtime plugin directories, host-served frontend plugin outputs,
  `dist/`, `build/`, `export/`, and `plugin-out/` are validation or deployment
  artifacts unless a repository explicitly treats them as source.
- Emergency artifact patches must be ported back to source before acceptance or
  commit.

## Governance

- AI must not edit this file as part of a normal feature workflow.
- Proposed changes must be recorded as an approved retrospective or
  promote-lessons candidate with reason, source evidence, and expected impact.
