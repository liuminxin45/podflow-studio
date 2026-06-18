#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$Endpoint = "http://127.0.0.1:9222",
    [ValidateSet("host-app", "workbench")]
    [string]$TargetKind = "host-app",
    [string]$TargetsJson = "",
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output "Usage: inspect-host-cdp-target.ps1 [-Endpoint http://127.0.0.1:9222] [-TargetKind host-app|workbench] [-TargetsJson <json>] [-Json]"
    Write-Output "Selects the correct host CDP page target and rejects DevTools, base-win, blank, and wrong-process targets."
    exit 0
}

function New-Result {
    param([string]$Status, [hashtable]$Facts, [array]$Blockers, [array]$Unknowns, [array]$Hints)
    [PSCustomObject]@{
        tool = "inspect-host-cdp-target"
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

$blockers = @()
$unknowns = @()
$hints = @(
    "Record selected target id, title, url, and webSocketDebuggerUrl before collecting DOM or screenshot evidence.",
    "Use Plugin Workbench only for plugin-host/workbench validation; it is wrong-target evidence for product UI."
)
$facts = [ordered]@{
    endpoint = $Endpoint
    target_kind = $TargetKind
    page_targets = @()
    rejected_targets = @()
    selected_target = $null
}

try {
    if ([string]::IsNullOrWhiteSpace($TargetsJson)) {
        $listUrl = $Endpoint.TrimEnd("/") + "/json/list"
        $targets = Invoke-RestMethod -Uri $listUrl -Method Get -TimeoutSec 3
    } else {
        $targets = $TargetsJson | ConvertFrom-Json
    }
} catch {
    $blockers += "Unable to read CDP targets from $Endpoint/json/list: $($_.Exception.Message)"
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
    $blockers += "No matching host CDP target found for TargetKind '$TargetKind'."
}
if ($TargetKind -eq "host-app" -and $facts.selected_target -and $facts.selected_target.reason -ne "host-app") {
    $blockers += "Selected target is not a host app target."
}
if ($TargetKind -eq "workbench" -and $facts.selected_target -and $facts.selected_target.reason -ne "workbench") {
    $blockers += "Selected target is not a Plugin Workbench target."
}
if (@($facts.page_targets).Count -eq 0) {
    $unknowns += "No page targets were returned by CDP."
}

$status = if ($blockers.Count -eq 0) { "ok" } else { "blocked" }
Write-Result (New-Result -Status $status -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints)
