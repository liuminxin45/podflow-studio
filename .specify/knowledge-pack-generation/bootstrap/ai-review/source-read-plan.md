# AI Source Read Plan

Use this as a bounded read plan. Do not full-text scan the whole workspace by default.

## Required First Reads

- .specify/workspace.yml when present
- .specify/memory/repository-map.md when present
- .specify/knowledge-bootstrap/facts.json
- .specify/knowledge-bootstrap/inventory.md

## Repository Reads

### auto-podcast
- Draft guide: .specify/knowledge-bootstrap/draft/ai/knowledge/repositories/auto-podcast.md
- Start from marker files only:
  - ./package.json
  - ./pyproject.toml
  - ./README.md
  - ./tests
- Confirm candidate commands before moving confidence above low.
