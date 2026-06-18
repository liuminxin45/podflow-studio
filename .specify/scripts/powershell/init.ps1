param(
    [string]$ProjectPath = "",
    [string]$SpecKitSourcePath = "",
    [switch]$NoForce,
    [switch]$EditableInstall,
    [switch]$SkipInstall,
    [switch]$CheckAgentTools,
    [string]$McpServerId = "chrome-devtools",
    [string]$McpCommand = "npm",
    [ValidateSet("auto", "electron", "electron-slim")]
    [string]$McpChromeMode = "electron-slim",
    [string]$McpBrowserUrl = "http://127.0.0.1:9222",
    [string[]]$McpArgs = @(),
    [switch]$ConfigureMcpAgent,
    [switch]$SkipMcpAgentConfig,
    [switch]$CreateMissingMcpConfig,
    [switch]$DryRunMcp,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output "Usage: init.ps1 [-ProjectPath <path>] [-SpecKitSourcePath <path>] [-NoForce] [-EditableInstall] [-SkipInstall] [-CheckAgentTools] [-ConfigureMcpAgent] [-Help]"
    Write-Output "Installs specify-cli when needed, then initializes Spec Kit for Codex."
    Write-Output "Initializes layered assets: AGENTS.md, .agents/skills, .specify/scripts, runtime .specify/templates, .specify/checklist-rules, and ai/**."
    Write-Output "By default, init targets the workspace root and refreshes bundled shared assets with --force."
    Write-Output "use -NoForce to preserve existing shared files."
    Write-Output "  -ProjectPath  Override the default workspace root target."
    Write-Output "  -SpecKitSourcePath  Override the default spec-kit source root."
    Write-Output "  -NoForce      Do not pass --force to specify init or uv tool install."
    Write-Output "  -SkipInstall  Reuse the currently installed specify executable."
    Write-Output "  -CheckAgentTools  Require the Codex CLI to be installed. By default team init skips this check for IDE-based usage."
    Write-Output "  -ConfigureMcpAgent  Opt in to Codex MCP configuration. Default init does not write MCP config."
    Write-Output "  -SkipMcpAgentConfig  Compatibility switch; prevents MCP configuration even when -ConfigureMcpAgent is supplied."
    Write-Output "  -McpServerId  MCP server id. Default: chrome-devtools."
    Write-Output "  -McpCommand   MCP stdio command. Default: npm."
    Write-Output "  -McpChromeMode  Chrome DevTools MCP mode: auto, electron, electron-slim. Default: electron-slim."
    Write-Output "  -McpBrowserUrl  Electron remote debugging URL for electron modes. Default: http://127.0.0.1:9222."
    Write-Output "  -McpArgs      Optional MCP stdio arguments. When set, overrides the default args derived from -McpChromeMode."
    Write-Output "                When MCP config is enabled, global node must satisfy ^20.19.0 || ^22.12.0 || >=23 for chrome-devtools-mcp@latest."
    Write-Output "  -CreateMissingMcpConfig  Create missing agent config files. Default only updates detected configs."
    Write-Output "  -DryRunMcp    Preview MCP agent config updates without writing."
    exit 0
}

$SpecKitRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$WorkspaceRoot = (Resolve-Path -LiteralPath (Join-Path $SpecKitRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    $ProjectPath = $WorkspaceRoot
}
if ([string]::IsNullOrWhiteSpace($SpecKitSourcePath)) {
    if (-not [string]::IsNullOrWhiteSpace($env:SPEC_KIT_SOURCE)) {
        $SpecKitSourcePath = $env:SPEC_KIT_SOURCE
    } else {
        $SpecKitSourcePath = $SpecKitRoot
    }
}
$ResolvedSpecKitSourcePath = (Resolve-Path -LiteralPath $SpecKitSourcePath -ErrorAction SilentlyContinue).Path
if (-not $ResolvedSpecKitSourcePath -or -not (Test-Path -LiteralPath (Join-Path $ResolvedSpecKitSourcePath "pyproject.toml"))) {
    throw "Spec Kit source is missing: $SpecKitSourcePath"
}

if (-not (Test-Path -LiteralPath $ProjectPath)) {
    New-Item -ItemType Directory -Path $ProjectPath -Force | Out-Null
}
$ResolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path

if (-not $SkipInstall) {
    $installArgs = @{ SpecKitSourcePath = $ResolvedSpecKitSourcePath }
    if ($EditableInstall) {
        $installArgs.Editable = $true
    }
    if ($NoForce) {
        $installArgs.NoForce = $true
    }
    & (Join-Path $PSScriptRoot "install.ps1") @installArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
elseif (-not (Get-Command specify -ErrorAction SilentlyContinue)) {
    throw "specify is not installed. Rerun without -SkipInstall."
}

$specifyArgs = @(
    "init",
    "--here",
    "--no-git",
    "--branch-numbering", "sequential"
)

if (-not $CheckAgentTools) {
    $specifyArgs += "--ignore-agent-tools"
}

if (-not $NoForce) {
    $specifyArgs += "--force"
}

Write-Host "Initializing Spec Kit (Codex) in $ResolvedProjectPath"
Push-Location $ResolvedProjectPath
try {
    & specify @specifyArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}

if ($ConfigureMcpAgent -and -not $SkipMcpAgentConfig) {
    $mcpScript = Join-Path $ResolvedSpecKitSourcePath "scripts\powershell\configure-mcp-agents.ps1"
    if (-not (Test-Path -LiteralPath $mcpScript)) {
        throw "MCP agent configuration script not found: $mcpScript"
    }

    $mcpScriptArgs = @{
        Agents = @("Codex")
        ServerId = $McpServerId
        Command = $McpCommand
        ServerArgs = $McpArgs
        ChromeMode = $McpChromeMode
        BrowserUrl = $McpBrowserUrl
        ProjectPath = $ResolvedProjectPath
    }
    if ($CreateMissingMcpConfig) {
        $mcpScriptArgs.CreateMissingAgentConfig = $true
    }
    if ($DryRunMcp) {
        $mcpScriptArgs.DryRun = $true
    }

    Write-Host "Configuring MCP server '$McpServerId' for Codex"
    & $mcpScript @mcpScriptArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
elseif ($SkipMcpAgentConfig) {
    Write-Host "Skipping MCP configuration for Codex"
}
else {
    Write-Host "MCP configuration not requested; pass -ConfigureMcpAgent to opt in"
}
