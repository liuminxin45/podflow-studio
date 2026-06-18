---
name: "speckit-knowledge-pack-generate"
description: "Generate a portable Spec Kit knowledge pack for an arbitrary workspace with AI synthesis."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/knowledge-pack-generate.md"
---


## User Input

```text
$ARGUMENTS
```

## Context Contract

Default context is `AGENTS.md`, `.specify/workspace.yml`,
`.specify/memory/repository-map.md`, `.specify/feature.json` when present, and
`ai/workflows/task-routing.md`.

This command generates a knowledge pack for a workspace or repository. It is not
a feature-delivery stage. Do not load old feature specs, every source file, or
all generated knowledge by default.

Load `ai/knowledge/*`, `ai/tools/*`, `ai/templates/*`, old `specs/*`, or
design-history docs only when this command explicitly needs them.
Scripts output `facts`, `blockers`, `unknowns`, and `hints`; LLM owns semantic
synthesis, source-evidence judgment, and validation sufficiency.

## Stage Continuation Rule

Apply the central Stage Continuation Contract from `ai/workflows/task-routing.md`.
This command normally continues through generation, AI synthesis, pack export,
and pack validation in the same turn. Stop only when source access is missing,
the generation contract is blocked, validation fails, or applying/mounting the
pack needs explicit user intent. When stopping, report `next_required_human_action`.

## Purpose

Create a reusable knowledge pack from a random project without hardcoding team
facts into Spec Kit core. The script prepares hard facts, draft knowledge, an AI
review packet, an AI synthesis workspace, a quality loop, and a pack export
target. The AI then does the semantic work: targeted source reading, layered
synthesis, cleanup, source references, and explicit unknowns.

## Execution Steps

1. Run the generator:

   ```text
   .specify/scripts/powershell/generate-knowledge-pack.ps1 -RepoRoot . -PackId <id> -IncludeProfiles -Json
   ```

2. Read:
   - `facts.generation_contract`
   - `facts.ai_synthesis_plan`
   - `facts.source_read_queue`
   - `facts.synthesis_knowledge_dir`
   - `facts.bootstrap.facts.source_read_plan`
   - `facts.bootstrap.facts.claim_ledger`
   - `facts.quality`
   - `facts.equivalence`

3. Use the contract to drive AI synthesis:
   - read the bounded source queue first
   - inspect only marker files, manifests, README, contracts, tests, or CI files
     needed for a concrete guide
   - edit the AI synthesis workspace instead of writing directly to active
     `ai/knowledge/`
   - preserve `index.yml`, guide authority, confidence, tags, and `source_refs`
   - leave ownership, runtime behavior, and validation support unknown when
     evidence is missing
   - fix quality gaps reported by `source-coverage-ledger.json` and
     `claim-verification-report.json`

4. Re-run export from the reviewed AI synthesis workspace:

   ```text
   .specify/scripts/powershell/generate-knowledge-pack.ps1 -RepoRoot . -PackId <id> -ReviewedKnowledgeDir .specify/knowledge-pack-generation/ai-synthesis/ai/knowledge -IncludeProfiles -Json
   ```

5. Require quality and equivalence closure:

   ```text
   .specify/scripts/powershell/evaluate-knowledge-pack-synthesis.ps1 -RepoRoot . -KnowledgeDir .specify/knowledge-pack-generation/ai-synthesis/ai/knowledge -MinimumScore 70 -FailBelowMinimum -Json
   .specify/scripts/powershell/compare-knowledge-pack-equivalence.ps1 -SourceKnowledgeDir .specify/knowledge-pack-generation/ai-synthesis/ai/knowledge -PackRoot <pack-dir> -Json
   ```

6. Validate the produced pack:

   ```text
   .specify/scripts/powershell/validate-knowledge-pack.ps1 -PackRoot <pack-dir> -Json
   ```

7. Mount the pack only when the user asks to apply it:

   ```text
   .specify/scripts/powershell/bootstrap-knowledge.ps1 -RepoRoot . -PackPath <pack-dir> -Force -Json
   ```

## AI Synthesis Rules

- Keep the knowledge framework small and layered.
- Prefer `workspace/`, `repositories/`, `build/`, and focused domain guides over
  long manuals.
- Use `.specify/memory/repository-map.md` as repository ownership authority when
  present.
- Do not full-text scan the whole workspace by default.
- Do not store machine-specific absolute paths in long-term knowledge.
- Keep guides at `authority: generated` unless the user explicitly approves
  promotion.
- Treat the quality score as evidence traceability, not a semantic truth score.
- Generated packs may be mounted for routing help, but project-correctness still
  depends on source evidence and validation.

## Output

Report:

- pack id and pack root
- AI synthesis workspace
- generation contract path
- source read queue path
- whether `facts.ai_synthesis_required` is true
- quality score, source coverage ledger, and claim verification report
- equivalence score and routing parity
- validation status and blockers
- key `unknowns` that remain after synthesis
- whether the pack was mounted or only generated
- `next_required_human_action` when the pack needs review, apply approval, or
  validation follow-up
