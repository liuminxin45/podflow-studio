---
name: speckit-knowledge-bootstrap
description: Use when a Spec Kit workspace needs an initial or replaceable ai/knowledge base generated from repository inventory and AI review, without coupling templates to private project facts.
---

# Spec Kit Knowledge Bootstrap

Use this skill to initialize, refresh, export, install, or apply a
workspace-local knowledge base.

The better practice is not to ship team knowledge in Spec Kit templates. The
template should ship the framework, schema, selectors, and validators; each
workspace should own its generated or reviewed knowledge.

Mounted Pack Workflow:

1. When the user already has a pack, run
   `scripts/powershell/bootstrap-knowledge.ps1 -RepoRoot <workspace> -PackPath <pack-dir> -Force -Json`.
2. Pass `-ApplyProfiles` only when the workspace should adopt the pack's
   `.specify/workspace.yml` and repository-map profile.
3. Read `facts.mode`, `facts.applied_pack`, and `.specify/knowledge/lock.yml`.
4. Do not expect or require an AI review packet in this mode. The pack is
   existing knowledge; bootstrap is acting as the mount/apply orchestrator.
5. Report the installed pack id, active lock, materialized `ai/knowledge`
   result, aliases applied, and validation status.

Generated Knowledge Workflow:

1. Run `scripts/powershell/bootstrap-knowledge.ps1 -Json`.
2. Read the emitted facts, inventory, prompt, and draft files.
3. Read `ai-review/review-brief.md`, `ai-review/source-read-plan.md`, and
   `ai-review/claim-ledger.json`.
4. Use targeted source reads only to improve concrete claims.
5. Keep all guides at `authority: generated` unless the user explicitly approves
   promotion to `reviewed` or `authoritative`.
6. Apply drafts only after explicit user intent, then validate with
   `validate-knowledge-index` and `validate-context-budget`.

Generated Pack Workflow:

1. Run `scripts/powershell/bootstrap-knowledge.ps1 -RepoRoot <workspace> -ExportPack -PackId <id> -IncludeProfiles -Json`.
2. Treat `facts.pack.facts.pack_root` as a generated pack candidate.
3. Process the AI review packet before raising confidence or claiming
   project-specific correctness.
4. Use the generated `evaluation/scenarios.json` as routing canaries.

Knowledge Pack Workflow:

1. Use `export-knowledge-pack.ps1` to turn an existing `ai/knowledge` tree into
   a portable pack with `knowledge-pack.yml`.
2. Use `validate-knowledge-pack.ps1` before installing or sharing the pack.
3. Prefer `bootstrap-knowledge.ps1 -PackPath <pack-dir>` to install and
   materialize the pack into the workspace active `ai/knowledge` layer.
4. Use `apply-knowledge-pack.ps1` directly only for low-level pack operations or
   tests.
5. Use `compose-knowledge-packs.ps1` when installed packs or aliases change.
6. Pass `-ApplyProfiles` only when the workspace should adopt the pack's
   `.specify/workspace.yml` and repository-map profile.
7. Use `compare-knowledge-pack-equivalence.ps1` to prove a pack is equivalent
   to its source knowledge tree before claiming parity. Put routing canaries in
   `<pack>/evaluation/scenarios.json`, or pass `-ScenarioFile`, so
   project-specific repository names stay outside the open-source core.

Rules:

- Treat `.specify/memory/repository-map.md` as ownership truth.
- Do not infer ownership from directory names when a repository map exists.
- Do not full-text scan the entire workspace by default.
- Do not store local absolute paths in long-term knowledge.
- Preserve `source_refs` for claims that survive into guide text.
- Generated guides can route context, but risky decisions still need source
  evidence or reviewed guides.
- Generated packs can be mounted immediately for low-confidence routing help,
  but they are not proof of project behavior until AI review and validation are
  complete.
- Keep open-source Spec Kit core generic; project/team facts belong in
  generated local knowledge or installed knowledge packs.
- Use pack `aliases/tools.yml` to map legacy team tool names to generic core
  tool names during materialization.
- Keep pack-specific evaluation scenarios under `evaluation/scenarios.json`
  instead of hardcoding them in core scripts.

Recommended output:

- draft path
- applied/not applied
- repositories detected
- key unknowns
- validation evidence
- pack id, installed path, lock file, and aliases applied when pack workflows
  are used
- equivalence score, routing parity, and alias leakage result when comparing
  packs
