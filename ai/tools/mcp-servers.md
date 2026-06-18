# MCP Servers

This file documents MCP servers known to Spec Kit. It does not make any MCP
server mandatory for normal feature work.

## Chrome DevTools

Server id:

```text
chrome-devtools
```

Default command configured by `configure-mcp-agents.ps1`:

```text
npm exec --yes --package=chrome-devtools-mcp@latest -c "chrome-devtools-mcp --browserUrl http://127.0.0.1:9222 --slim"
```

Connection modes:

- `electron-slim` (default): connect to the HostApplication/Electron remote
  debugging endpoint with `--slim`.
- `electron`: connect to the HostApplication/Electron remote debugging
  endpoint with the full Chrome DevTools MCP toolset.
- `auto`: omit `--browserUrl` and let Chrome DevTools MCP launch or discover a
  browser.
- explicit args: bypass mode-derived defaults for advanced troubleshooting.

Global Node.js requirement for MCP setup:

```text
^20.19.0 || ^22.12.0 || >=23
```

Expected target for HostApplication runtime investigation:

```text
http://127.0.0.1:9222
```

HostApplication development launch:

```text
cd <workspace-root>/HostApplication/HostApplication
npm run debug
```

`npm run debug` enables plugin DevTools and sets
`UTILITY_CHROME_REMOTE_DEBUGGING_PORT=9222`. Confirm the endpoint with
`/json/version`, then choose a real page from `/json/list`.

Preferred HostApplication target patterns:

```text
app-home|app-main-window|frontend/static/index.html
```

When investigating Electron UI, attach to the HostApplication/Electron target.
Do not treat DevTools, Plugin Workbench, a newly launched blank Chrome page, or
any unrelated target as evidence for the Electron application. For
host-embedded UI fixes, prefer the real Electron host + CDP after source build
and source-to-runtime sync; use isolated plugin previews only as fallback or
supplemental evidence.

For CSS-only hover states, `Input.dispatchMouseEvent` may not always produce a
stable hover state in Electron. Use CDP `CSS.forcePseudoState(['hover'])` on the
target node when needed, and record that method in validation evidence.

## Agent Configuration Support

`configure-mcp-agents.ps1` configures Codex TOML
`[mcp_servers.<id>]` entries only in this team distribution.

The script configures capability access only. Runtime use is governed by
`ai/tools/mcp-usage-policy.md` and `ai/tools/mcp-permissions.md`.

## Fallback

If no Chrome DevTools MCP server or usable Electron target is available, ask the
user for the relevant DOM/CSS/console excerpt and continue from that evidence.
