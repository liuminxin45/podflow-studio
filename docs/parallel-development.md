# Parallel Development Playbook

Repository-wide workstream ownership, safety rules, required preflight, Git discipline, and handoff
fields are defined in `AGENTS.md`. This playbook adds only the coordination protocol needed when
multiple tasks work against the same checkout or a shared pipeline contract.

## Completion Boundaries

Report completion at the narrowest level actually verified:

- Partial progress: the requested module moved forward.
- Build-surface success: focused tests or builds for the touched surface passed.
- Source closure: source, config, tests, and residue scans are settled.
- Consumer closure: downstream callers, UI, Electron, demo, or publish flow were verified.
- Final completion: the user's stated objective and the highest practical integration gates are complete.

If consumer closure was not checked, say so directly.

## Shared Contract Coordination

Use this protocol for state keys, schema fields, node order, config fields, IPC payloads, generated
artifacts, and publish package layouts:

1. Assign the Contract / Protocol workstream as the single owner of the shared surface.
2. Name the exact contract files and all known Python, Electron, TypeScript, demo, and test consumers.
3. Keep one current shape. Do not split work by adding aliases, dual writes, silent defaults, or legacy branches.
4. Land and verify the contract with its focused tests before dependent module changes begin.
5. Re-read the shared files after every parallel handoff; never resolve overlap by overwriting another task.
6. Run consumer checks after all dependent work lands, then scan for obsolete fields, constants, paths, and fixtures.

Default contract gates:

```bash
npm run verify:config
node scripts/python313.js -m pytest tests/test_episode_schema.py -q
npm run build
```

## Work Packet Template

Every delegated task needs a non-overlapping packet:

```text
Workstream:
Goal:
Allowed paths:
Do not touch:
Inputs consumed:
Outputs produced:
Shared contract changes allowed: no
Preflight:
  - git status --short --branch
  - git diff --name-only
  - read AGENTS.md
  - read docs/parallel-development.md
Narrow verification:
Integration verification:
Handoff notes required:
```

If shared contract changes are allowed, name the exact files, the intended current shape, and every
consumer that must be updated. A file has only one owner at a time.

## Scheduling

Low-conflict module work may proceed together when file ownership does not overlap. Work that consumes
a changing shared contract waits until that contract and its focused tests are stable. Git writes
(`add`, `commit`, `merge`, `rebase`, and `push`) remain serial even when source editing is parallel.

QA / Release runs the highest practical integration set after all handoffs:

```bash
npm run lint
npm run lint:py
npm run build
npm run test:run
npm run verify:offline
npm run demo:news
```

When the full set is not feasible, report each skipped command and why; local success must not be
presented as full integration success.
