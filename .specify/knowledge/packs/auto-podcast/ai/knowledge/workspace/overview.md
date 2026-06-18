---
authority: generated
confidence: medium
source_refs:
  - .specify/memory/repository-map.md
  - README.md
  - package.json
  - pyproject.toml
last_verified: null
---

# Workspace Overview

- Workspace root is a single repository named `auto-podcast`.
- Primary product is Auto-Podcast Studio, an Electron desktop AI workbench for podcast production.
- Main stack combines Electron, React, TypeScript, Vite, Ant Design, React Flow, Zustand, and Python workflow nodes.
- Python package metadata is in `pyproject.toml`; desktop and frontend commands are in `package.json`.
- The repository map is the routing authority; do not treat `src`, `electron`, `nodes`, or `engine` as separate repositories.
- Source edits should be routed by layer: `src/` for frontend, `electron/` for desktop shell and IPC, `nodes/` for workflow logic, `protocol/` for shared state/config contracts.
- Runtime outputs under `out/`, build outputs under `dist/`, local caches, and generated Spec Kit outputs are not durable source.
- Sensitive model/API settings should be handled through app settings, local config, or environment variables rather than committed files.
