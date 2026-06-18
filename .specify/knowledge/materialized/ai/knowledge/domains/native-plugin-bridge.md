---
authority: generated
confidence: low
source_refs: []
last_verified: null
---

# Native Plugin Bridge

Use this guide only after workspace bootstrap identifies real native plugin
repositories and runtime paths.

- Native runtime validation should distinguish source edits, build/export
  output, runtime sync, and final package evidence.
- If native artifacts are copied for local validation, record the source path,
  destination path, and stale files removed.
- Bridge/protocol changes should validate generated bundles before human
  acceptance.
- Useful commands, when available:
  - `sync-native-runtime-artifacts`
  - `validate-rpc-proto-bundle`

Generated notes here are routing help only; source and package evidence remain
the authority for delivery.
