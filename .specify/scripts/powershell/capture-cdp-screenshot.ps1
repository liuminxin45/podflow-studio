#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$FeatureDir = "",
    [string]$OutputDir = "",
    [string]$Endpoint = "http://127.0.0.1:9222",
    [string]$WebSocketDebuggerUrl = "",
    [ValidateSet("host-app", "workbench")]
    [string]$TargetKind = "host-app",
    [string]$TargetsJson = "",
    [string]$Scenario = "cdp-screenshot",
    [switch]$CaptureBeyondViewport,
    [int]$TimeoutSec = 10,
    [switch]$DryRun,
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output "Usage: capture-cdp-screenshot.ps1 [-FeatureDir specs/<feature>] [-Scenario after-save] [-Endpoint http://127.0.0.1:9222] [-WebSocketDebuggerUrl ws://...] [-Json]"
    Write-Output "Captures a key-path CDP screenshot into <feature-dir>/cdp-screenshots and appends screenshots-index.md."
    exit 0
}

. "$PSScriptRoot/cdp-common.ps1"

function New-Result {
    param([string]$Status, [hashtable]$Facts, [array]$Blockers, [array]$Unknowns, [array]$Hints)
    [PSCustomObject]@{
        tool = "capture-cdp-screenshot"
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
        if ($Payload.facts.screenshot_dir) {
            Write-Output ("screenshot_dir: " + $Payload.facts.screenshot_dir)
        }
        if ($Payload.facts.screenshot_path) {
            Write-Output ("screenshot_path: " + $Payload.facts.screenshot_path)
        }
        foreach ($blocker in @($Payload.blockers)) {
            [Console]::Error.WriteLine(" - $blocker")
        }
    }
    if ($Payload.status -eq "blocked") { exit 1 }
}

function Get-FullPath {
    param([string]$PathValue)
    return [System.IO.Path]::GetFullPath($PathValue)
}

