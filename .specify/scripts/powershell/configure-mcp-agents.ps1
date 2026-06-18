param(
    [ValidateSet("Codex")]
    [string[]]$Agents = @("Codex"),
    [string]$ServerId = "chrome-devtools",
    [string]$Command = "npm",
    [ValidateSet("auto", "electron", "electron-slim")]
    [string]$ChromeMode = "electron-slim",
    [string]$BrowserUrl = "http://127.0.0.1:9222",
    [string[]]$ServerArgs = @(),
    [string]$HomePath = "",
    [string]$ProjectPath = "",
    [switch]$CreateMissingAgentConfig,
    [switch]$DryRun,
    [switch]$Json
)

$ErrorActionPreference = "Stop"

$SpecKitMcpGovernance = [ordered]@{
    Registry = "ai/tools/tool-registry.md"
    Servers = "ai/tools/mcp-servers.md"
    UsagePolicy = "ai/tools/mcp-usage-policy.md"
    Permissions = "ai/tools/mcp-permissions.md"
    Boundary = "MCP tools are optional capabilities, not always-on actions. Write/destructive external tool actions require explicit human confirmation."
}

function Get-UserHome {
    if (-not [string]::IsNullOrWhiteSpace($HomePath)) {
        return (Resolve-Path -LiteralPath $HomePath).Path
    }
    return [Environment]::GetFolderPath("UserProfile")
}

function Get-ProjectPath {
    if (-not [string]::IsNullOrWhiteSpace($ProjectPath)) {
        return (Resolve-Path -LiteralPath $ProjectPath).Path
    }
    return (Get-Location).Path
}

function Resolve-AgentList {
    $allowed = @("Codex")
    $resolved = New-Object System.Collections.Generic.List[string]
    foreach ($agentValue in $Agents) {
        foreach ($agentName in ($agentValue -split ",")) {
            $trimmed = $agentName.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmed)) {
                continue
            }
            if ($allowed -notcontains $trimmed) {
                throw "Unsupported MCP agent '$trimmed'. This Spec Kit distribution configures Codex only."
            }
            $resolved.Add($trimmed)
        }
    }
    return @($resolved)
}

function Test-NodeVersionCompatible {
    param([string]$VersionText)

    if ($VersionText -notmatch "v?(\d+)\.(\d+)\.(\d+)") {
        return $false
    }

    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    $patch = [int]$Matches[3]

    if ($major -ge 23) {
        return $true
    }
    if ($major -eq 22 -and ($minor -gt 12 -or ($minor -eq 12 -and $patch -ge 0))) {
        return $true
    }
    if ($major -eq 20 -and ($minor -gt 19 -or ($minor -eq 19 -and $patch -ge 0))) {
        return $true
    }
    return $false
}

function Assert-CompatibleNodeForMcp {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
        throw "Cannot configure Chrome DevTools MCP: global 'node' was not found. chrome-devtools-mcp@latest requires Node.js ^20.19.0 || ^22.12.0 || >=23. Install/switch to a compatible global Node version, or rerun init with -SkipMcpAgentConfig to skip MCP configuration."
    }

    $versionText = (& $nodeCommand.Source -v 2>&1 | Select-Object -First 1).ToString().Trim()
    if (-not (Test-NodeVersionCompatible -VersionText $versionText)) {
        throw "Cannot configure Chrome DevTools MCP: global node is $versionText, but chrome-devtools-mcp@latest requires Node.js ^20.19.0 || ^22.12.0 || >=23. Switch the global Node version, or rerun init with -SkipMcpAgentConfig to skip MCP configuration."
    }
}

function Resolve-McpCommand {
    param([string]$CommandName)

    if ($CommandName -eq "npm" -and $env:OS -eq "Windows_NT") {
        return "npm.cmd"
    }
    return $CommandName
}

function Resolve-DefaultChromeDevToolsArgs {
    if ($ServerArgs.Count -gt 0) {
        return @($ServerArgs)
    }

    $chromeCommand = "chrome-devtools-mcp"
    switch ($ChromeMode) {
        "auto" {
            $chromeCommand = "chrome-devtools-mcp"
        }
        "electron" {
            $chromeCommand = "chrome-devtools-mcp --browserUrl $BrowserUrl"
        }
        "electron-slim" {
            $chromeCommand = "chrome-devtools-mcp --browserUrl $BrowserUrl --slim"
        }
    }

    return @("exec", "--yes", "--package=chrome-devtools-mcp@latest", "-c", $chromeCommand)
}

