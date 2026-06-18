# AI Source Read Queue

Read order:
1. .specify/workspace.yml when present.
2. .specify/memory/repository-map.md when present.
3. .specify/knowledge-pack-generation/bootstrap/facts.json.
4. .specify/knowledge-pack-generation/bootstrap/ai-review/source-read-plan.md.
5. Repository marker files from the source-read plan.

Extraction targets:
- repository purpose and ownership boundaries
- build/test/package commands with direct manifest or CI evidence
- public contracts and runtime interfaces only when source files clearly expose them
- validation support and known unsupported validation modes
- project-specific terminology that improves routing without leaking local paths

Stop rules:
- Leave a claim unknown when evidence is missing.
- Do not full-text scan the whole workspace by default.
- Do not expand to broad source search unless a concrete guide needs it.
- Do not mount a reviewed pack if quality or equivalence validation is blocked.
- Do not promote authority without human approval.
