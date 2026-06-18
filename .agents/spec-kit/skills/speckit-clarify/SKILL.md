---
name: "speckit-clarify"
description: "Identify underspecified CoreRuntime capability areas and write the answers back into spec.md."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/clarify.md"
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

Auto-capable clarification before planning. Default to no-interruption when the
spec is clear enough; ask only questions that would materially change module
boundaries, compatibility, validation, runtime behavior, device handling, or
rollout risk.

## Language Rules

- Clarification questions and summaries are human-reviewed. Write them in
  Chinese-first style.
- Preserve technical identifiers in their original form: file paths, module
  names, APIs, fields, enum/status values, commands, and test names.

## Execution Steps

1. Run the prerequisite script with the spec-only prerequisite gate
   (`-SpecOnly`, equivalent to the workflow `--spec-only` gate), then parse
   `FEATURE_DIR` and `FEATURE_SPEC`.
2. Read `FEATURE_SPEC`.
3. Read `.specify/memory/constitution.md` if it exists.
4. Build an ambiguity list across these categories:
   - Capability scope and out-of-scope boundaries.
   - Affected modules and ownership.
   - Public interfaces, SDK headers, plugin contracts, or serialized fields.
   - Runtime state, device state, permissions, handles, and cache behavior.
   - Encoding, localization, or frontend display boundaries.
   - Validation target: build, smoke, real device, virtual device, UI flow, or
     manual review.
   - Test-case plan: required API tests, E2E/interface tests, regression
     tests, fixture/smoke updates, or explicit N/A reasons.
   - UI parity runtime inputs when frontend visual parity is involved:
     design/mockup files, Qt/source reference files, screenshots, dynamic
     states, geometry constraints, host embedding boundary, and runtime
     evidence source.
   - Compatibility, migration, rollback, and downstream effects.

5. Decide whether to ask.
   - If there are no high-impact ambiguities, record "no blocking
     clarification" in the output and continue to `speckit.plan`.
   - If risk is `low` or `medium`, prefer assumptions plus explicit validation
     notes unless the answer would change public behavior or ownership.
   - If risk is `high`, ask only for owner-approved gaps or decisions that
     would otherwise make implementation unsafe.
   - If risk is `blocked`, stop and list the missing source behavior, missing
     design input, missing verification condition, or contradiction.

6. Ask at most five high-impact questions when needed.
   - Prefer A/B/C multiple-choice when the option space is clear. Put the
     recommended option first as `A（推荐）`, and give each option one concise
     impact/tradeoff sentence.
   - Use free-form only when valid choices cannot be reduced to stable options.
   - Ask one question at a time if the answer may change later questions.
   - Do not ask about trivial wording or implementation preferences.

7. For UI parity, frontend plugin visual work, or host-embedded UI fixes,
   clarify or record explicit assumptions for:
   - Static references: design files, Qt `.ui` / delegate / qss / source
     files, screenshots, and target frontend/plugin path.
   - UI/UX/copy evidence: exact source for every changed icon, tooltip,
     label, menu text, button, visible state, style, and layout rule. Missing
     source for visible UI is a high-impact clarification item, not a trivial
     wording preference.
   - Dynamic states: hover, selected, disabled, expanded/collapsed, loading,
     empty, many-item, scrollbar appear/disappear, and interaction availability.
   - Geometry constraints: fixed sizes, padding/margin, line height, sibling
     containers, parent ownership, scroll owner, overflow, flex/grid
     grow/shrink, and clipping/compression boundaries.
   - Host integration: the real runtime route/page, embedding parent plugin,
     affected sibling plugins, and whether validation must run in a host page
     instead of a single plugin preview.
   - Acceptance evidence: screenshots plus runtime DOM / computed style / box
     metrics when available. If such evidence cannot be collected by the agent,
     require the acceptance checklist to request it explicitly.

8. When changed behavior needs API, E2E/interface, regression, fixture, smoke,
   UI, or device test planning, load `speckit-test-plan` via
   `ai/workflows/skill-routing.yml`.
   - If the test-case mapping is obvious, record the drafted plan and continue.
   - If choices affect public contracts, device coverage, fixtures, test cost,
     or accepted gaps, stop for human review before planning/implementation.

9. For UI/UX/copy/parity work, load `speckit-quality-vision` via
   `ai/workflows/skill-routing.yml` before planning.
   - Require baseline screenshot/design/Qt source or owner-approved `N/A`.
   - If baseline choice affects quality expectations, stop for human review.

10. Update `spec.md`.
   - Add a "Clarifications" section if missing.
   - Record each answer with date and concise rationale.
   - Update affected requirements or assumptions so the spec can stand alone.

## Output

Report in Chinese:

- Number of questions asked.
- Sections updated.
- Remaining unresolved items, if any.
- Required next stage: `speckit.plan` / `$speckit-plan` after blocking
  clarification items are resolved.
- Human review prompt:
  - Ask only for high-impact product/business decisions, owner-approved gaps,
    missing external inputs, or blocked requirements.
  - Do not ask humans to confirm root cause correctness, test sufficiency, or code-level fix quality.
  - If no blocking ambiguity remains, continue to `speckit.plan` /
    `$speckit-plan` without adding a fixed manual gate.
