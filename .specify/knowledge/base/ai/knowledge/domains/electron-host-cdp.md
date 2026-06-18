---
authority: generated
confidence: low
source_refs: []
last_verified: null
---

# Host CDP

Use this guide for host-embedded UI validation in Electron or Chromium-based
hosts after workspace bootstrap supplies real target patterns.

- Query `/json/list` and record target `id`, `title`, `url`, and
  `webSocketDebuggerUrl`.
- Reject DevTools pages, blank pages, base windows, workbench-only pages, and
  unrelated browser targets when validating product UI.
- Run `ensure-host-cdp` before declaring CDP blocked.
- Unknown owners are blockers; safe process recovery must only stop verified
  host debug processes under the configured host root.
- Capture key-path screenshots with `capture-cdp-screenshot` into
  `FEATURE_DIR/cdp-screenshots`.
- Keep a screenshot manifest such as `screenshots-index.md` with capture
  purpose, target URL, and validation result.
- Report the screenshot directory when CDP validation completes.
- Inspect DOM, console, computed style, box metrics, and screenshots before
  accepting visual or layout-sensitive fixes.
