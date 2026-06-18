# Spec Kit Task Routing

This compact routing guide is not a full process manual. Load it with
`AGENTS.md`, `.specify/workspace.yml`, and `.specify/memory/repository-map.md`.

## Default Rule

Start light. Upgrade only when evidence, risk, or scope requires it. Do not
route by matching user text keywords alone.

## Internal Skill Loading

Codex natively discovers only `.agents/skills/speckit-specify/SKILL.md`.
For later stages or reusable capabilities, read `ai/workflows/skill-routing.yml`
first, then load only the selected `.agents/spec-kit/skills/<skill>/SKILL.md`.
Do not pre-load the internal skill directory.

## Stage Continuation

Auto-continue is a stage contract, not report wording. When the current stage is
complete and the next stage is structurally known, execute the next required
stage in the same agent turn without asking the user to type the next command:
invoke the next command/skill when available, or load the selected internal
skill from `skill-routing.yml` and perform its steps inline. Stop only for
human acceptance, human clarification, owner decision, high-risk operation
confirmation, missing host/device/permission/tooling, build failure, validation
failure, unresolved blocker, unclosed source/runtime delivery chain, or explicit
user pause. If stopping, do not claim automatic entry; record `blockers` and
`next_required_human_action`. A plain completion summary or "自动进入"/
"continue to" promise without execution is non-compliant.

## Stage Progress Displays

When the user asks for Spec Kit progress, current stage, or next stage, show
stage rows with `阶段`, `状态`, and `阶段目标`. Use these objectives:

| Stage | Objective |
|-------|-----------|
| `speckit-intake` | Classify request risk/profile and write current feature routing state. |
| `speckit-specify` | Capture scope, acceptance criteria, affected repositories, and known risks. |
| `speckit-clarify` | Resolve or record only blocking high-impact ambiguities before planning. |
| `speckit-plan` | Create the smallest executable implementation and validation plan. |
| `speckit-tasks` | Break full-sdd or broad plans into ordered implementation tasks. |
| `speckit-analyze` | Check spec/plan/task consistency, blockers, and implementation readiness. |
| `speckit-checklist` | Validate implementation-readiness gates before source changes. |
| `speckit-implement` | Apply source changes and collect required AI-owned validation evidence. |
| `speckit-validation` | Record validation evidence for validation-only work. |
| `speckit-fact-layer` | Collect runtime, source, log, DOM, CSS, or CDP facts before risky fixes. |
| `speckit-knowledge-bootstrap` | Generate workspace-local knowledge drafts or apply portable knowledge packs without coupling templates to project facts. |
| `speckit-acceptance` | Produce user acceptance steps after AI validation is complete. |
| `speckit-simplify` | Do behavior-preserving cleanup after accepted functionality. |
| `speckit-test-hardening` | Add focused regression protection when it reduces real risk. |
| `speckit-retrospective` | Record workflow evidence and improvement candidates before commit. |
| `speckit-promote-lessons` | Promote only human-approved process improvements. |
| `speckit-commit` | Automatically stage and commit validated source scope with validated message format. |
| `speckit-post-commit-self-check` | Run exactly one automated post-commit workflow and evidence self-check. |
| `speckit-rubric-score` | Output final Rubric scoring only after post-commit self-check and enforce score gates. |
| `speckit-complete-branch` | Automatically cherry-pick local spec commits back to base after self-check and Rubric gates pass. |

## Profiles

- `micro-fix`: small, evidenced, low-blast-radius source change.
- `standard-bugfix`: compact fix with `spec.md` + `plan.md`; slices may skip `tasks.md`.
- `full-sdd`: public API, architecture, broad migration, cross-repo, real device semantics, or large UI/Biz/Libs boundary work.
- `blocked-investigation`: source behavior, runtime evidence, root cause, or validation condition is missing.
- `validation-only`: no product-code change; write validation evidence only.

Auxiliary labels such as `ui-parity`, `public-api`, and `cross-repo` are risk
flags, not separate default workflows.

## Hard Upgrade Gates

- Public API, SDK/Biz/UI boundary, cross-repo, identity, permission, connection,
  acquisition, or real-device behavior: do not use `micro-fix`.
- `full-sdd` must pass `tasks -> analyze -> checklist` before implementation; preflight blocks when `tasks.md`, `analysis.md`, or `checklists/implementation-readiness.md` is missing.
- `standard-bugfix` may skip `tasks.md` only when `plan.md` has complete `Implementation Slices`; it still runs `analyze` before implementation. Run `checklist` too for high-risk, UI/runtime, cross-repo, SDK/Biz boundary, or non-trivial validation-readiness work.
- Repeated same-class failure, unchanged symptom, unclear runtime state, or
  missing DOM/console/computed style/box metrics/SDK log/Biz log evidence:
  load `speckit-fact-layer` through `skill-routing.yml` before another patch.
- Initializing, replacing, or mounting `ai/knowledge`: load
  `speckit-knowledge-bootstrap` through `skill-routing.yml`; generated guides
  and installed pack guides route context only until source evidence or human
  review promotes them.
- Missing root cause or validation condition: route to `blocked-investigation` through `skill-routing.yml`.
- During `clarify` and `plan`, load the `test-plan` capability from
  `skill-routing.yml` when changed behavior needs API, E2E/interface,
  regression, fixture, smoke, UI, or device test planning. If the plan is
  obvious, record it and continue; if choices affect contracts, devices,
  fixtures, cost, or accepted gaps, stop for human review. Use
  `ai/knowledge/build/validation-capabilities.yml` first when selected; run
  `inspect-validation-capabilities` to refresh missing or stale repository
  facts. If E2E is unsupported, mark E2E `N/A` with a reason while keeping the
  API test plan required.
