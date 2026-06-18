---
name: "speckit-promote-lessons"
description: "Promote human-approved retrospective lessons into Spec Kit tools, memory, or team documentation."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "spec-kit"
  source: "templates/commands/promote-lessons.md"
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

After `speckit.retrospective`, promote only human-approved improvement
candidates into long-lived locations such as `spec-kit`, `.specify/memory`,
or `TEAM-README.md`. This stage converts reviewed lessons into durable process
rules, templates, checklist items, workflow gates, or memory entries.

This stage is conditional and usually auto-skips. It must not promote `pending`
or `rejected` candidates, and it must not infer approval from importance,
confidence, or repeated failures. Human approval is required before any edit to
spec-kit, TEAM-README, .specify/memory, or other team governance files.

## Language Rules

- Human-facing reports and review prompts use Chinese-first style.
- Preserve technical identifiers in their original form: paths, commands,
  check IDs, workflow stage names, branch names, repositories, and MCP names.
- Separate candidate facts from AI inferences when explaining the promotion.

## Execution Steps

1. Run the prerequisite script and parse `FEATURE_DIR` and `AVAILABLE_DOCS`.
2. Load:
   - `FEATURE_DIR/workflow-record.md`
   - `FEATURE_DIR/improvement-candidates.md`
   - `FEATURE_DIR/promotion-report.md` when present
   - `FEATURE_DIR/validation.md` when present
   - `FEATURE_DIR/evidence.md` when present
   - `FEATURE_DIR/review.md` when present
   - `FEATURE_DIR/progress.md` when present
3. Parse `improvement-candidates.md` and classify candidates by review status:
   - no candidates / `status: no-candidates`: write a skipped report and
     continue without asking for approval.
   - `pending`: not approved; do not edit any long-lived target.
   - `approved`: eligible for promotion after explicit confirmation.
   - `rejected`: keep as record only; do not promote.
4. If no candidate is `approved`, create or update
   `FEATURE_DIR/promotion-report.md` with `status: skipped-no-approved-candidates`
   and continue to `speckit.commit` without a human gate.
5. For each `approved` candidate, verify it includes:
   - Type.
   - Lesson.
   - Trigger condition.
   - Recommended landing place.
   - Expected benefit.
   - Risk of over-generalization.
   - Advanced-model context benefit, scriptability, and minimal decision
     evidence pack when the candidate came from the current retrospective
     template.
   - Human approval evidence.
6. Before editing long-lived targets, show a concise promotion plan and wait for
   explicit human approval for the exact target files.
7. Apply each approved candidate to the narrowest durable location:
   - `spec-kit/templates/commands/*.md` for command behavior.
   - `spec-kit/workflows/speckit/workflow.yml` for stage order or gate
     routing.
   - `spec-kit/checklist-rules/*.yml` or checklist templates for
     recurring quality gates.
   - `.specify/memory/*.md` for project-local, evidence-backed memory.
   - `TEAM-README.md` for team workflow rules and operating guidance.
   - `spec-kit/templates/ai/templates/validation-template.md` or
     `spec-kit/templates/ai/templates/evidence-template.md` for reusable
     validation/evidence structure improvements.
   - Tests under `spec-kit/tests/` when the lesson changes enforceable
     behavior.
8. Keep edits minimal and traceable:
   - Do not broaden a candidate beyond its trigger condition.
   - Do not create a generic policy from a one-off failure unless the candidate
     evidence supports recurrence.
   - Do not duplicate the same rule in multiple locations unless one location
     is human-facing and the other is an executable/enforceable gate.
9. Update `FEATURE_DIR/promotion-report.md` with:
   - Candidate ID.
   - Review status.
   - Target files changed.
   - Summary of edits.
   - Validation command and result.
   - Unpromoted candidates and reason.
10. Update `review.md` when present so the human navigation page links to
    `promotion-report.md`.
11. Continue to `speckit.commit` after promotion is completed or explicitly
    skipped. Promotion edits long-lived governance files and must be included
    in the confirmed commit scope before branch completion.

## Approved Candidate Format

Candidates are eligible only when the candidate entry contains an explicit
approval state:

```md
## Candidate N
- 类型:
- 经验:
- 触发条件:
- 推荐落盘位置:
- 预期收益:
- 过度泛化风险:
- 高级模型上下文收益:
- 可脚本化程度:
- 最小决策证据包:
- 人工审核结论: approved
- 审核人/来源:
- 批准范围:
```

Allowed review states are `pending | approved | rejected`.

## Promotion Report Template

```md
# 沉淀报告

## 1. 状态
- status:
- source:
- 已沉淀候选:
- 跳过候选:

## 2. 已沉淀候选
- Candidate:
- 审核证据:
- 目标文件:
- 修改摘要:
- 验证:

## 3. 未沉淀候选
- Candidate:
- 原因:
- 后续动作:

## 4. 风险控制
- 是否过度泛化:
- 是否重复规则:
- 是否需要团队复审:
```

## Quality Rules

- Do not promote `pending` candidates.
- Do not promote `rejected` candidates.
- Do not treat AI confidence as human approval.
- Do not promote a validation or evidence rule unless the candidate identifies
  the concrete workflow failure and the target evidence artifact it improves.
- Do not modify product code from this stage.
- Do not stage, commit, cherry-pick, merge, push, delete branches, or create
  remote tracking from this stage.
- Prefer one precise rule in the right place over broad duplicated guidance.
- When the target is `.specify/memory`, write only durable, evidence-backed
  project memory. Avoid secrets, one-off volatile notes, and long transcripts.
- When the target is `spec-kit`, add or update tests when the promoted
  lesson changes workflow behavior, command behavior, or quality gates.

## Output

Report in Chinese:

- Approved candidates promoted.
- Pending/rejected candidates skipped.
- Target files changed.
- Validation command and result.
- `promotion-report.md` path.
- Confirmation that product code, git history, branches, remotes, and
  unapproved .specify/memory/tools changes were not modified.
- Required next stage: `speckit.commit` / `$speckit-commit`.
