# Acceptance: Discover Page Fixed-Version Workflow and AI Translation

## Summary

Branch `003-discover-page-ai-translate` updates the Discover page for fixed TrendRadar v6.10 usage:

- Removed the TrendRadar update check/update UI and the back button.
- Added a clear-current-collection action.
- Added clickable failed-source details.
- Added one-click AI translation for pure-English collected entries.
- Marked translated entries and preserved original text fields.

## Agent Validation Already Completed

- `npx tsc --noEmit --pretty false`: PASS
- `python -m py_compile engine\bridge.py`: PASS
- `npm run build`: PASS
- `npm install`: PASS
- `validate-feature-artifacts.ps1 -Stage implement`: PASS

## User Test Steps

1. Run the app and open the Discover page.
2. Confirm the header no longer shows TrendRadar update check/update controls or a back button.
3. Run a collection or use an existing collected list, then click `清空当前采集`; the list, selection count, filters, and failed-source summary should reset.
4. If a run has failed sources, click `查看明细`; the modal should show source ID, known name/type, and state that TrendRadar v6.10 does not provide exact failure reasons.
5. Use a list containing pure-English entries and configured Discover/Search LLM settings, then click `翻译英文`; only English untranslated entries should become Chinese and show `已翻译`.
6. Confirm translated items still retain URL/source fields and can proceed into the organize step.

## Expected Results

- Fixed-version UI has no update/back affordances.
- Clear action affects only the current Discover page list.
- Failure details are truthful and do not invent root causes.
- AI translation preserves originals through `original_title` and `original_content`.
- Non-English or already translated entries are skipped.

## Failure Signals

- Any removed button is still visible.
- Failed-source details claim a specific network/root cause not present in upstream data.
- Translation overwrites the only copy of original English text.
- Build or install no longer passes.

## Known Gaps

- No deterministic E2E runner is configured, so final UI smoke is manual.

## Accepted Gaps

- E2E automation remains N/A because the repository has no deterministic E2E runner. User accepted the feature after manual review on 2026-06-25.
