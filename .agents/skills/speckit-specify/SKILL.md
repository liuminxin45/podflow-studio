---
name: "speckit-specify"
description: "Create or update a CoreRuntime capability specification from a natural language request."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/specify.md"
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

Turn the request into a capability specification in `specs/<feature>/spec.md`
and persist the active local spec branch / feature path in
`.specify/feature.json`.

Also create or update `review.md` as a human navigation page for the feature.
`review.md` is additive only; it must not replace `spec.md`, `plan.md`,
`tasks.md`, or other AI-readable workflow artifacts.

Use `.specify/memory/repository-map.md` as the fixed Workspace Repository Map.
It is the authoritative Repository / Path / Role / Capability table for this
multi-repository workspace. Do not guess repository roles. Do not infer
repository roles by scanning repository files during `specify`.
Use the `speckit-repository-map` subskill for this lookup instead of embedding
repository-discovery logic in the main command.

Use `AGENTS.md` and `ai/workflows/task-routing.md` as the entry context. They
define the minimal reading order, workflow profiles, and the boundary between
script facts and LLM semantic judgment. Do not duplicate long-term routing
rules in `spec.md`; cite the entry context and record only feature-specific
routing decisions.

## Layered Artifact Contract

- This command creates the L1 artifact set from `.specify/templates/layer-manifest.yml`.
- Required L1 outputs are `spec.md`, `review.md`, and `workflow-state.json`.
- `spec.md` must include the `L1 Artifact Contract` section from
  `.specify/templates/spec-template.md`.
- `.specify/feature.json` and `workflow-state.json` hold structured workflow
  state; prose sections explain decisions but do not replace structured state.

Use "Capability Scenario" instead of generic "User Story". A capability
scenario must be independently understandable and independently verifiable,
even when it covers SDK, NativePlugin/ServiceBridge bridge, HostApplication, frontend plugin,
device integration, migration, or tooling work.

## Language Rules

- `spec.md` is a human-reviewed artifact. Write headings, explanations,
  requirements, scenarios, assumptions, risks, and open questions in
  Chinese-first style.
- `spec.md` must include a top `## 人类审核摘要` section for fast human
  review. This section is additive only: it must summarize the highest-signal
  decisions, risks, N/A boundaries, validation entry, and next step, and 不得替代或删减
  later AI/流程读取区 such as scenarios, functional requirements, compatibility
  boundaries, validation expectations, assumptions, and open questions.
- Preserve technical identifiers in their original form: file paths, module
  names, class names, function names, APIs, fields, enum/status values,
  commands, and test names.
- Keep structural labels and IDs stable: `CS1`, `FR-001`, `Given/When/Then`,
  `Task Type`, `N/A`, and `NEEDS CLARIFICATION` may remain English.

## Pre-Execution Checks

1. The user input must describe a concrete capability, bug fix, migration,
   workflow, or internal tooling change.
2. Choose a short kebab-case feature name from the request, unless the user
   explicitly provides a `NNN-short-name` spec branch.
3. Create or switch to the local spec branch before writing the spec:
   - PowerShell: `.specify/scripts/powershell/create-spec-branch.ps1 -FeatureName "<short-name>" -AllowDirty -Json`
4. The branch is local-only. Do not push it or create remote tracking.
5. When `.specify/workspace.yml` lists additional repositories, create or switch
   to the same spec branch in every existing workspace repository.
6. The branch script must pass preflight for all workspace repositories before
   creating or switching any branch. Untracked and generated dirty entries are
   recorded as risks and left untouched. If tracked files have uncommitted
   changes, stop and ask the user whether to stash, clean up, or commit before
   creating or switching branches.

## Execution Steps

1. Resolve the local spec branch and feature directory from the branch script.
   - Preferred branch format: `NNN-short-capability-name`.
   - Preferred feature directory: `specs/<spec-branch>`.
   - Preserve existing `.specify/feature.json` intake fields while updating
     `feature_directory`, `spec_branch`, and `branch_local_only`.

   ```json
   {
     "feature_directory": "specs/<spec-branch>",
     "spec_branch": "<spec-branch>",
     "branch_local_only": true,
     "...existing_intake_fields": "preserve"
   }
   ```

