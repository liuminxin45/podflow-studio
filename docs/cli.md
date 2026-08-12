# PodFlow Studio CLI

PodFlow CLI is the single process-control and acceptance entry point for both people and AI Agents. It starts Electron in an isolated session, waits for the React renderer and preload bridge to become ready, records machine-readable state, and stops only processes owned by that session nonce.

## Entry points

From a repository checkout:

```powershell
npm run cli -- doctor --json
npm run cli -- start --mode dev --session agent-001 --cdp auto --window hidden --json
npm run cli -- status --session agent-001 --json
npm run cli -- logs --session agent-001 --tail 200
npm run cli -- stop --session agent-001 --json
```

`npm start` remains the normal interactive development command. It now delegates to `podflow run`, so interactive and Agent launches use the same supervisor.

After `npm install`, npm also exposes the package bin locally as `podflow`. `npm run cli -- ...` is preferred in automation because it does not depend on a global installation.

## Commands

| Command | Purpose |
| --- | --- |
| `doctor` | Checks Node, Electron, Vite, Python 3.13, npm-managed FFmpeg, renderer source, and optional built assets. |
| `start` | Starts an isolated session in the background and returns only after renderer readiness. |
| `run` | Runs the same supervised session in the foreground. |
| `status` | Returns manifest state, PIDs, paths, and loopback endpoints. |
| `stop` | Requests graceful Electron shutdown with the session nonce, then waits for cleanup. |
| `logs` | Prints the session log; `--follow` waits until the session ends. |
| `accept` | Runs a layered CDP acceptance suite and writes evidence into the session artifact directory. |
| `produce` | Runs one explicit workflow through v3 render, SHA256 approval, or immutable packaging. |
| `version` | Prints the PodFlow Studio package version. |

Common options:

- `--session <id>`: 1–64 letters, numbers, dots, underscores, or hyphens. `default` is used outside acceptance.
- `--mode <dev|built>`: explicit renderer mode. `built` fails if `dist/index.html` does not exist.
- `--window <show|hidden>`: visible desktop UI or a hidden Agent-owned window.
- `--cdp <off|auto|port>`: disabled, an available loopback port starting at 9222, or a preferred port. CDP is never bound beyond `127.0.0.1`.
- `--timeout <seconds>`: startup or stop deadline.
- `--json`: one JSON object for bounded commands; foreground `run` emits JSONL lifecycle events.

## Acceptance suites

```powershell
npm run cli -- accept --suite startup --window hidden --json
npm run cli -- accept --suite ui --window hidden --json
npm run cli -- accept --suite e2e-offline --window hidden --json
```

- `startup` verifies Electron launch, React DOM visibility, preload IPC, and media APIs.
- `ui` adds real settings navigation and guards the library against duplicate primary creation actions.
- `e2e-offline` runs the repository's full local workflow acceptance through discovery, research, facts, writing, recording, audio, assets, local publishing, RSS validation, and UI checks. It does not authorize external LLM, search, TTS, or publishing calls.

Each acceptance run creates a unique session unless `--session` is supplied. Evidence is written below `.podflow/sessions/<session>/artifacts/`:

```text
report.md
result.json
screenshots/<timestamp>/*.png
```

Use `--artifacts-dir <path>` only when a caller intentionally wants evidence elsewhere. The CLI does not update tracked acceptance documentation implicitly.

## Session contract

Every session lives below `.podflow/sessions/<session>/` and contains:

```text
session.json          machine-readable state and endpoints
launch.json           immutable launch inputs for the current run
stop.request.json     nonce-bound graceful stop request
runtime.log           timestamped Vite, Electron, and supervisor output
data/workflows/       isolated PodFlow workflow state
electron-profile/     isolated Electron user data and node settings
artifacts/            acceptance evidence
```

The state machine is `starting -> ready -> stopping -> exited`, or `starting -> accepting -> exited` for acceptance. `failed` is terminal. A stale manifest is reported as `stale`; the CLI never kills a process merely because it occupies a port.

## Exit codes

| Code | Meaning |
| ---: | --- |
| 0 | Success |
| 2 | Invalid command or argument |
| 3 | Missing or invalid local environment |
| 4 | Session conflict or unknown session |
| 5 | Startup timeout |
| 6 | Electron or renderer crashed after launch |
| 7 | Acceptance failed or timed out |
| 8 | Graceful stop failed |
| 9 | Internal CLI error |
| 10 | Production preflight, render, approval, or package failure |

## Production v3

```powershell
npm run cli -- produce --workflow <id-or-absolute-path> --stage render --allow-paid-tts --json
npm run cli -- produce --workflow <id-or-absolute-path> --stage approve --audio-sha256 <sha256> --reviewer <name> --json
npm run cli -- produce --workflow <id-or-absolute-path> --stage package --output <directory> --json
```

The CLI and desktop app consume the same `production_plan v3` defaults. There is no implicit latest-workflow selection and no v2 fallback.

- `render` runs TTS, v3 cue assembly, cover generation and automatic review. It prints total characters, uncached characters and uncached clip count before calling a paid provider.
- `--allow-paid-tts` is required whenever uncached Doubao clips exist. Missing credentials, unresolved pronunciation items, missing cue files, missing CC0 provenance or a legacy plan fail before the first external call.
- TTS cache keys include the v3 direction, multi-emotion voice, emotion strength, pace, adjacent context and performance prompt. Re-rendering clears `audio_approval`.
- `approve` requires a passing automatic review and the exact SHA256 of the current final MP3. The reviewer identity and UTC review time are persisted; secrets are removed before the workflow is written.
- `package` requires a passing `audio-quality-report.json`, matching human approval, non-mock audio and an immutable output directory. It never overwrites a prior revision.

If a stage fails, correct the reported preflight or quality issue and rerun the same stage. Do not hand-edit the fingerprint or quality report. A new render intentionally invalidates the earlier approval.

## Agent-safe pattern

An Agent should choose a unique session, keep the returned manifest, and always stop in a `finally` block:

```powershell
$session = "agent-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
try {
  npm run cli -- start --mode dev --session $session --cdp auto --window hidden --json
  npm run cli -- status --session $session --json
  npm run cli -- accept --suite ui --window hidden --json
} finally {
  npm run cli -- stop --session $session --json
}
```

An acceptance command owns and cleans up its own isolated session, so it does not need a preceding `start` command.
