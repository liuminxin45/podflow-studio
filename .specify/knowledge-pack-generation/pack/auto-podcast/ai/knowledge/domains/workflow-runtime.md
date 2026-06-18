---
authority: generated
confidence: medium
source_refs:
  - README.md
  - electron/main.js
  - electron/preload.js
  - protocol/state.py
  - docs/ARCHITECTURE.md
last_verified: null
---

# Workflow Runtime

- Workflow execution is a desktop-mediated pipeline: frontend requests go through Electron IPC, and Electron launches Python nodes.
- Electron runs Python nodes with `python -m nodes.<node_name>` and passes the full workflow state over stdin/stdout JSON.
- Frontend APIs are exposed through `electron/preload.js`; durable IPC surface includes `workflow:*`, `node:getSchema`, `config:*`, `radar:*`, and `trendradar:*`.
- `PodcastState` is the shared Python state contract and includes content, topic, script, stages, audio, publish, runtime_config, logs, and errors.
- Node implementations should append logs to `state["logs"]` and append structured errors to `state["errors"]` instead of crashing the pipeline.
- Node-to-node coupling should stay through state fields; avoid importing another node's implementation from a node.
- The six creator stages are discovery,整理/preprocess,构思/research-topic,写作/script,制作/audio, and发布/publish.
- Workflow acceptance or UI smoke should prefer Electron/Vite runtime evidence when practical because the frontend and Electron shell both participate in behavior.
- Runtime and output folders such as `out/episodes`, `out/assets`, `out/rss`, and user-data node configs are generated state, not source.
