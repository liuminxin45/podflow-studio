# Parallel Development Instructions

This repository is a parallel multi-agent development project. Assume other
agents may be editing unrelated modules at the same time.

Before making changes:

- Run `git status --short` and treat any existing changes as user or peer-agent
  work.
- Read `docs/parallel-development.md` before cross-module work.
- Choose exactly one workstream for the task and keep edits inside that
  workstream unless the task explicitly requires a shared contract change.
- Inspect a file immediately before editing it. Do not overwrite nearby changes
  you did not make.

Core workstreams:

- Contract / Protocol: shared Python state, schema, migration, pipeline order,
  and TypeScript workflow types.
- Discover / Organize: fetch, preprocessing, and source normalization nodes.
- Ideation / Writing: research, topic selection, fact cards, script generation,
  and writing UI/services.
- Produce: TTS, audio assembly, assets, recording, and sound studio surfaces.
- Review / Publish: review, RSS, publish package, run reports, and validation.
- Desktop / Frontend Integration: Electron orchestration, IPC, settings, and
  React workflow surfaces.
- QA / Release: tests, acceptance scripts, demo validation, and release gates.

Shared contract files are high-risk. Do not modify these casually:

- `protocol/state.py`
- `protocol/manifest.py`
- `protocol/episode_models.py`
- `protocol/migration.py`
- `protocol/schemas/**`
- `src/types/workflow.ts`
- `electron/workflowRunner.js`
- `config.example.yaml`
- `constitution.md`

If a task requires changing shared contract files:

- Make additive changes where possible.
- Preserve backward compatibility through migration or fallback behavior.
- Update both Python and TypeScript contract surfaces when the state shape
  changes.
- Add or update focused tests for the new contract.
- Report the downstream modules that were checked and any consumer-closure gaps.

Do not:

- Revert, reset, or delete peer-agent changes unless the user explicitly asks.
- Rename or remove state keys, pipeline nodes, config fields, or output artifacts
  without a contract-level task.
- Treat a local module test as full completion when downstream consumers were
  not checked.

Every final handoff should include:

- Workstream used.
- Files changed.
- Verification commands run.
- Checks skipped with reasons.
- Any shared-contract or downstream consumer risk that remains.
