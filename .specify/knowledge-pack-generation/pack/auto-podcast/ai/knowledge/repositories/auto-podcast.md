---
authority: generated
confidence: medium
source_refs:
  - .specify/memory/repository-map.md
  - README.md
  - docs/ARCHITECTURE.md
  - package.json
  - protocol/state.py
last_verified: null
---

# auto-podcast

- `auto-podcast` is a single repository, not a multi-repo workspace.
- Product capability covers podcast discovery, material cleanup, research/topic selection, script writing, TTS/audio production, review, and publishing.
- `src/` owns the React/Vite authoring interface, workflow canvas, settings pages, workbench components, mocks, constants, and frontend types.
- `electron/` owns the desktop process, preload bridge, workflow persistence, IPC handlers, Python process orchestration, config storage, TrendRadar daemon control, and acceptance runner.
- `nodes/<node-name>/` owns each Python workflow step and should expose `config.py`, `node.py`, and `__main__.py`.
- `protocol/` owns shared Python contracts including `PodcastState`, node runner/validator support, and config base classes.
- `engine/bridge.py` adapts TrendRadar data; `engine/trendradar` should be treated as synced external source unless the task explicitly targets that engine.
- `scripts/` owns automation such as node verification, config validation, schema extraction, integration tests, build checks, and TrendRadar sync.
- `docs/ARCHITECTURE.md` records the node independence principle: nodes communicate through shared state rather than importing each other.
- For feature work, pick the affected layer first from the repository map, then read focused files in that layer.
- For workflow behavior changes, inspect the affected node, `protocol/state.py`, and Electron orchestration together.
- For UI/config changes, inspect frontend components, Electron IPC/preload APIs, and Python config schema extraction together.
