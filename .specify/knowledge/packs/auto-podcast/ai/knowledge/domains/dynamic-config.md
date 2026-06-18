---
authority: generated
confidence: medium
source_refs:
  - README_DYNAMIC_CONFIG.md
  - protocol/config_base.py
  - scripts/extract_node_schemas.py
  - electron/main.js
  - electron/preload.js
last_verified: null
---

# Dynamic Config

- Node configuration is designed to be schema-driven from Python config classes into the frontend UI.
- Node config classes should inherit `protocol.config_base.NodeConfigBase` and use Pydantic fields for defaults, descriptions, and validation.
- `LLMConfigMixin` centralizes common LLM fields such as model, API key/base, temperature, retries, and timeout.
- `scripts/extract_node_schemas.py` is the source-side extraction path for turning node config classes into UI-consumable schema.
- Electron exposes config schema access through `node:getSchema` and `node:getAllSchemas`.
- Electron exposes persistent node config operations through `config:save`, `config:load`, `config:loadAll`, `config:delete`, and `config:resetAll`.
- `electron/preload.js` is the browser-safe bridge for schema and config IPC APIs.
- Add or change config fields in the Python node config first, then verify schema extraction and frontend rendering.
- Fields containing secrets should remain local/user-configured and should not be committed into repository examples except as placeholders.
