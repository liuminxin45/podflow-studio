# Knowledge Bootstrap AI Review Prompt

Use `.specify/knowledge-bootstrap/facts.json` and targeted source reads to improve the draft under `.specify/knowledge-bootstrap/draft/ai/knowledge`.

Rules:
- Keep all new guides at `authority: generated` unless a human explicitly approves promotion.
- Do not invent ownership; use `.specify/memory/repository-map.md` when available.
- Do not full-text scan the entire workspace by default.
- Preserve source references for every claim that survives into the draft.
- Keep machine-specific absolute paths out of long-term knowledge.
