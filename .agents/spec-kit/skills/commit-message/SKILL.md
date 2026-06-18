---
name: commit-message
description: "Generate or validate team Git commit messages using the single HostApplication / application Chinese commit-message template."
---

# Commit Message

Generate a Git commit message that follows the local team convention. Return only the commit message unless the user asks for explanation.

The only approved template is the team template encoded in this skill and
validated by `validate-commit-message`. Do not depend on a user-specific local
memory path, and do not use any alternate compact or simplified format.

Required section order:

```text
<English title summary>

<one-line Chinese summary>

【提交类型】
<type>

【问题描述】
<problemDescription>

【修改方案】 or 【修复方案】
<solution>

【影响评估】
<impact>

【兼容性分析】
<compatibility>

【需要同时入库的提交】
<coSubmitted or 无>

【自测结果】
<selfTest>
```

## Inputs

Prefer structured inputs when available, but always map them into the approved
template:

- `scope`: module or feature area.
- `shortDesc`: English title summary.
- `detail`: one-line Chinese summary.
- `type`: content for `【提交类型】`.
- `problemDescription`: content for `【问题描述】` when relevant.
- `solution`: content for `【修改方案】` or `【修复方案】` when the template requires it.
- `impact`: content for `【影响评估】`.
- `compatibility`: content for `【兼容性分析】`.
- `coSubmitted`: content for `【需要同时入库的提交】`; use `无` when none.
- `selfTest`: content for `【自测结果】`.

If the user provides a diff instead of fields, infer the sections from the diff.
Ask only when the required template content cannot be inferred safely.

## Output Format

Use the order and section names from the approved template exactly.
Keep every non-empty line at most 68 display columns. Count ASCII as roughly
one display column and East Asian wide/full-width characters as roughly two.
Wrap semantically without splitting paths, commands, RPC names, class names,
filenames, versions, or other technical tokens.

## Applying the Message

When creating or amending a commit, write the complete generated message to a
UTF-8 file and use `git commit -F <message-file>` or
`git commit --amend -F <message-file>`. Do not use `git commit -m` for this
multi-section template. In PowerShell, embedded newlines inside `-m` arguments
can be truncated by Git to the first line, leaving empty required sections.
After committing, read `git show --no-patch --format=%B HEAD` into a message
file and validate the committed text against the same template before reporting
success.

## Examples

Use only the example in the approved template. Older examples or references do
not override it.

## Spec Kit L4 Governance

This is an executable subskill installed under `.agents/spec-kit/skills`. Long-term L4
tool guidance lives in `ai/tools/*` when a tool action needs it.
Commit-message generation does not require MCP. If external tool output is used
as evidence for a commit, follow `ai/tools/mcp-usage-policy.md` and
`ai/tools/mcp-permissions.md`.
