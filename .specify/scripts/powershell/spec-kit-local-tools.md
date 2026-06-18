# Spec Kit Local Tools

Workspace-level Spec Kit tooling lives in this `spec-kit` repository. These
wrapper scripts are the supported local install/init entrypoints.

Install the local Codex edition:

```powershell
.\scripts\powershell\install.ps1
```

Install in editable mode while maintaining the team source:

```powershell
.\scripts\powershell\install.ps1 -Editable
```

Initialize the workspace root for Codex:

```powershell
.\scripts\powershell\init.ps1
```

Spec Kit init is Codex-only. Default init exposes only
`.agents/skills/speckit-specify` to native Codex skill discovery, installs the
rest of the Spec Kit stage skills under `.agents/spec-kit/skills`, and does not
write Codex MCP config unless explicitly requested.

Initialization also installs the layered Spec Kit assets into the workspace
root:

- `AGENTS.md`
- `.agents/skills/speckit-specify`
- `.agents/spec-kit/skills`
- `.specify/scripts`
- `.specify/templates` for runtime feature templates only
- `.specify/checklist-rules`
- `ai/rules`, `ai/knowledge`, `ai/workflows`, `ai/tools`, and `ai/templates`

By default the wrapper passes `--force` to `specify init` so bundled shared
assets are refreshed from the installed package. Use `-NoForce` when an
existing repository should preserve already present shared files and only add
missing assets.

One-time init templates such as `agents-template.md`,
`constitution-template.md`, `workspace-template.yml`,
`repository-map-template.md`, and `pitfalls-template.md` remain inside the
installed Spec Kit package/source. Init reads them directly to generate stable
project assets; they are not installed under `.specify/templates`.

Optionally configure the Codex stdio MCP server during init:

```powershell
.\scripts\powershell\init.ps1 `
  -ConfigureMcpAgent `
  -McpServerId chrome-devtools `
  -McpCommand npm `
  -McpChromeMode electron-slim `
  -McpBrowserUrl http://127.0.0.1:9222
```

Default init does not write MCP config. When `-ConfigureMcpAgent` is supplied,
the script only updates detected configs unless `-CreateMissingMcpConfig` is
passed. It writes only the selected MCP server entry and keeps unrelated Codex
MCP servers. Existing TOML files are backed up before writes. `-SkipMcpAgentConfig`
is retained as a compatibility switch and wins over `-ConfigureMcpAgent`.
On Windows, the default `npm` command is written as `npm.cmd` so MCP clients can
start it through native process launchers.

Chrome DevTools MCP modes:

- `electron-slim` (default): connect to the HostApplication Electron remote
  debugging endpoint and enable the MCP server's slim toolset. This avoids
  initialization paths that can time out on Electron targets while still
  allowing page listing, script execution, and screenshots.
- `electron`: connect to the Electron remote debugging endpoint with the full
  Chrome DevTools MCP toolset.
- `auto`: do not pass a browser URL and let `chrome-devtools-mcp` launch or
  discover a browser. Use this when the agent should not attach to
  HostApplication directly.
- `-McpArgs`: explicit low-level override for advanced troubleshooting. When
  provided, Spec Kit writes those args exactly and does not derive args from
  `-McpChromeMode`.

The default Chrome DevTools MCP arguments connect to an already running
HostApplication debug session on `http://127.0.0.1:9222`. Start
HostApplication with `npm run debug` before asking the agent to inspect DOM,
console, network, or runtime CSS.
When MCP config is requested, init validates the global `node` version before
writing MCP config. `chrome-devtools-mcp@latest` requires Node.js
`^20.19.0 || ^22.12.0 || >=23`; switch Node first, or run init without
`-ConfigureMcpAgent`.

Default initialization installs the Spec Kit workflow assets. Codex starts from
the exposed `$speckit-specify` skill; later stage skills are loaded on demand
from `.agents/spec-kit/skills` through `ai/workflows/skill-routing.yml`.

Executable profile routing for `specify workflow run speckit` is:

```text
micro-fix/auto: intake -> specify -> plan -> implement -> acceptance
              -> human-acceptance gate -> retrospective -> commit
              -> post-commit-self-check -> rubric-score -> complete-branch
standard-bugfix: intake -> specify -> plan -> analyze -> implement -> ...
full-sdd: intake -> specify -> plan -> tasks -> analyze -> checklist
          -> implement -> ...
validation-only: intake -> specify -> plan -> validation
blocked-investigation: intake -> specify -> plan -> fact-layer
```

Initialize while keeping the installed command linked to this source tree:

```powershell
.\scripts\powershell\init.ps1 -EditableInstall
```

Validate the regenerated workspace context from this repository root:

```powershell
.\scripts\powershell\validate-generated-context.ps1 -RepoRoot ..
.\scripts\powershell\validate-knowledge-index.ps1 -RepoRoot ..
.\scripts\powershell\validate-context-budget.ps1 -RepoRoot ..
```

Uninstall the local machine's `specify` tool:

```powershell
.\scripts\powershell\uninstall.ps1
```

Equivalent raw uv command:

```powershell
uv tool uninstall specify-cli
```

Team policy:

- Default initialization installs the complete team workflow.
- Spec Kit creates and completes local Spec branches.
- Spec branches must not be pushed or configured for remote tracking by Spec
  Kit.
- Multi-repo work uses the same local Spec branch name in every affected
  repository.
- Branch creation and completion scripts preflight all workspace repositories
  before mutating branch state.
- A Spec is complete after all affected repositories cherry-pick the local Spec
  branch commits back to the configured base branch while keeping the local Spec
  branch.
- Cherry-pick completion is automated after commit, one post-commit self-check,
  and Rubric gates pass. The completion command keeps the local Spec branch and
  does not push.
- GitHub issue generation is not installed.
