---
authority: generated
confidence: low
source_refs: []
last_verified: null
---

# Build And Package Notes

This open-source guide keeps path categories generic. A real workspace should
replace generated examples with reviewed facts from `.specify/memory/repository-map.md`.

## Plugin Path Knowledge

- Frontend source: `<workspace-root>/FrontendPlugin/<plugin-id>/src/`
- Frontend build output: `<workspace-root>/FrontendPlugin/<plugin-id>/dist/`
- Frontend package staging: `<workspace-root>/FrontendPlugin/<plugin-id>/plugin-out/<version>/staging/`
- Host-served frontend runtime: `<host-app-root>/frontend/<location>/<plugin-id>/`
- Host descriptor mock: `<host-app-root>/mock_data/api/pluginManager/v1/getFrontDescriptorList.json`
- Native source: `<workspace-root>/NativePlugin/<plugin-id>/src/`
- Native build cache: `<workspace-root>/NativePlugin/<plugin-id>/build/<generator>/<arch>/<config>/`
- Native export output: `<workspace-root>/NativePlugin/<plugin-id>/export/`
- Native runtime root: `<host-app-root>/app-data/plugins/<plugin-id>/<version>/`
- Native addon directory: `<host-app-root>/app-data/plugins/<plugin-id>/<version>/native/`
- Host project root: `<workspace-root>/HostApplication/HostApplication/`
- Legacy host runtime directory: `<host-app-root>/plugins/<legacy-plugin-id>`

Keep machine-specific absolute paths out of long-term knowledge. Runtime paths
are validation/deployment targets, not durable source edit targets.

## Frontend Runtime Delivery Chain

For host-embedded frontend plugins, use:

```text
source edit -> frontend build -> direct runtime replacement -> real host CDP verification
```

Final `.plugin` build/package evidence remains required when the workspace has a
plugin packaging system. Record removed stale runtime files before validation.

## Native Runtime Delivery Chain

When native bridge or protocol artifacts change, validate source build/export,
runtime sync, duplicate protocol placement, host restart, and final package
evidence. Useful commands, when available:

- `sync-native-runtime-artifacts`
- `validate-rpc-proto-bundle`

## Host CDP Defaults

- Endpoint: `http://127.0.0.1:9222`
- Target inventory: `/json/list`, preferably through `inspect-host-cdp-target`;
  record `webSocketDebuggerUrl`.
- Launch command example: `npm run debug`
- Debug port variable example: `UTILITY_CHROME_REMOTE_DEBUGGING_PORT=9222`
- Optional devtools flag: `UTILITY_ENABLE_PLUGIN_DEVTOOLS=1`
- Node inspector also starts on `5858` in some host setups.
- Workbench target pattern: `Plugin Workbench|plugin-workbench.html`
- App target pattern example: `app-main-window`
- App route example: `http://example.local/frontend/static/index.html#/app-home/appHome`
- Rejected target examples: `base-win.html`, `devtools://`, blank pages, and
  unrelated browser pages.
- After launch, click the target app card such as the app-home card if the host
  opens on a shell page.
- Screenshot API: `Page.captureScreenshot`

Unknown owners are blockers. Do not stop unrelated processes during CDP recovery.