2. Load context.
   - Existing `intake.md` in the feature directory, if present.
   - `.specify/feature.json` task type and routing fields, if present.
   - Existing `spec.md` in the feature directory, if present.
   - `.specify/memory/constitution.md`, if present.
   - `.specify/memory/repository-map.md` as the fixed Workspace Repository Map.
     This map provides workspace_root, default_base_branch, and the
     Repository / Path / Role / Capability table.
     Use the `speckit-repository-map` subskill to read and summarize it.
   - Do not scan repository files to rediscover what each repository does.
     Nearby repo files may be inspected only after the map identifies an
     affected repository and only to confirm concrete identifiers such as
     existing API names, source paths, or source behavior references.

3. Create or update `spec.md` using `.specify/templates/spec-template.md`.
4. Create or update `review.md`.
   - Summarize the feature goal, risk level if known, affected repositories,
     highest-signal review points, validation entry, and current next stage.
   - Link or name `spec.md`.
   - Include a compact "Workspace Repository Map" reference: workspace_root,
     default_base_branch, and the affected rows from
     `.specify/memory/repository-map.md`.
   - State that complete AI execution still requires reading full
     `spec.md`/`plan.md`/`tasks.md`.

5. Specify only observable behavior and engineering constraints.
   - Do not prescribe implementation details unless they are compatibility or
     integration requirements.
   - Make assumptions explicit.
   - Mark unresolved choices as `NEEDS CLARIFICATION`.

6. Include team-relevant sections.
   - Human review summary near the top. Keep it concise and reviewer-focused;
     do not use it as a substitute for the full AI-readable sections.
   - Intake summary and task type.
   - Workspace Repository Map summary:
     - workspace_root and default_base_branch from the branch script or
       `.specify/memory/repository-map.md`.
     - affected repository rows copied or summarized from the fixed map.
     - each row should preserve Repository / Path / Role / Capability.
     - if affected repositories are unclear, record uncertainty instead of
       scanning repos to infer ownership.
   - Capability overview.
   - Capability scenarios.
   - Functional requirements.
   - Compatibility and integration boundaries.
   - UI design/source directories for migration or new-feature when UI is
     involved.
   - Affected modules, if known.
   - Validation expectations.
   - Out of scope.
   - Assumptions and open questions.

7. Generate `checklists/requirements.md` to validate requirement quality.
   Use `.specify/templates/checklist-template.md` as the stable skeleton, then
   read `.specify/checklist-rules/common.yml` plus the task-relevant rule packs
   under `.specify/checklist-rules/`:
   - Choose by `.specify/feature.json` `task_type` first:
     `new-feature.yml`, `migration.yml`, `bugfix.yml`, or `needs-routing`
     handling from `common.yml`.
   - Add focused packs such as `tooling.yml` when the capability affects CLI,
     scripts, generated artifacts, docs, or internal tools.
   - Treat rule packs as generation guardrails, not rigid prose: keep mandatory
     checks and evidence requirements stable, but adapt notes and any
     task-specific checks to the actual `spec.md`.
   - For each checklist item, decide pass / missing / `N/A` from evidence in
     `spec.md`, `intake.md`, `.specify/feature.json`,
     `.specify/memory/constitution.md`, or named project files. Do not mark an
     item satisfied from model intuition alone.
   - Every `N/A` must include a short reason. Every unchecked item must state
     the missing evidence or required clarification.
   Include checks for clarity, compatibility, affected modules, validation
   expectations, and local-only spec branch status.
8. Validate the generated checklist when the script exists:
   - PowerShell: `.specify/scripts/powershell/validate-checklist.ps1 -FeatureDir "<feature-dir>"`
   If validation fails, fix the checklist or spec evidence and rerun validation
   before reporting completion.

## Quality Rules

- Every requirement must be testable or reviewable.
- Every capability scenario must state success and failure behavior.
- Mention real-device, virtual-device, SDK, plugin, encoding, or UI state
  boundaries when relevant.
- For UI state, UI interaction, operation availability, or device runtime UI:
  - State that `ServiceBridge` is an API forwarding bridge only and must not
    implement business logic, device-state inference, permission/availability
    decisions, or UI behavior rule calculation.
  - State that non-UI-specific runtime facts, permission/capability data, and
    reusable business rules belong in `CoreRuntime`.
  - State that UI-display-specific composition, such as interaction surface structure,
    order, visible/enabled presentation, and action entry layout, belongs
    in the frontend plugin and must be based on `CoreRuntime` facts obtained
    through the bridge.
  - Do not allow frontend label/string inference, fake runtime facts, or durable
    caching of device/runtime/permission truth.
