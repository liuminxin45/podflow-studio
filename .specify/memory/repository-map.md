# Workspace Repository Map

> This file is the source of truth for Spec Kit repository ownership in this
> workspace. The project is a single repository; use the path categories below
> to route work inside the repository instead of inventing separate repos.

## Workspace

- **Workspace root**: `.`
- **Primary repository**: `auto-podcast`
- **Default base branch**: `main`
- **Branch policy**: local-only Spec Kit work by default; do not push or
  perform branch completion automatically unless the user explicitly asks.

## Repository / Path / Role / Capability

| Repository | Path | Role | Capability / Ownership | AI Usage Notes |
|------------|------|------|-------------------------|----------------|
| `auto-podcast` | `.` | `electron-react-python-podcast-workbench` | Electron desktop shell, React/Vite authoring UI, Python podcast workflow nodes, shared state/config protocol, TrendRadar bridge, build/test scripts, docs, and runtime output conventions. | Treat this as a single repository. Use the Project Path Categories section to pick the affected layer before scanning broadly. |

## Project Path Categories

| Category | Relative Path Template | Owner / Source | AI Usage Notes |
|----------|------------------------|----------------|----------------|
| Frontend source | `<workspace-root>/src/` | React/Vite UI | Edit visual workflow, workbench pages, settings UI, Zustand state, frontend utilities, and TypeScript types here. |
| Electron shell | `<workspace-root>/electron/` | Electron main/preload process | Owns desktop window lifecycle, IPC, workflow orchestration, config persistence, Python node process execution, and acceptance runner support. |
| Python nodes | `<workspace-root>/nodes/<node-name>/` | Python workflow layer | Each node owns `config.py`, `node.py`, and `__main__.py`; nodes exchange data through shared state rather than importing each other. |
| Shared protocol | `<workspace-root>/protocol/` | Cross-node Python contract | Owns `PodcastState`, node runner/validator, config base classes, and config validation helpers. |
| TrendRadar bridge | `<workspace-root>/engine/` | External hotspot source integration | `engine/bridge.py` adapts TrendRadar data into Auto-Podcast inputs; treat `engine/trendradar` as external/synced source unless a task explicitly targets it. |
| Automation scripts | `<workspace-root>/scripts/` | Build, validation, and helper scripts | Use `verify_nodes.py`, `test_config.py`, `test_all_nodes.py`, `integration_test.py`, `build_check.py`, and schema extraction before inventing new validation commands. |
| Tests | `<workspace-root>/tests/` and `nodes/*/test*.py` | Python test coverage | Use repository-level tests for protocol and node behavior; node-local tests validate individual workflow steps. |
| Docs and screenshots | `<workspace-root>/docs/` | Architecture, dynamic config, acceptance evidence | Read for stable architecture and UI acceptance context when relevant; do not treat screenshot/log artifacts as source. |
| Build output | `<workspace-root>/dist/` | Generated Electron/Vite package output | Generated artifact. Do not patch as source. |
| Runtime output | `<workspace-root>/out/` | Generated podcast assets | Generated audio, assets, RSS, and publish outputs. Do not commit unless explicitly requested. |
| Local temp/cache | `<workspace-root>/tmp/`, `<workspace-root>/.pytest_cache/`, `<workspace-root>/auto_podcast.egg-info/` | Generated local state | Ignore for source ownership and pack synthesis except as validation residue. |
| Spec Kit workspace | `<workspace-root>/.specify/`, `<workspace-root>/.agents/`, `<workspace-root>/ai/`, `<workspace-root>/AGENTS.md` | AI delivery workflow | Spec Kit installed context, scripts, templates, generated knowledge, and mounted packs. Keep project facts in pack knowledge rather than broad global instructions. |

## Stable Project Facts

- Product: Auto-Podcast Studio, a desktop AI podcast production workbench.
- Stack: Electron, React, TypeScript, Vite, Ant Design, React Flow, Zustand,
  Python workflow nodes, Pydantic config, and TrendRadar bridge integration.
- Workflow stages: discovery, preprocessing, research/topic selection,
  script writing, TTS/audio production, review/publish.
- Runtime protocol: Electron starts `python -m nodes.<node_name>` and exchanges
  JSON state over stdin/stdout.
- Configuration: Electron persists node configs under user data; Python node
  configs are described by Pydantic classes and can be surfaced in frontend UI.

## Common Commands

| Purpose | Command | Notes |
|---------|---------|-------|
| Install dependencies | `npm install` | Runs `scripts/sync_trendradar.py` and editable Python install through `postinstall`. |
| Start app | `npm start` | Runs Vite and Electron concurrently. |
| Frontend only | `npm run dev:react` | Starts Vite, usually on `http://localhost:5173`. |
| Electron only | `npm run dev:electron` | Requires Vite to be ready. |
| Build frontend | `npm run build` | Runs TypeScript and Vite build. |
| Package Electron app | `npm run build:electron` | Runs frontend build then Electron Builder. |
| Verify config and nodes | `npm run verify` | Runs config and node validation. |
| Run tests | `npm run test` | Runs node tests and integration tests. |
| Verify node structure | `npm run verify:nodes` | Python node structure validation. |
| Verify config definitions | `npm run verify:config` | Python config validation. |

## Electron / CDP Notes

| Fact | Project Default | AI Usage Notes |
|------|-----------------|----------------|
| Development launch | `npm start` | Starts Vite and Electron together. Use when UI/runtime behavior needs the real desktop shell. |
| Frontend-only launch | `npm run dev:react` | Starts Vite, usually on `http://localhost:5173`; useful for frontend-only smoke before Electron checks. |
| Electron-only launch | `npm run dev:electron` | Requires Vite to be ready first. |
| CDP target inventory | Electron UI acceptance evidence should record available page targets when CDP is used. | Do not treat a connected debug port alone as enough evidence; record the selected target when browser/CDP validation is part of the task. |

## Rules For AI

- Use this map before scanning source. Do not infer separate repositories from
  layer directories such as `src`, `electron`, `nodes`, or `engine`.
- For UI changes, start from `src/` and validate with Vite/Electron when
  practical.
- For workflow behavior, start from the affected `nodes/<node-name>/`,
  `protocol/`, and the Electron orchestration path in `electron/main.js`.
- For config UI behavior, inspect `nodes/*/config.py`,
  `scripts/extract_node_schemas.py`, Electron schema IPC, and the frontend
  dynamic config components together.
- Keep generated knowledge source references relative to the workspace.
- Do not store machine-specific absolute paths in durable knowledge.
- Do not write machine-specific absolute paths here.