- During clarification, use A/B/C choices when clear: recommended choice first, impact/tradeoff per option, free-form only when needed.
- During `clarify` and `plan`, load `quality-vision` for UI/UX/copy/parity work and require a baseline screenshot/design/Qt source or owner-approved `N/A`.
- During `plan`, load `acceptance-rubric` after test/quality choices and make
  `acceptance-rubric.md` the judge contract for AI self-acceptance. Human-facing
  review artifacts should be Chinese-first; AI-only raw facts may stay English.
- Gate details are selected, not embedded. For plan/implement/validation work,
  run `select-gates` when risk flags, capability tags, affected repositories,
  or the `AI Context Contract` point to host CDP, frontend runtime sync, native
  bridge, Qt parity, or real-device evidence. Read only returned
  `ai/workflows/gates/*` packs.
- Host-embedded UI validation uses the `host-cdp` gate. Before declaring CDP
  blocked, run `ensure-host-cdp`, then
  `inspect-host-cdp-target` or `/json/list`; record selected
  `id/title/url/webSocketDebuggerUrl`. Product UI evidence rejects Plugin Workbench,
  `base-win.html`, `devtools://`, blank, and unrelated targets.
  Default CDP is `http://127.0.0.1:9222`; common targets include
  `app-main-window`. Save key-path CDP screenshots under
  `FEATURE_DIR/cdp-screenshots/` with `capture-cdp-screenshot`, and tell the
  human that screenshot directory when CDP validation ends.
- Frontend plugin UI changes use `frontend-runtime-sync`: source edit -> frontend build -> direct runtime replacement -> real host CDP verification through the real HostApplication Electron host, then final `.plugin` package/build evidence before commit/complete-branch.
- Native bridge/proto changes use `native-bridge`: `sync-native-runtime-artifacts`, host restart, duplicate proto checks, and `validate-rpc-proto-bundle` before human acceptance, then final `.plugin` package/build evidence before commit/complete-branch.
- All plugin types, including frontend, native, JS, and integrated plugin
  changes, use the shared `.plugin` build/package system as the final delivery
  validation gate. Repository-local build/export/runtime replacement is
  prerequisite or fallback validation evidence, not final plugin delivery.
- Qt-to-frontend UI parity uses `qt-parity`: read `qt-source-behavior-map.md`
  before broad source search and require a Source Behavior Execution Map when
  UI/Biz/SDK or real-device state semantics cross boundaries. Placeholder map
  files are not evidence; record new facts in the active feature first, and
  promote stable team knowledge only through retrospective/promote-lessons with
  explicit human approval.
- After code changes, load `ai-self-acceptance`: judge `acceptance-rubric.md`
  with build/test/CDP/browser/log/runtime evidence. PASS is required before
  human acceptance; FAIL loops to implement; BLOCKED requires a true external
  dependency.
- Source/runtime artifact mismatch: fix repository source before acceptance or commit.
- After `speckit-commit`, run exactly one `speckit-post-commit-self-check`.
  If the self-check makes deterministic fixes, amend the commit once, then
  continue without repeating self-check.
- Final Rubric scoring is only emitted after the one post-commit self-check.
  `validate-rubric-score` must pass before `speckit-complete-branch`: hard
  gates PASS, total score >=90, L1-L5 scores present, every dimension below 80
  has a blocker or owner/user accepted-gap evidence, evidence paths and
  deduction reasons are listed, and the complete-branch allow/deny conclusion
  is explicit.
- If `.specify/feature.json` says `delivery_profile`, `risk_level`, or `risk_flags`, use those structured fields for gates instead of the user's last natural-language phrase such as "进入下一阶段".

## Context Budget

- Always read repository-map before scanning source.
- Treat `.specify/feature.json` as current-feature state, not global truth. For `spec-kit`, shared workflow/governance, or unrelated repository tasks, do not apply stale feature risk flags or load `specs/<feature>/*` artifacts unless the user explicitly resumes that feature.
- Do not load `ai/knowledge/*`, `ai/tools/*`, `ai/workflows/gates/*`, old specs,
  roadmap/design docs, templates, or internal skills unless the current route
  requires them.
- When repository-map is too small, run `select-knowledge` or read `ai/knowledge/index.yml` first. Select by repos, risk flags, capability tags, stage, or explicit task terms; read only returned guides. This layer is deterministic and does not require full-text/BM25 search.
- When workflow gate details are needed, run `select-gates` or read `ai/workflows/gates/index.yml` first. Read only returned gate packs; keep command templates as stage contracts, not manuals.
- For `analyze` and `checklist`, read the `artifact_sections` listed in
  `.specify/templates/layer-manifest.yml` first. Expand to full files only when
  the section pass exposes a blocker, ambiguity, missing traceability, or an
  artifact explicitly needed by the stage.
- For `implement`, read `plan.md` `AI Context Contract` before broad artifact reading. It is the minimal manifest for decision-critical facts, exact source/command inputs, selected guides, and context to avoid; expand only if missing, contradicted, or marked incomplete.
- Prefer scripts for hard facts: log discovery, DevTools target detection, source/runtime consistency, changed-file classification, and validation command suggestions.
- After changing `spec-kit` templates or shared infra, run `validate-generated-context`, `validate-knowledge-index`, and `validate-context-budget` before trusting generated context, knowledge routing, skill routing, or command/gate compactness.

## Output Contract
When reporting routing, include:

- selected profile, affected repositories from repository-map, and next command
- internal skill path when loaded
- stage progress table with `阶段`, `状态`, and one-sentence `阶段目标` when reporting workflow progress or next-stage status
- facts, blockers, unknowns, and ignored hints, if any