function Backup-IfNeeded {
    param([string]$Path)

    if ($DryRun -or -not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
    $backupPath = "$Path.bak.$timestamp"
    Copy-Item -LiteralPath $Path -Destination $backupPath -Force
    return $backupPath
}

function Test-AgentConfigPresent {
    param(
        [string]$ConfigPath,
        [string]$ConfigDir
    )

    return (Test-Path -LiteralPath $ConfigPath) -or (Test-Path -LiteralPath $ConfigDir) -or [bool]$CreateMissingAgentConfig
}

function Escape-TomlString {
    param([string]$Value)
    return '"' + ($Value -replace '\\', '\\' -replace '"', '\"') + '"'
}

function ConvertTo-TomlStringArray {
    param([string[]]$Values)
    $items = @()
    foreach ($item in $Values) {
        $items += (Escape-TomlString $item)
    }
    return "[" + ($items -join ", ") + "]"
}

function Set-CodexMcpServer {
    param(
        [string]$ConfigPath,
        [string]$ConfigDir
    )

    if (-not (Test-AgentConfigPresent -ConfigPath $ConfigPath -ConfigDir $ConfigDir)) {
        return [ordered]@{
            agent = "Codex"
            status = "skipped"
            path = $ConfigPath
            reason = "agent config not found"
        }
    }

    $raw = ""
    if (Test-Path -LiteralPath $ConfigPath) {
        $raw = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8
    }

    $escapedId = $ServerId
    $sectionHeader = "[mcp_servers.$escapedId]"
    $lines = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrEmpty($raw)) {
        foreach ($line in ($raw -split "`r?`n")) {
            $lines.Add($line)
        }
    }

    $filtered = New-Object System.Collections.Generic.List[string]
    $skip = $false
    foreach ($line in $lines) {
        if ($line -match "^\s*\[mcp_servers\.$([regex]::Escape($escapedId))\]\s*$") {
            $skip = $true
            continue
        }
        if ($skip -and $line -match "^\s*\[") {
            $skip = $false
        }
        if (-not $skip) {
            $filtered.Add($line)
        }
    }

    while ($filtered.Count -gt 0 -and [string]::IsNullOrWhiteSpace($filtered[$filtered.Count - 1])) {
        $filtered.RemoveAt($filtered.Count - 1)
    }

    if ($filtered.Count -gt 0) {
        $filtered.Add("")
    }
    $filtered.Add($sectionHeader)
    $filtered.Add('type = "stdio"')
    $filtered.Add("command = $(Escape-TomlString $Command)")
    if ($ServerArgs.Count -gt 0) {
        $filtered.Add("args = $(ConvertTo-TomlStringArray $ServerArgs)")
    }

    $backupPath = Backup-IfNeeded -Path $ConfigPath
    if (-not $DryRun) {
        $parent = Split-Path -Parent $ConfigPath
        if (-not (Test-Path -LiteralPath $parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        Set-Content -LiteralPath $ConfigPath -Value ($filtered -join "`n") -Encoding UTF8
    }

    return [ordered]@{
        agent = "Codex"
        status = $(if ($DryRun) { "dry-run" } else { "configured" })
        path = $ConfigPath
        backup = $backupPath
        server_id = $ServerId
    }
}

$userHome = Get-UserHome
$resolvedAgents = Resolve-AgentList
$results = @()

Assert-CompatibleNodeForMcp
$Command = Resolve-McpCommand -CommandName $Command
$ServerArgs = Resolve-DefaultChromeDevToolsArgs

foreach ($agent in $resolvedAgents) {
    switch ($agent) {
        "Codex" {
            $results += Set-CodexMcpServer `
                -ConfigPath (Join-Path $userHome ".codex\config.toml") `
                -ConfigDir (Join-Path $userHome ".codex")
        }
    }
}

if ($Json) {
    $results | ConvertTo-Json -Depth 20
}
else {
    foreach ($result in $results) {
        $line = "[{0}] {1}" -f $result.agent, $result.status
        if ($result.reason) {
            $line = "$line - $($result.reason)"
        }
        Write-Host $line
    }
}
