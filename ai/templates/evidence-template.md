# Evidence

This is the L5 tool/test-facing evidence ledger for a feature. It stores concrete
commands, runtime facts, logs, screenshots, and artifacts used to support
validation or root-cause claims.

## 1. Evidence Index

| ID | Type | Source | Collected At | Supports | Status |
| --- | --- | --- | --- | --- | --- |
| E-001 |  |  |  |  |  |

## 2. Commands

### E-CMD-001

- Command:
- Working directory:
- Exit code:
- Result:
- Output summary:
- Full output location:

## 3. Runtime Facts

### E-RUNTIME-001

- Source:
- Target:
- CDP page targets:
- Selected target id/title/url:
- Rejected target reason:
- Facts:
- Screenshot directory:
- Screenshot index:
- Screenshot:
- DOM/CSS/console excerpt:
- Loaded resources:
- Remaining unknowns:

## 4. Logs

### E-LOG-001

- Log path:
- LastWriteTime:
- Relevant lines:
- User action timeline:

## 5. Artifact Checks

### E-ARTIFACT-001

- Source file:
- Runtime/generated artifact:
- Package/install copy:
- Runtime replacement removed stale count:
- Consistency result:

### E-NATIVE-001

- Source native output:
- Runtime plugin root:
- Runtime native directory:
- `.node` source/target SHA256:
- Root `.proto` source/target SHA256:
- `native-exports.json` source/target SHA256:
- Duplicate `native/*.proto` files:
- Host restart evidence:

### E-RPC-BUNDLE-001

- Bundle file:
- Service name:
- Required messages:
- Required fields:
- Discovered messages/fields:
- Result:

## 6. Minimal Decision Evidence Pack For Advanced Models

- Command list:
- Build/runtime sync result:
- CDP target inventory:
- Selected target id/title/url:
- Rejected targets and reasons:
- CDP screenshot directory: `FEATURE_DIR/cdp-screenshots/`
- CDP screenshots index:
- Raw RPC/device facts:
- DOM selector and box metrics:
- Artifact hashes:
- Original symptom assertion:
- After-fix assertion:
- AI acceptance status:

## 7. Gaps

- Missing evidence:
- Reason:
- Owner:
- Impact:

## Rules

- Keep this file factual. Do not use it as the final semantic judgment.
- Do not store secrets, credentials, or long unrelated logs.
- Prefer links or summarized key lines over pasting large outputs.
