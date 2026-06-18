---
name: speckit-repository-map
description: Use when a Spec Kit stage needs workspace repository paths, roles, capability ownership, affected repository rows, workspace_root, default_base_branch, or multi-repo context without scanning source trees.
---

# Spec Kit Repository Map

Read `.specify/memory/repository-map.md` as the fixed workspace repository map.

Rules:

- Treat `.specify/memory/repository-map.md` as the source of truth for repository path, role, and capability ownership.
- When plugin source/build/runtime path context is needed, read the Project Path
  Categories section in `.specify/memory/repository-map.md` before scanning
  source trees. Use `ai/knowledge/build-and-package-notes.md` only on demand
  for expanded build/package path notes.
- Preserve path templates as relative placeholders such as `<workspace-root>`,
  `<host-app-root>`, `<app-data-root>`, `<plugin-id>`, `<version>`, and
  `<location>`. Do not convert them into machine-specific absolute paths in
  specs, plans, tasks, or long-term memory.
- Do not infer repository purpose by scanning source trees.
- In `specify`, select likely affected repositories from the fixed map and record uncertainty instead of guessing.
- Inspect source files only after the affected repository is identified and only to confirm concrete identifiers such as API names, source paths, or source behavior references.
- If the map is stale or incomplete, stop and ask the user to update the fixed map.

Output shape:

- `workspace_root`
- `default_base_branch`
- `repository_map`
- affected rows: `Repository`, `Path`, `Role`, `Capability / Ownership`, `Why affected / N/A`
- path categories needed by the task: `Category`, `Relative Path Template`,
  `Owner / Source`, `Why needed / N/A`

## Spec Kit L4 Governance

This is an executable subskill installed under `.agents/spec-kit/skills`. Long-term L4
guidance lives in `ai/tools/*` when tool policy is needed. This skill supplies repository
facts only; the LLM owns semantic routing and compatibility judgment. Do not use
tool output to bypass `.specify/memory/repository-map.md`.
