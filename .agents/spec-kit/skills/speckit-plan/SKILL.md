---
name: "speckit-plan"
description: "Create an implementation plan for a CoreRuntime capability while preserving upstream design artifacts."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/plan.md"
---


## User Input

```text
$ARGUMENTS
```

## Context Contract

Default context is `AGENTS.md`, `.specify/workspace.yml`, `.specify/memory/repository-map.md`, `.specify/feature.json` when present, and `ai/workflows/task-routing.md`.
Load `ai/knowledge/*`, `ai/tools/*`, `ai/templates/*`, old `specs/*`, or design-history docs only when this command explicitly needs them.
Scripts provide `facts`, `blockers`, `unknowns`, and `hints`; LLM owns semantic routing, root-cause judgment, validation sufficiency, and tradeoff decisions.
Keep this command stage-specific. Do not duplicate long-term governance prose here.

## Stage Continuation Rule

Apply the central Stage Continuation Contract from `ai/workflows/task-routing.md`; if this stage cannot execute the next required stage, report `blockers` and `next_required_human_action`.

## Purpose

Create `plan.md` from the active `spec.md`. The plan is a decision map, not a comprehensive design manual. It must identify the facts, slices, gate packs, and validation evidence required for implementation while leaving detailed truth in code, scripts, selected facts, and source artifacts.

For `micro-fix`, keep the lightweight evidence path unless the bug is no longer micro. For `blocked-investigation`, plan facts to collect instead of implementation.

## Layered Artifact Contract

- This command creates the L2 artifact set from `.specify/templates/layer-manifest.yml`.
- Required L2 outputs are `plan.md` and `workflow-state.json`.
- `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` are created when applicable or marked `N/A` with reasons.
- `plan.md` must include `L2 Artifact Contract` from `.specify/templates/plan-template.md`.
- `workflow-state.json` remains the structured source for attempts, validations, fact-layer, acceptance, retrospective, and promotion state.

## Language Rules

- Human-reviewed artifacts use Chinese-first style: `plan.md`, `quickstart.md`, and user-facing summaries.
- AI-oriented artifacts use English-first style: `research.md`, `data-model.md`, and `contracts/`.
- Preserve technical identifiers in their original language.
- In `contracts/`, never translate interface names, event names, JSON keys, DTO fields, status values, operation names, or protocol terms.

## Execution Steps

1. Run the setup script and parse `FEATURE_SPEC`, `IMPL_PLAN`, `SPECS_DIR`, and branch facts.
2. Load only required context:
   - `FEATURE_SPEC`
   - `SPECS_DIR/intake.md` when present
   - `.specify/feature.json` routing fields when present
   - `.specify/memory/constitution.md` when present
   - `.specify/templates/plan-template.md`
   - existing design artifacts in `SPECS_DIR` only when applicable
3. Run `select-gates` for stage `plan`.
   - Record selected gate pack paths in `AI Context Contract`.
   - Use selected packs to decide required facts and validation evidence.
4. Run `select-knowledge` only when repository-map, feature artifacts, and selected gate packs are not enough.
   - Read only returned `ai/knowledge/*` guides.
   - Do not load all guides and do not use full-text/BM25 search.
5. Load `speckit-test-plan` through `ai/workflows/skill-routing.yml` when
   changed behavior needs API, E2E/interface, regression, fixture, smoke, UI,
   or device test planning.
   - If the test-case plan is obvious, record `approved-by-ai-obvious` and
     keep it for final human review.
   - If test choices affect public contracts, device coverage, fixtures, test
     cost, or accepted gaps, stop for human review before implementation.
6. Load `speckit-quality-vision` for UI/UX/copy/parity work and create or link `quality-vision.md` with baseline screenshot/design/Qt source or owner-approved `N/A`.
7. Load `speckit-acceptance-rubric`; create or link `acceptance-rubric.md` as the judge contract for `speckit-ai-self-acceptance`.
8. Fill `plan.md` as a focused decision map:
   - `人类审核摘要`, which is navigation only and must 不得替代或删减 later AI sections.
   - `必需人工决策` only when owner/user input is truly required.
   - `AI Context Contract`: decision-critical facts, exact sources/commands, selected gate packs, context to load, context to avoid, and missing facts/blockers.
   - Delivery profile, task type, affected repositories, and routing assumptions.
   - Root Cause Evidence for bugfix work, including Counterexample, Blast Radius, and Validation Mapping.
   - Affected modules, ownership boundaries, public contract impact, and file ownership decisions.
   - `Quality Vision Link`: quality tier, UI baseline status, and human baseline decision if any.
   - `测试用例计划`: API/E2E/interface/regression/fixture/smoke rows, review
     status, and N/A reasons.
   - `Acceptance Rubric Link`: rubric path, Essential/Pitfall counts, and review state.
   - Implementation Slices with allowed scope, forbidden scope, validation, progress update, and stop conditions.
   - Validation plan and `AI Self-Acceptance Contract`.
9. Produce or update supporting artifacts only when the capability needs them:
   - `research.md`: unknowns, tradeoffs, prior art, source behavior discovery, and alternatives rejected.
   - `data-model.md`: durable state, DTOs, serialized fields, SDK structs, UI state, or database-like records.
   - `contracts/`: public headers, SDK APIs, bridge payloads, frontend props/events/state, CLI/script IO, or protocol terms.
   - `quickstart.md`: reviewer exercise path and preservation strategy.
