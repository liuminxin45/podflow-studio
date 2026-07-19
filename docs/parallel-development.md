# Parallel Development Playbook

PodFlow Studio is organized for parallel multi-agent work. The main goal is to
let agents advance separate modules without corrupting the shared pipeline
contract.

## Ground Rules

- Assume concurrent work. `git status --short` is a required preflight.
- Prefer one workstream per task. Cross-workstream edits need an explicit reason.
- Shared protocol changes go through the Contract / Protocol workstream first.
- Module agents own their inputs, outputs, tests, and narrow smoke checks.
- QA / Release owns integration confidence, not feature implementation.
- Keep changes additive unless the user explicitly approves a breaking change.
- Do not hand-edit generated outputs unless the task is specifically about
  generated artifacts.

## Completion Boundaries

Report completion at the right level:

- Partial progress: the requested module work moved forward.
- Build-surface success: local tests or builds for the touched surface passed.
- Source closure: source, config, tests, and residue scans are settled.
- Consumer closure: downstream callers, UI, Electron, demo, or publish flow were
  verified.
- Final completion: the user's stated objective is fully satisfied.

If consumer closure was not checked, say so directly.

## Workstreams

| Workstream | Primary ownership | Normal outputs | Local gates | Stop conditions |
| --- | --- | --- | --- | --- |
| Contract / Protocol | `protocol/state.py`, `protocol/manifest.py`, `protocol/episode_models.py`, `protocol/schemas/**`, `src/types/workflow.ts` | Stable current state keys, schema, pipeline order | `npm run verify:config`, focused schema tests, `npm run build` when TS changes | Removing or renaming public state keys, changing node order, incompatible schema changes |
| Discover / Organize | `nodes/fetch`, `nodes/preprocess`, source adapters | `fetch_contents`, `cleaned_contents` | relevant node `test.py`, `npm run verify:nodes`, source-specific smoke tests | New external source credentials, network assumptions, state shape changes |
| Ideation / Writing | `nodes/research`, `nodes/topic_selection`, `nodes/facts`, `nodes/script`, `src/services/writing/**`, `src/components/writing/**` | `researched_contents`, `selected_topic`, `selected_topics`, `selected_materials`, `facts`, `script`, `edited_script` | relevant node tests, writing service tests, `tests/test_morning_news_pipeline.py` | Changing script/fact schemas, bypassing facts, changing edited-script priority |
| Produce | `nodes/tts`, `nodes/audio_postprocess`, `nodes/assets`, `src/components/SoundStudio.tsx`, `src/components/soundStudio/**` | `voice_segments`, `audio_outputs`, `cover_path` | relevant node tests, `tests/test_morning_news_pipeline.py`, offline mock TTS smoke | Live TTS costs, destructive file cleanup, changing audio output contract |
| Review / Publish | `nodes/review`, `nodes/publish`, RSS validation, publish package logic | `review_summary`, `publish_outputs`, `run_report` | publish/review node tests, RSS tests, `npm run demo:news` when publish flow changes | Public URL/enclosure behavior, removing local-preview warnings, package layout changes |
| Desktop / Frontend Integration | `electron/**`, `src/components/**`, `src/services/settings/**`, workflow IPC and UI state | Reliable orchestration, settings, workflow display, approvals | `npm run test:run`, `npm run build`, CDP acceptance when UI flow changes | Python state contract changes, IPC shape changes, approval semantics changes |
| QA / Release | `tests/**`, `scripts/**`, `docs/acceptance/**`, release verification | Test coverage, acceptance reports, regression findings | `npm run verify:offline`, `npm run demo:news`, `npm run build`, selected focused tests | Product-scope decisions, deleting tests without replacement |

## Shared Contract Protocol

Use this when a task needs to touch shared state, schema, pipeline order, or
cross-language types.

1. Classify the contract surface: state key, schema field, node order, config
   field, IPC payload, generated artifact, or publish package layout.
2. Keep one explicit current contract. Breaking changes require explicit user approval and coordinated consumer updates.
3. Update Python and TypeScript surfaces together when user-visible state
   crosses the Electron or React boundary.
4. Reject unsupported state/config shapes at the boundary; do not silently migrate or backfill them.
5. Update focused tests before downstream module work begins.
6. Run the narrowest useful contract gates.
7. Tell downstream agents exactly what changed and what they must adapt.

Default contract gates:

```bash
npm run verify:config
node scripts/python313.js -m pytest tests/test_episode_schema.py -q
npm run build
```

## Work Packet Template

Use this shape when assigning work to a parallel agent:

```text
Workstream:
Goal:
Allowed paths:
Do not touch:
Inputs consumed:
Outputs produced:
Shared contract changes allowed: no
Preflight:
  - git status --short
  - read AGENTS.md
  - read docs/parallel-development.md
Narrow verification:
Integration verification:
Handoff notes required:
```

If shared contract changes are allowed, name the exact files and required
current-contract behavior.

## Suggested Parallel Split

Batch A can run with low conflict:

- Discover / Organize improves source normalization and fetch adapters.
- Produce improves mock/live TTS fallback and audio reports.
- Review / Publish strengthens RSS validation and package metadata.
- QA / Release expands tests around the above modules.

Batch B should wait for any Contract / Protocol changes to land:

- Ideation / Writing changes to `FactCard`, `ScriptSegment`, or edited-script
  behavior.
- Desktop / Frontend Integration changes that display new state fields.
- Publish/report changes that depend on new run-report schema.

## Handoff Requirements

Every agent should leave a concise handoff:

- Workstream used.
- Files changed.
- Commands run and results.
- Shared files touched, if any.
- Downstream surfaces checked.
- Downstream surfaces not checked and why.
- Open questions or stop conditions.

## Final Integration Gate

Before considering a multi-agent batch complete, QA / Release should run the
highest practical gate set:

```bash
npm run lint
npm run lint:py
npm run build
npm run test:run
npm run verify:offline
npm run demo:news
```

If time is limited, the minimum integration gate is:

```bash
npm run build
npm run verify:offline
npm run demo:news
```