function Test-IsInsidePath {
    param([string]$Candidate, [string]$Base)
    $candidateFull = (Get-FullPath $Candidate).TrimEnd("\", "/")
    $baseFull = (Get-FullPath $Base).TrimEnd("\", "/")
    if ($candidateFull.Equals($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }
    $prefix = $baseFull + [System.IO.Path]::DirectorySeparatorChar
    return $candidateFull.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function ConvertTo-SafeFileStem {
    param([string]$Value)
    $stem = $Value.Trim()
    if (-not $stem) { $stem = "cdp-screenshot" }
    $stem = $stem -replace "[^A-Za-z0-9._-]+", "-"
    $stem = $stem.Trim("-._")
    if (-not $stem) { $stem = "cdp-screenshot" }
    return $stem
}

function Resolve-FeatureDir {
    $root = Get-FullPath $RepoRoot
    if ($FeatureDir) {
        if ([System.IO.Path]::IsPathRooted($FeatureDir)) {
            return Get-FullPath $FeatureDir
        }
        return Get-FullPath (Join-Path $root $FeatureDir)
    }

    $featureJson = Join-Path $root ".specify/feature.json"
    if (-not (Test-Path -LiteralPath $featureJson)) {
        return ""
    }

    try {
        $feature = Get-Content -LiteralPath $featureJson -Raw | ConvertFrom-Json
    } catch {
        return ""
    }
    if (-not ($feature.PSObject.Properties.Name -contains "feature_directory")) {
        return ""
    }
    $featureDirValue = [string]$feature.feature_directory
    if (-not $featureDirValue) {
        return ""
    }
    if ([System.IO.Path]::IsPathRooted($featureDirValue)) {
        return Get-FullPath $featureDirValue
    }
    return Get-FullPath (Join-Path $root $featureDirValue)
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

function Select-CdpTarget {
    param([array]$Targets, [string]$Kind)
    $pageTargets = @()
    foreach ($target in @($Targets)) {
        if ([string]$target.type -ne "page") { continue }
        $record = ConvertTo-TargetRecord $target
        $record.reason = Get-TargetReason -Title $record.title -Url $record.url
        $pageTargets += [PSCustomObject]$record
    }

    foreach ($target in @($pageTargets)) {
        if ($Kind -eq "host-app" -and $target.reason -eq "host-app") {
            return [ordered]@{ selected = $target; page_targets = $pageTargets }
        }
        if ($Kind -eq "workbench" -and $target.reason -eq "workbench") {
            return [ordered]@{ selected = $target; page_targets = $pageTargets }
        }
    }
    return [ordered]@{ selected = $null; page_targets = $pageTargets }
}

function Invoke-CdpScreenshot {
    param([string]$DebuggerUrl)
    return Invoke-CdpScreenshotData -DebuggerUrl $DebuggerUrl -TimeoutSec $TimeoutSec -CaptureBeyondViewport:$CaptureBeyondViewport
}

$blockers = @()
$unknowns = @()
$hints = @(
    "Tell the human the screenshot directory at the end of CDP validation.",
    "Capture only key-path screenshots, such as baseline, action result, error/confirm dialog, hover/expanded state, and final fixed state."
)

$resolvedFeatureDir = Resolve-FeatureDir
$facts = [ordered]@{
    repo_root = Get-FullPath $RepoRoot
    feature_dir = $resolvedFeatureDir
    screenshot_dir = ""
    screenshot_path = ""
    screenshots_index = ""
    scenario = $Scenario
    target_kind = $TargetKind
    endpoint = $Endpoint
    selected_target = $null
    page_targets = @()
    dry_run = [bool]$DryRun
    capture_method = "Page.captureScreenshot"
}

if (-not $resolvedFeatureDir) {
    $blockers += "FeatureDir was not provided and .specify/feature.json does not contain feature_directory."
    Write-Result (New-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints)
}

if (-not (Test-Path -LiteralPath $resolvedFeatureDir -PathType Container)) {
    $blockers += "FeatureDir does not exist: $resolvedFeatureDir"
    Write-Result (New-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints)
}

$screenshotDir = if ($OutputDir) {
    if ([System.IO.Path]::IsPathRooted($OutputDir)) { Get-FullPath $OutputDir } else { Get-FullPath (Join-Path $resolvedFeatureDir $OutputDir) }
} else {
    Get-FullPath (Join-Path $resolvedFeatureDir "cdp-screenshots")
}

if (-not (Test-IsInsidePath -Candidate $screenshotDir -Base $resolvedFeatureDir)) {
    $blockers += "OutputDir must stay under the feature directory: $resolvedFeatureDir"
    Write-Result (New-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints)
}

New-Item -ItemType Directory -Force -Path $screenshotDir | Out-Null

$safeScenario = ConvertTo-SafeFileStem $Scenario
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$fileName = "$timestamp-$safeScenario.png"
$screenshotPath = Join-Path $screenshotDir $fileName
$indexPath = Join-Path $screenshotDir "screenshots-index.md"

$facts.screenshot_dir = $screenshotDir
$facts.screenshot_path = $screenshotPath
$facts.screenshots_index = $indexPath

$selectedTarget = $null
if ($WebSocketDebuggerUrl) {
    $selectedTarget = [PSCustomObject]@{
        id = ""
        type = "page"
        title = ""
        url = ""
        webSocketDebuggerUrl = $WebSocketDebuggerUrl
        reason = "explicit"
    }
} else {
    try {
        if ([string]::IsNullOrWhiteSpace($TargetsJson)) {
            $listUrl = $Endpoint.TrimEnd("/") + "/json/list"
            $targets = Invoke-RestMethod -Uri $listUrl -Method Get -TimeoutSec 3
        } else {
            $targets = $TargetsJson | ConvertFrom-Json
        }
        $selection = Select-CdpTarget -Targets @($targets) -Kind $TargetKind
        $selectedTarget = $selection.selected
        $facts.page_targets = @($selection.page_targets)
    } catch {
        $blockers += "Unable to select CDP target: $($_.Exception.Message)"
        Write-Result (New-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints)
    }
}

if (-not $selectedTarget) {
    $blockers += "No matching host CDP target found for TargetKind '$TargetKind'."
    Write-Result (New-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints)
}
if (-not $selectedTarget.webSocketDebuggerUrl) {
    $blockers += "Selected CDP target has no webSocketDebuggerUrl."
    Write-Result (New-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints)
}

$facts.selected_target = $selectedTarget

if (-not $DryRun) {
    try {
        $base64 = Invoke-CdpScreenshot -DebuggerUrl ([string]$selectedTarget.webSocketDebuggerUrl)
        if (-not $base64) {
            throw "CDP returned an empty screenshot payload."
        }
        [System.IO.File]::WriteAllBytes($screenshotPath, [Convert]::FromBase64String($base64))
        $facts.bytes = (Get-Item -LiteralPath $screenshotPath).Length
    } catch {
        $blockers += "Unable to capture CDP screenshot: $($_.Exception.Message)"
        Write-Result (New-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints)
    }

    if (-not (Test-Path -LiteralPath $indexPath)) {
        @(
            "# CDP Screenshots",
            "",
            "| File | Scenario | Captured At | Target id/title/url | Notes |",
            "| --- | --- | --- | --- | --- |"
        ) | Set-Content -LiteralPath $indexPath -Encoding UTF8
    }
    $targetSummary = (($selectedTarget.id, $selectedTarget.title, $selectedTarget.url) | Where-Object { $_ }) -join " / "
    $escapedScenario = $Scenario.Replace("|", "\|")
    $escapedTarget = $targetSummary.Replace("|", "\|")
    $row = "| $fileName | $escapedScenario | $(Get-Date -Format s) | $escapedTarget | Page.captureScreenshot |"
    Add-Content -LiteralPath $indexPath -Value $row -Encoding UTF8
} else {
    $facts.planned = $true
}

Write-Result (New-Result -Status "ok" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints)