- For device identity, runtime state, RPC/N-API, JS/UI, or public API work:
  - State that cross-boundary device identity must be UUID decimal string only.
    Do not introduce parallel identities such as `deviceIndex`, `deviceId`,
    `handleId`, or `virtualDeviceId`.
  - State that UUID generation belongs only to
    `device::identity::generateUUID()`; `DeviceManager`, `SdkService`, and UI
    code only use the identity.
  - State that SDK native id, virtual id, and handle are bottom-layer
    implementation details and must not cross Libs facade/Biz/UI boundaries.
  - State that frontend business operations use `node.uuid` only, not
    `node.id`, `entityId`, or `metadata.uuid` fallbacks.
  - State that equivalent legacy APIs, debug/test APIs in production exports,
    cross-layer caches, and build artifact based interface judgments are not
    allowed unless an owner-approved temporary gap is recorded.
- For `migration`, preserve source Qt behavior references and equivalence
  expectations from `intake.md`.
- For UI-interaction or operation-availability `migration`, include Qt source
  behavior coverage. It must cover object/device type, device state/condition,
  UI element order or action order, visible/enabled rules, action handler,
  keep/change/gap notes, and target contract source. Recommend a table for
  simple cases, but allow grouping, decision tables, state-machine notes,
  fixture matrices, or per-Qt-function rule lists.
- For `bugfix`, include actual behavior, expected behavior, repro path, and
  regression expectation from `intake.md`.
- For `new-feature`, include why it is not direct migration and the new
  capability acceptance signal from `intake.md`.
- For any UI/UX/visible-copy task, including `migration`, `new-feature`, and
  bugfixes that affect icons, tooltip text/style, labels, menus, buttons,
  visible state, layout, spacing, or interaction, include design/source
  directory paths and a UI / UX / 文案依据追踪 section. Each changed visible
  element must cite a reliable source: Qt UI/source/delegate/QSS/resource,
  product design/mockup/export, screenshot, existing target-app convention, or
  explicit owner/user decision. If no reliable source is found after bounded
  search, record `NEEDS CLARIFICATION` instead of inventing UI.
- Do not create hidden tasks or implementation steps in the spec.
- Do not introduce GitHub issue, remote push, or remote tracking assumptions.
- Do not infer repository roles by scanning repository files. Use
  `.specify/memory/repository-map.md` as the source of truth. If it is stale or
  incomplete, stop and ask the user to update that fixed map.
- The spec branch is the workflow identity; final completion happens only after
  acceptance, simplify, optional test-hardening, retrospective/留痕, optional
  promote-lessons, commit, one post-commit self-check, final Rubric score, and
  complete-branch.
- Commit and branch-state completion are automated only after their hard gates
  pass; they still do not push or create remote tracking.
- Branch completion cherry-picks back to the configured base branch and keeps
  the local spec branch by default. Do not push or create remote tracking.

## Output

Report in Chinese:

- Feature directory.
- Local spec branch.
- Workspace repositories switched or missing, including workspace_root,
  default_base_branch, and repository_map path.
- Affected repository map rows from `.specify/memory/repository-map.md`.
- Spec path.
- Review path.
- Checklist path.
- Key assumptions.
- Clarifications still needed.
- Required next stage: auto-capable `speckit.clarify` / `$speckit-clarify`.
- Do not present `clarify` and `plan` as parallel choices. `plan` starts after
  `clarify` asks required high-impact questions or records that no blocking
  clarification is needed.
- Human review prompt:
  - Ask only for required human decisions: product/business choices,
    owner-approved gaps, missing external inputs, user acceptance, commit, or
    branch completion.
  - Do not ask the developer to confirm root cause correctness, test sufficiency,
    fallback quality, or ordinary technical plan acceptability.
  - If no high-impact ambiguity or blocked risk exists, continue through the
    auto-capable clarification stage without adding a fixed manual gate.

## Internal Stage Loading

- This is the only Spec Kit skill exposed for native Codex discovery.
- When a later Spec Kit stage is structurally required, load only that
  stage contract from `.agents/spec-kit/skills/speckit-<stage>/SKILL.md`.
- Do not pre-load the internal skill directory; read one hidden skill at a
  time after routing proves the stage is needed.
