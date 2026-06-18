---
name: "speckit-knowledge-pack"
description: "Export, install, apply, and repack portable Spec Kit capability packs."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/knowledge-pack.md"
---


## User Input

```text
$ARGUMENTS
```

## Context Contract

Default context is `AGENTS.md`, `.specify/workspace.yml`,
`.specify/memory/repository-map.md`, `.specify/feature.json` when present, and
`ai/workflows/task-routing.md`.

This command manages workspace capability packs. Do not load old feature specs,
all source files, or every `ai/knowledge/*` guide by default. Read only pack
manifests, selected profiles, and validation output unless a blocker requires
targeted source evidence.

Load `ai/knowledge/*`, `ai/tools/*`, `ai/templates/*`, old `specs/*`, or
design-history docs only when this command explicitly needs them.
Scripts output `facts`, `blockers`, `unknowns`, and `hints`; LLM owns semantic
routing, evidence judgment, and promotion decisions.

## Stage Continuation Rule

Apply the central Stage Continuation Contract from `ai/workflows/task-routing.md`.
This command normally stops after exporting, installing, applying, or validating
the requested pack. If generated or mounted knowledge needs human review before
promotion, report `next_required_human_action`.

## Purpose

Move project or team capability out of Spec Kit core templates and into
portable packs. A capability pack may provide knowledge, skills, tool policies,
scripts, prompts, resources, templates, evaluation scenarios, and workspace
profiles. Knowledge materializes into `ai/knowledge`; executable or behavioral
capabilities are installed under namespaced workspace-local paths.

## Pack Workflow

1. Export an existing knowledge tree:
   - `.specify/scripts/powershell/export-knowledge-pack.ps1 -SourceKnowledgeDir <path> -PackId <id> -OutputDir <pack-dir> -Json`
   - add `-EvaluationScenariosFile <json>` when the pack should carry routing
     canaries for equivalence checks
   - for a new arbitrary project, prefer
     `.specify/scripts/powershell/bootstrap-knowledge.ps1 -RepoRoot <workspace> -ExportPack -PackId <id> -IncludeProfiles -Json`
     so the pack is paired with an AI review packet and generated routing
     scenarios
2. Validate a pack before sharing or installing:
   - `.specify/scripts/powershell/validate-knowledge-pack.ps1 -PackRoot <pack-dir> -Json`
3. Install and apply a pack to the current workspace:
   - `.specify/scripts/powershell/apply-knowledge-pack.ps1 -RepoRoot . -PackPath <pack-dir> -Force -Json`
   - add `-ApplyProfiles` when the pack should also replace
     `.specify/workspace.yml` and `.specify/memory/repository-map.md`
4. For already installed packs, re-compose:
   - `.specify/scripts/powershell/compose-knowledge-packs.ps1 -RepoRoot . -PackId <id> -Json`
5. Update or uninstall a mounted pack:
   - `.specify/scripts/powershell/update-knowledge-pack.ps1 -RepoRoot . -PackPath <pack-dir> -Json`
   - `.specify/scripts/powershell/uninstall-knowledge-pack.ps1 -RepoRoot . -PackId <id> -Json`
   - update replaces the installed source by pack id, clears stale published
     layers for that id, and preserves the current active pack set
   - uninstall removes the installed source and namespaced published layers,
     then re-composes remaining active packs or restores base knowledge
6. Repack the active workspace-local capability layer for distribution:
   - `.specify/scripts/powershell/repack-knowledge-pack.ps1 -RepoRoot . -PackId <id> -Mode full-snapshot -IncludeProfiles -Json`
   - local capability overlays live under `.specify/capabilities/overlays/local/<layer>/`
   - full-snapshot repack preserves active `ai/knowledge`, namespaced skills,
     tool policies, scripts, prompts, resources, and templates when present
7. Compare a pack with its source knowledge tree:
   - `.specify/scripts/powershell/compare-knowledge-pack-equivalence.ps1 -SourceKnowledgeDir <source-ai-knowledge> -PackRoot <pack-dir> -UseSpecKitInit -Json`
   - the comparison reads `<pack-dir>/evaluation/scenarios.json` by default;
     use `-ScenarioFile <json>` to override the routing canaries

## Semantics

- `kind: "capability-pack"` is the forward format. Legacy
  `knowledge-pack.yml` remains supported for compatibility.
- Pack source lives under `.specify/knowledge/packs/<pack-id>/`.
- The active knowledge layer is materialized to `ai/knowledge/`.
- The original active layer is snapshotted under `.specify/knowledge/base/` on
  first install and backed up under `.specify/knowledge/backups/` on compose.
- Updating a pack is replace-by-id. It does not silently activate an inactive
  pack when another active pack set already exists.
- Uninstalling a pack clears `.agents/spec-kit/skills/<pack-id>__*`,
  `ai/tools/<pack-id>/`, `.specify/scripts/packs/<pack-id>/`, and the matching
  `.specify/capabilities/<layer>/<pack-id>/` trees.
- `.specify/knowledge/lock.yml` records installed pack ids, versions, and tool
  aliases applied during materialization.
- `.specify/capabilities/lock.yml` records namespaced skills, tools, scripts,
  commands, prompts, resources, and templates published from capability packs.
- Pack `capabilities/index.yml` is the progressive-disclosure registry. It is
  read first; layer files are loaded only when the selected skill, command, or
  task route needs them.
- Pack `aliases/tools.yml` may map legacy team tool names to open-source core
  tool names without mutating the pack source.
- Use `.specify/scripts/powershell/select-capability.ps1 -RepoRoot . -Layer <layer> -Json`
  to discover published skills, tools, scripts, prompts, commands, resources,
  or templates without loading their file contents by default.
- Pack `profiles/` can carry workspace and repository-map profiles. Apply them
  only when the target workspace is intended to take that pack's repository
  layout.
- Pack `evaluation/scenarios.json` can carry routing canaries for parity
  evaluation. Project-specific repository names belong there, not in the
  open-source evaluator script.

## Guardrails

- Open-source Spec Kit core must stay free of project or team facts.
- Do not promote pack knowledge to authoritative without source evidence or
  human review.
- Do not store machine-specific absolute paths in long-term pack knowledge.
- Do not auto-run scripts from a pack. Scripts must be invoked explicitly and
  return structured `facts`, `blockers`, `unknowns`, and `hints`.
- Namespaced pack skills must be loaded through progressive disclosure; do not
  pre-load every pack skill, tool policy, or resource.
- After applying a pack, run `validate-knowledge-index` and
  `validate-context-budget`.

## Output

Report:

- pack id and installed path
- active `ai/knowledge` path
- lock file path
- aliases applied
- capability layers published
- profiles applied, when requested
- validation status and blockers, if any
- equivalence scores when comparing a pack to a source knowledge tree
- evaluation scenario source used for routing parity
