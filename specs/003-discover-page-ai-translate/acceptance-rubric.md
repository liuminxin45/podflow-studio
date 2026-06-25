# Acceptance Rubric: Discover Page Fixed-Version Workflow and AI Translation

**Feature**: `003-discover-page-ai-translate`  
**Date**: 2026-06-25  
**Quality Tier**: polished

## Rubric

| ID | Criterion | Pass Standard | Score |
| --- | --- | --- | --- |
| R-001 | Fixed-version controls | Discover page no longer shows TrendRadar update check/update controls or the back button, and removed props do not leave dead TypeScript references. | PASS |
| R-002 | Clear current collection | User can clear current collected entries in one action; selected items, failed-source metadata, and filters reset for the current session. | PASS |
| R-003 | Failed source details | Failed-source count is clickable when failures exist and shows source ID plus known name/type; missing error reasons are labeled as upstream-unavailable, not guessed. | PASS |
| R-004 | AI translation | One-click action translates only pure-English untranslated items through existing Discover LLM config, preserves originals, updates display/proceeding text, and marks translated items. | PASS |
| R-005 | Validation | `npm run build` completes successfully, or any failure is unrelated and documented with evidence. | PASS |

## Rejection Triggers

- Update/back controls still visible on the Discover page.
- Failed source details invent root causes that TrendRadar v6.10 does not provide.
- Translation overwrites text without preserving originals.
- Already translated or non-English items are repeatedly sent to the AI translation action.
- Build fails because of type, import, or lint issues introduced by the change.

## Evidence Targets

- Source diff for `src/components/DiscoverPanel.tsx`, `src/types/trendradar.ts`, and `engine/bridge.py`.
- `npm run build` output.
- Final acceptance notes with E2E N/A rationale.
