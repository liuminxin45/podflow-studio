#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$SourceDir = "",
    [string]$RuntimeDir = "",
    [string]$PluginId = "",
    [string]$RefreshCommand = "",
    [switch]$KeepStale,
    [switch]$DryRun,
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Output "Usage: sync-ui-runtime-artifacts.ps1 -SourceDir <dir> -RuntimeDir <dir> -PluginId <id> [-RefreshCommand <command>] [-KeepStale] [-DryRun] [-Json]"
    Write-Output "Mirrors built UI artifacts from repository source output into an explicit host-served runtime plugin directory, then optionally runs a refresh command."
    exit 0
}

function Test-IsSubPath {
    param(
        [string]$Child,
        [string]$Parent
    )
    $normalizedChild = [System.IO.Path]::GetFullPath($Child).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $normalizedParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    if ($normalizedChild.Length -le $normalizedParent.Length) { return $false }
    return $normalizedChild.StartsWith($normalizedParent + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
        $normalizedChild.StartsWith($normalizedParent + [System.IO.Path]::AltDirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Write-Result {
    param(
        [string]$Status,
        [hashtable]$Facts,
        [array]$Blockers,
        [array]$Unknowns,
        [array]$Hints
    )

    $payload = [PSCustomObject]@{
        tool = "sync-ui-runtime-artifacts"
        status = $Status
        facts = [PSCustomObject]$Facts
        blockers = $Blockers
        unknowns = $Unknowns
        hints = $Hints
    }

    if ($Json) {
        $payload | ConvertTo-Json -Depth 8 -Compress
    } elseif ($Status -eq "ok") {
        Write-Output "UI runtime artifacts synchronized."
    } else {
        [Console]::Error.WriteLine("UI runtime artifact synchronization failed:")
        foreach ($blocker in $Blockers) {
            [Console]::Error.WriteLine(" - $blocker")
        }
    }

    if ($Status -ne "ok") { exit 1 }
}

$blockers = @()
$unknowns = @()
$hints = @(
    "Treat the runtime directory as validation/deployment output only; keep durable fixes in repository source.",
    "This script mirrors current source output into one explicit plugin runtime directory and removes stale files by default."
)
$facts = [ordered]@{
    source_dir = $SourceDir
    runtime_dir = $RuntimeDir
    plugin_id = $PluginId
    dry_run = [bool]$DryRun
    copied_entry_count = 0
    copied_file_count = 0
    removed_stale_count = 0
    keep_stale = [bool]$KeepStale
    refresh_command = $RefreshCommand
    refresh_exit_code = $null
}

if ([string]::IsNullOrWhiteSpace($SourceDir)) {
    $blockers += "SourceDir is required."
}
if ([string]::IsNullOrWhiteSpace($RuntimeDir)) {
    $blockers += "RuntimeDir is required."
}
if ([string]::IsNullOrWhiteSpace($PluginId)) {
    $blockers += "PluginId is required so stale runtime cleanup is scoped to one explicit plugin directory."
}
if ($blockers.Count -gt 0) {
    Write-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints
}

if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) {
    $blockers += "SourceDir does not exist or is not a directory: $SourceDir"
}

$sourceFull = [System.IO.Path]::GetFullPath($SourceDir)
$runtimeFull = [System.IO.Path]::GetFullPath($RuntimeDir)
$facts.source_dir = $sourceFull
$facts.runtime_dir = $runtimeFull

if ($sourceFull.TrimEnd('\', '/') -ieq $runtimeFull.TrimEnd('\', '/')) {
    $blockers += "SourceDir and RuntimeDir must be different directories."
}
if (Test-IsSubPath -Child $runtimeFull -Parent $sourceFull) {
    $blockers += "RuntimeDir must not be inside SourceDir; copying would recurse into its own output."
}
if (Test-IsSubPath -Child $sourceFull -Parent $runtimeFull) {
    $blockers += "SourceDir must not be inside RuntimeDir; runtime artifacts cannot be treated as source."
}

$runtimeParent = [System.IO.Directory]::GetParent($runtimeFull)
if ($null -eq $runtimeParent -or -not (Test-Path -LiteralPath $runtimeParent.FullName -PathType Container)) {
    $blockers += "RuntimeDir parent does not exist: $RuntimeDir"
}
if (-not [string]::IsNullOrWhiteSpace($PluginId)) {
    $runtimeLeaf = Split-Path -Leaf $runtimeFull
    if ($runtimeLeaf -ne $PluginId) {
        $blockers += "RuntimeDir leaf '$runtimeLeaf' must match PluginId '$PluginId' before runtime replacement is allowed."
    }
}

if ($blockers.Count -gt 0) {
    Write-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints
}

$entries = @(Get-ChildItem -LiteralPath $sourceFull -Force)
$files = @(Get-ChildItem -LiteralPath $sourceFull -Force -Recurse -File)
$facts.copied_entry_count = $entries.Count
$facts.copied_file_count = $files.Count

if (-not $DryRun) {
    if (-not (Test-Path -LiteralPath $runtimeFull -PathType Container)) {
        New-Item -ItemType Directory -Path $runtimeFull | Out-Null
    }

    if (-not $KeepStale) {
        $staleEntries = @(Get-ChildItem -LiteralPath $runtimeFull -Force -ErrorAction SilentlyContinue)
        $facts.removed_stale_count = $staleEntries.Count
        foreach ($stale in $staleEntries) {
            Remove-Item -LiteralPath $stale.FullName -Recurse -Force
        }
    } else {
        $hints += "KeepStale kept existing runtime files; stale split chunks may still be loaded."
    }

    foreach ($entry in $entries) {
        Copy-Item -LiteralPath $entry.FullName -Destination $runtimeFull -Recurse -Force
    }

    if (-not [string]::IsNullOrWhiteSpace($RefreshCommand)) {
        Invoke-Expression $RefreshCommand
        $facts.refresh_exit_code = $LASTEXITCODE
        if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            $blockers += "RefreshCommand failed with exit code $LASTEXITCODE."
        }
    }
} else {
    if (Test-Path -LiteralPath $runtimeFull -PathType Container) {
        $facts.removed_stale_count = @(Get-ChildItem -LiteralPath $runtimeFull -Force -ErrorAction SilentlyContinue).Count
    }
    if (-not [string]::IsNullOrWhiteSpace($RefreshCommand)) {
        $hints += "DryRun skipped RefreshCommand."
    }
}

$status = if ($blockers.Count -eq 0) { "ok" } else { "blocked" }
Write-Result -Status $status -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints
