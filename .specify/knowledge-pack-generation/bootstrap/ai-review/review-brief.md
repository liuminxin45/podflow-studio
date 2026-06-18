# AI Knowledge Review Brief

Goal: turn deterministic inventory into useful generated knowledge without inventing project facts.

Inputs:
- facts: .specify/knowledge-bootstrap/facts.json
- inventory: .specify/knowledge-bootstrap/inventory.md
- draft knowledge: .specify/knowledge-bootstrap/draft/ai/knowledge/
- source read plan: .specify/knowledge-bootstrap/ai-review/source-read-plan.md

AI responsibilities:
- read only targeted marker/source files needed to improve a concrete guide
- preserve uthority: generated unless a human explicitly approves promotion
- add source_refs for every durable claim
- keep paths relative and replace local roots with placeholders
- leave unknown ownership, APIs, runtime behavior, or validation support as unknown instead of guessing

After review:
- run alidate-knowledge-index against the draft or applied workspace
- export a pack with bootstrap-knowledge.ps1 -ExportPack or export-knowledge-pack.ps1
- apply the pack only after explicit user intent
