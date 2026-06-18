# Validation

This is the default L5 validation summary for a feature. It records what was
checked and what the result means. It pairs with `acceptance.md`; validation-only
work also writes into this file instead of creating a separate report.

## 1. Scope

- Feature:
- Repositories:
- Delivery profile:
- Risk level:
- Validation owner:

## 2. Validation Matrix

| Target | Command / Manual Check | Expected Result | Actual Result | Evidence |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 3. Result Interpretation

- Passed checks:
- Failed checks:
- Not run:
- Known gaps:
- LLM judgment:

## 4. Routing Impact

- Continue current workflow:
- Return to implement:
- Return to plan/tasks:
- Escalate to fact-layer:
- Human/user acceptance required:

## 5. Evidence Links

- `acceptance.md`:
- `evidence.md` (optional for complex/runtime/tool-heavy evidence):
- `fact-pack.md` (optional fact-layer evidence):
- Logs:
- Screenshots:
- CDP screenshot directory:
- Test output:

## 6. Validation Context Contract

- Decision-critical facts used:
- Evidence sources actually loaded:
- Context intentionally not loaded:
- Missing facts:
- Sufficiency judgment:
- Reason this is enough for AI acceptance:

## 7. Host Frontend Delivery Chain

- Applies:
- Source edit evidence:
- Frontend build command/result:
- Direct runtime replacement evidence (`sync-ui-runtime-artifacts`):
- Runtime plugin directory:
- Removed stale runtime files:
- Real host CDP target id/title/url:
- Key-path CDP screenshots:
- Loaded resource evidence:
- Final `.plugin` package evidence (all plugin types):

## 8. Native Runtime Delivery Chain

- Applies:
- Native source edit evidence:
- Native build/export command/result:
- Runtime replacement evidence (`sync-native-runtime-artifacts`):
- Runtime plugin directory:
- Runtime `native/` addon hash parity:
- Root `.proto` / `native-exports.json` evidence:
- Duplicate `native/*.proto` check:
- RPC proto bundle validation (`validate-rpc-proto-bundle`):
- Host restart evidence:
- Real host CDP/device behavior evidence:
- Final `.plugin` package evidence:

## 9. AI Acceptance Result

- AI acceptance status: `PASS | BLOCKED | FAIL`
- AI Self-Acceptance skill run:
- Acceptance rubric source:
- Essential result:
- Pitfall result:
- UI baseline source/status:
- Original symptom reproduced before fix:
- Original symptom absent after fix:
- CDP/browser/device validation loop completed:
- Remaining blocker, if any:
- Human acceptance may start:

## 10. Final Rubric Score (post-commit self-check only)

Do not fill this section before `post-commit-self-check` completes. The final
Rubric may also be written to `rubric-score.md`; if so, link it here.

| Dimension | Weight | Score / Status | Evidence | Deduction Notes |
| --- | --- | --- | --- | --- |
| L1 功能与需求闭合 | 0.30 |  |  |  |
| L2 验证与证据 | 0.25 |  |  |  |
| L3 工作流阶段合规 | 0.25 |  |  |  |
| L4 交付与仓库状态 | 0.10 |  |  |  |
| L5 上下文与自动化治理 | 0.10 |  |  |  |

- Overall Weighted Score:
- Hard-gate result:
- Complete-branch allowed: `yes | no`
- Main deduction reason:
- Accepted gap evidence, if any:

## Rules

- No validation claim is complete without a concrete evidence reference in this
  file, `acceptance.md`, `evidence.md`, `fact-pack.md`, logs, screenshots,
  command output, or another cited artifact.
- This file may summarize sufficiency, but only the LLM can judge sufficiency.
- Keep raw command output and tool facts in `evidence.md` when they are lengthy.
- For host-embedded frontend plugin edits, record source edit -> frontend build
  -> direct runtime replacement -> real host CDP verification before asking for
  human acceptance, then record final `.plugin` package evidence before commit
  and complete-branch.
- For host CDP validation, record `/json/list` page targets and
  the selected target id/title/url. Mark Plugin Workbench, `base-win.html`,
  `devtools://`, blank, or unrelated product UI evidence as
  `wrong-target / insufficient`. Save key-path screenshots under
  `FEATURE_DIR/cdp-screenshots/`, keep `screenshots-index.md`, and report that
  directory to the human when CDP validation ends.
- If AI changed code, human acceptance may start only after this file records
  AI acceptance `PASS` or a true external blocker. Fixable CDP target, runtime
  sync, host process, bridge/proto bundle, or deployment gaps must return to
  implementation.
- For native bridge/proto changes, validate required generated bundle messages
  and fields before using frontend/UI behavior as final evidence.
- AI self-acceptance records criteria coverage only. Final Rubric score output
  is a post-commit hard gate and is invalid before the one self-check completes.
