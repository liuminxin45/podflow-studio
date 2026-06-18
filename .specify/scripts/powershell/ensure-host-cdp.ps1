#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$Endpoint = "http://127.0.0.1:9222",
    [ValidateSet("host-app", "workbench")]
    [string]$TargetKind = "host-app",
    [string]$HostRoot = "",
    [string]$StartCommand = "",
    [string]$TargetsJson = "",
    [string]$PortOwnersJson = "",
    [switch]$AllowProcessRecovery,
    [switch]$DryRunRecovery,
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output "Usage: ensure-host-cdp.ps1 [-Endpoint http://127.0.0.1:9222] [-TargetKind host-app|workbench] [-HostRoot <dir>] [-StartCommand <cmd>] [-TargetsJson <json>] [-PortOwnersJson <json>] [-AllowProcessRecovery] [-DryRunRecovery] [-Json]"
    Write-Output "Probes host CDP readiness, reports target inventory, and can safely recover known HostApplication debug processes before UI validation."
    exit 0
}

function New-Result {
    param([string]$Status, [hashtable]$Facts, [array]$Blockers, [array]$Unknowns, [array]$Hints)
    [PSCustomObject]@{
        tool = "ensure-host-cdp"
        status = $Status
        facts = [PSCustomObject]$Facts
        blockers = $Blockers
        unknowns = $Unknowns
        hints = $Hints
    }
}

function Write-Result {
    param($Payload)
    if ($Json) {
        $Payload | ConvertTo-Json -Depth 12 -Compress
    } else {
        Write-Output ("status: " + $Payload.status)
        if ($Payload.facts.selected_target) {
            Write-Output ("selected_target: " + $Payload.facts.selected_target.url)
        }
        foreach ($blocker in @($Payload.blockers)) {
            [Console]::Error.WriteLine(" - $blocker")
        }
    }
    if ($Payload.status -eq "blocked") { exit 1 }
}

function ConvertTo-TargetRecord {
    param($Target)
    [ordered]@{
        id = [string]$Target.id
        type = [string]$Target.type
        title = [string]$Target.title
        url = [string]$Target.url
        webSocketDebuggerUrl = [string]$Target.webSocketDebuggerUrl
    }
}

function Get-TargetReason {
    param([string]$Title, [string]$Url)
    if ($Title -match "DevTools" -or $Url -match "^devtools://") { return "devtools" }
    if ($Title -match "Plugin Workbench" -or $Url -match "plugin-workbench\.html") { return "workbench" }
    if ($Url -match "base-win\.html") { return "base-window" }
    if ($Url -match "about:blank|^$") { return "blank" }
    if ($Url -match "app-home|app-main-window|frontend/static/index\.html") { return "host-app" }
    return "unknown"
}

function Get-PortOwnerFacts {
    param([string]$EndpointUrl)
    $facts = @()
    if (-not [string]::IsNullOrWhiteSpace($PortOwnersJson)) {
        try {
            return @($PortOwnersJson | ConvertFrom-Json)
        } catch {
            return $facts
        }
    }
    try {
        $uri = [Uri]$EndpointUrl
        $port = $uri.Port
        if ($port -le 0) { return $facts }
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($connection in @($connections)) {
            $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
            $commandLine = ""
            try {
                $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
                if ($cim) { $commandLine = [string]$cim.CommandLine }
            } catch {
                $commandLine = ""
            }
            $facts += [PSCustomObject][ordered]@{
                local_address = [string]$connection.LocalAddress
                local_port = $connection.LocalPort
                owning_process_id = $connection.OwningProcess
                process_name = if ($process) { $process.ProcessName } else { "" }
                process_path = if ($process) { $process.Path } else { "" }
                command_line = $commandLine
            }
        }
    } catch {
        return $facts
    }
    return $facts
}

function Test-KnownHostApplicationOwner {
    param($Owner, [string]$Root)
    if ([string]::IsNullOrWhiteSpace($Root)) { return $false }
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $name = ([string]$Owner.process_name).ToLowerInvariant()
    $path = [string]$Owner.process_path
    $command = [string]$Owner.command_line
    $knownName = $name -in @("hostapplication", "electron", "node", "npm", "npm.cmd")
    $underRoot = $false
    foreach ($candidate in @($path, $command)) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        if ($candidate.IndexOf($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $underRoot = $true
        }
    }
    return $knownName -and $underRoot
}

