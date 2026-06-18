---
authority: generated
confidence: low
source_refs:
  - .specify/knowledge-bootstrap/facts.json
last_verified: null
---

# auto-podcast

- Path: .
- Required: True
- Exists: True

## Detected Markers
- package.json (node)
- pyproject.toml (python)
- README.md (readme)
- tests (tests)

## Candidate Commands
- `npm install`
- `npm test`
- `npm run build`
- `python -m pytest`

## Review Checklist
- Confirm ownership against `.specify/memory/repository-map.md`.
- Confirm commands against package files, CI, or maintainer evidence.
- Add public contracts, runtime notes, and validation gaps only after source review.
