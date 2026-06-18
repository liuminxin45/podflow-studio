---
name: speckit-knowledge-pack-generator
description: Use when creating a portable Spec Kit knowledge pack for an arbitrary project with automated fact collection and AI synthesis.
---

# Spec Kit Knowledge Pack Generator

Use this skill when the user wants a reusable knowledge pack for a project,
repository, or workspace that does not already have a reviewed pack.

The generator is intentionally AI-assisted. Scripts collect deterministic facts,
create a draft, write an AI generation contract, copy the draft into an AI
synthesis workspace, run the quality loop, export a candidate pack, compare pack
equivalence, and validate the pack shape. The AI owns semantic synthesis:
deciding which source files matter, extracting durable project knowledge,
deleting noise, preserving source references, closing quality gaps, and
recording unknowns.

## Workflow

1. Run:

   `scripts/powershell/generate-knowledge-pack.ps1 -RepoRoot <workspace> -PackId <id> -IncludeProfiles -Json`

2. Read the returned `facts.generation_contract`,
   `facts.ai_synthesis_plan`, `facts.source_read_queue`,
   `facts.synthesis_knowledge_dir`, `facts.bootstrap.facts.source_read_plan`,
   `facts.bootstrap.facts.claim_ledger`, `facts.quality`, and
   `facts.equivalence`.

3. Edit only the AI synthesis workspace:

   `.specify/knowledge-pack-generation/ai-synthesis/ai/knowledge/`

4. Use targeted source reads:
   - `.specify/workspace.yml`
   - `.specify/memory/repository-map.md` when present
   - marker files from the source-read plan
   - package manifests, README, contracts, tests, CI, or build files only when
     they improve a concrete guide

5. Keep the pack layered:
   - `workspace/overview.md`
   - `repositories/*.md`
   - `build/command-matrix.yml`
   - `build/validation-capabilities.yml`
   - domain guides only when source evidence makes them useful

6. Use the quality loop:
   - read `.specify/knowledge-pack-generation/quality/source-coverage-ledger.json`
   - read `.specify/knowledge-pack-generation/quality/claim-verification-report.json`
   - fix unresolved source refs, missing repo coverage, and uncovered claims
   - remember that the score checks evidence traceability, not semantic truth

7. Re-run:

   `scripts/powershell/generate-knowledge-pack.ps1 -RepoRoot <workspace> -PackId <id> -ReviewedKnowledgeDir <workspace>/.specify/knowledge-pack-generation/ai-synthesis/ai/knowledge -IncludeProfiles -Json`

8. Validate quality and equivalence:

   `scripts/powershell/evaluate-knowledge-pack-synthesis.ps1 -RepoRoot <workspace> -KnowledgeDir <workspace>/.specify/knowledge-pack-generation/ai-synthesis/ai/knowledge -MinimumScore 70 -FailBelowMinimum -Json`

   `scripts/powershell/compare-knowledge-pack-equivalence.ps1 -SourceKnowledgeDir <workspace>/.specify/knowledge-pack-generation/ai-synthesis/ai/knowledge -PackRoot <pack-dir> -Json`

9. Validate:

   `scripts/powershell/validate-knowledge-pack.ps1 -PackRoot <pack-dir> -Json`

10. Mount only after explicit user intent:

   `scripts/powershell/bootstrap-knowledge.ps1 -RepoRoot <workspace> -PackPath <pack-dir> -Force -Json`

## Rules

- Do not full-text scan the whole workspace by default.
- Do not infer repository ownership when a repository map exists.
- Do not store local absolute paths in long-term knowledge.
- Do not raise authority above `generated` without explicit human approval.
- Preserve `source_refs` for every durable claim that survives into guides.
- Use `source-coverage-ledger.json` and `claim-verification-report.json` as
  required AI review inputs before claiming closure.
- Treat scripts as fact and packaging helpers; the AI remains responsible for
  semantic synthesis and validation sufficiency.
- Prefer small, selected guides over large manuals.

## Output

Report the pack id, pack root, AI synthesis workspace, generation contract,
source-read queue, quality score, source coverage ledger, claim verification
report, equivalence score, validation status, remaining unknowns, and whether
the pack was mounted or only generated.