function Invoke-ProcessRecovery {
    param([array]$Owners)
    $recovery = [ordered]@{
        requested = [bool]$AllowProcessRecovery
        dry_run = [bool]$DryRunRecovery
        host_root = $HostRoot
        start_command = $StartCommand
        safe_owners = @()
        unsafe_owners = @()
        killed_process_ids = @()
        restart_attempted = $false
        restart_exit_code = $null
    }
    if (-not $AllowProcessRecovery) { return [PSCustomObject]$recovery }

    foreach ($owner in @($Owners)) {
        if (Test-KnownHostApplicationOwner -Owner $owner -Root $HostRoot) {
            $recovery.safe_owners += $owner
        } else {
            $recovery.unsafe_owners += $owner
        }
    }
    foreach ($owner in @($recovery.safe_owners)) {
        $processId = [int]$owner.owning_process_id
        if ($processId -le 0) { continue }
        if (-not $DryRunRecovery) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
        $recovery.killed_process_ids += $processId
    }
    if (-not [string]::IsNullOrWhiteSpace($StartCommand)) {
        $recovery.restart_attempted = $true
        if (-not $DryRunRecovery) {
            Push-Location $HostRoot
            try {
                Invoke-Expression $StartCommand
                $recovery.restart_exit_code = $LASTEXITCODE
            } finally {
                Pop-Location
            }
        }
    }
    return [PSCustomObject]$recovery
}

$blockers = @()
$unknowns = @()
$hints = @(
    "If a usable HostApplication target is already running, reuse it instead of starting a second host.",
    "If CDP is unreachable and no process owns the port, start HostApplication from <host-app-root> with npm run debug, then rerun this probe.",
    "If CDP is blocked by a known HostApplication debug process, rerun with HostRoot and AllowProcessRecovery so the script can stop that process and re-probe.",
    "Unknown port owners are not killed; record them as blockers.",
    "Do not switch to human acceptance until this probe and the target inventory prove host/CDP is unavailable."
)
$facts = [ordered]@{
    endpoint = $Endpoint
    target_kind = $TargetKind
    host_root = $HostRoot
    endpoint_reachable = $false
    page_targets = @()
    rejected_targets = @()
    selected_target = $null
    port_owners = @()
    recovery = $null
}

try {
    if ([string]::IsNullOrWhiteSpace($TargetsJson)) {
        $listUrl = $Endpoint.TrimEnd("/") + "/json/list"
        $targets = Invoke-RestMethod -Uri $listUrl -Method Get -TimeoutSec 3
        $facts.endpoint_reachable = $true
    } else {
        $targets = $TargetsJson | ConvertFrom-Json
        $facts.endpoint_reachable = $true
    }
} catch {
    $facts.port_owners = @(Get-PortOwnerFacts -EndpointUrl $Endpoint)
    if (@($facts.port_owners).Count -gt 0) {
        $facts.recovery = Invoke-ProcessRecovery -Owners $facts.port_owners
        if ($AllowProcessRecovery -and @($facts.recovery.safe_owners).Count -gt 0 -and @($facts.recovery.unsafe_owners).Count -eq 0) {
            $blockers += "CDP endpoint was unreachable and known HostApplication debug process recovery was attempted; rerun this probe after the host restarts before manual acceptance."
        } elseif ($AllowProcessRecovery -and @($facts.recovery.unsafe_owners).Count -gt 0) {
            $blockers += "CDP endpoint is unreachable and at least one port owner is not a verified HostApplication process; unknown owners were not killed."
        } else {
            $blockers += "CDP endpoint is unreachable, but the port is already owned by another process; rerun with HostRoot and AllowProcessRecovery for verified HostApplication owners, or resolve unknown owners before manual acceptance."
        }
    } else {
        $blockers += "CDP endpoint is unreachable and no listening process was identified; start HostApplication with npm run debug, then rerun this probe."
    }
    Write-Result (New-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints)
}

foreach ($target in @($targets)) {
    if ([string]$target.type -ne "page") { continue }
    $record = ConvertTo-TargetRecord $target
    $reason = Get-TargetReason -Title $record.title -Url $record.url
    $record.reason = $reason
    $facts.page_targets += [PSCustomObject]$record
}

foreach ($target in @($facts.page_targets)) {
    if ($TargetKind -eq "host-app" -and $target.reason -eq "host-app") {
        $facts.selected_target = $target
        break
    }
    if ($TargetKind -eq "workbench" -and $target.reason -eq "workbench") {
        $facts.selected_target = $target
        break
    }
}

foreach ($target in @($facts.page_targets)) {
    if ($facts.selected_target -and $target.id -eq $facts.selected_target.id) { continue }
    if ($target.reason -in @("devtools", "workbench", "base-window", "blank")) {
        $facts.rejected_targets += $target
    }
}

if (-not $facts.selected_target) {
    $chromeErrorTargets = @($facts.page_targets | Where-Object { $_.url -match "^chrome-error://chromewebdata/" })
    if ($chromeErrorTargets.Count -gt 0) {
        $blockers += "CDP returned chrome-error://chromewebdata/ page targets; recover/restart the HostApplication host and rerun target inventory before manual acceptance."
    }
    $blockers += "CDP is reachable, but no matching HostApplication target was found for TargetKind '$TargetKind'; navigate/reuse the host before manual acceptance."
}
if (@($facts.page_targets).Count -eq 0) {
    $unknowns += "No page targets were returned by CDP."
}

$status = if ($blockers.Count -eq 0) { "ok" } else { "blocked" }
Write-Result (New-Result -Status $status -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints)