10. Update `review.md` with approach, affected repositories, highest-risk boundaries, validation entry, known gaps, and links to important artifacts.
11. If a selected gate exposes missing facts, plan a bounded investigation or fact-layer slice before source edits.

## Gate Pack Planning

Gate packs are load-on-demand workflow maps under `ai/workflows/gates/*`:

- `qt-parity`: requires Qt source behavior coverage and, for cross-layer migration, a Source Behavior Execution Map.
- `host-cdp`: requires real host CDP target selection and rejects wrong-target evidence.
- `frontend-runtime-sync`: requires source edit -> frontend build -> direct runtime replacement -> real host CDP verification, followed by final `.plugin` package evidence before commit/complete-branch.
- `plugin-package`: all frontend/native/JS/plugin integration changes require the shared `.plugin` build/package gate; repository-local build/export is prerequisite evidence only.
- `native-bridge`: requires native build/export, `sync-native-runtime-artifacts`, host restart, and `validate-rpc-proto-bundle` when RPC/proto fields change.
- `real-device`: requires AI-owned SDK/Biz/device validation unless a real external blocker is proven.

Do not paste full gate details into `plan.md`; cite selected gate ids and record only the facts needed for this capability.

## Planning Rules

- Prefer existing architecture and helper APIs.
- Treat context as an engineering input. Do not stuff the plan with broad background; put avoided context under `Context To Avoid`.
- Use bounded search from repository-map, affected repositories, known module directories, and named symbols/files with `rg`; do not scan the whole `workspace_root`.
- Do not spawn a subagent/explorer for simple local lookup.
- If root cause is unknown, write a bounded investigation slice with search scope, command budget, stop conditions, and evidence to collect.
- For migration, do not plan implementation without source behavior reference or explicit owner-approved N/A.
- For UI/UX changes, every new or modified icon, tooltip, label, menu item, button, layout/style rule, and visible interaction state must cite a reliable source.
- For UI parity work, selected gate packs must name source behavior, target UI, UI element traversal inventory, dynamic states, host validation, scrollbar, clipping, compression, and runtime DOM / computed style / box metrics evidence.
- For host-embedded frontend work, static design files alone are insufficient; plan dynamic states, geometry constraints, runtime DOM/computed/box metrics, and host-level validation.
- `ServiceBridge` is forwarding-only. Runtime facts belong in `CoreRuntime`; UI-display structure belongs in frontend plugin source.
- Cross-boundary device identity is UUID decimal string only. Do not expose SDK native ids, virtual ids, handles, or parallel frontend ids above their owner layer.
- Do not dump unrelated responsibilities into one interface/data-layer file.
- Do not use `Known Gaps` to pass the exact risk introduced by the fix. That is blocking or high risk, not PASS.
- A `Known Gap` on changed core behavior remains blocking unless explicitly owner-approved.
- Do not let AI freely invent test coverage. API/E2E/interface test-case rows
  must trace to scenarios, requirements, contracts, or risk; ambiguous plans
  require human review before implementation.
- Do not let AI self-acceptance judge UI without a baseline in `quality-vision.md` or an explicit owner-approved `N/A`.
- `acceptance-rubric.md` must include self-contained Essential and Pitfall criteria before code changes for non-trivial implementation work.
- Plan acceptance, simplify, optional test-hardening, retrospective, optional promote-lessons, commit, one post-commit self-check, final Rubric score, and complete-branch as separate stages.

## Human Review Rules

- `## 人类审核摘要` must be concise: goal, real scope, validation entry, remaining risk, and next stage.
- Add `## 必需人工决策` only for product/business choices, owner-approved gaps, external validation AI cannot perform, user acceptance, commit, or branch completion.
- Do not ask the developer to confirm root cause correctness, test sufficiency, fallback quality, or ordinary technical plan quality. If uncertain, mark the plan blocked or high risk.

## Fact Layer Planning

- Use `speckit.fact-layer` and plan `fact-pack.md` when runtime DOM, console, computed style, box metrics, latest SDK/Biz logs, or source/runtime/build/install consistency evidence is needed.
- Treat a second same-class fix without new facts as a planning risk and route to fact-layer before implementation. Use chrome-devtools or equivalent runtime evidence for computed style and box metrics.

## Output

Report in Chinese:

- Plan path.
- Review path.
- Selected gate packs and selected knowledge guides.
- Local spec branch and cross-repo branch gaps.
- Design artifacts created or updated.
- Main risks.
- Validation plan and known gaps.
- Required next stage:
  - `full-sdd`: `speckit.tasks` / `$speckit-tasks`.
  - `standard-bugfix`: `speckit.analyze` / `$speckit-analyze` when `plan.md` contains complete `Implementation Slices`; otherwise `speckit.tasks`.
  - `micro-fix`: `speckit.implement` only when lightweight evidence names changed files, validation, stop conditions, and root cause.
  - `blocked-investigation`: `speckit.fact-layer` or `speckit.bounded-investigation`.
  - `validation-only`: `speckit.validation`.
