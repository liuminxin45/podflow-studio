#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [int[]]$StartedProcessIds = @(),
    [string]$HostAppRoot = "",
    [switch]$DryRun,
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output "Usage: cleanup-host-cdp.ps1 -StartedProcessIds <pid[]> [-HostAppRoot <path>] [-DryRun] [-Json]"
    Write-Output "Stops only HostApplication host processes that the AI started and can still verify. Unknown or user-owned processes are reported as blockers and are never killed."
    exit 0
}

function New-Payload {
    param([string]$Status)
    [ordered]@{
        tool = "cleanup-host-cdp"
        status = $Status
        facts = [ordered]@{
            started_process_ids = @($StartedProcessIds)
            host_app_root = $HostAppRoot
            stopped = @()
            skipped = @()
            dry_run = [bool]$DryRun
        }
        blockers = @()
        unknowns = @()
        hints = @("Only stop processes recorded as AI-started in this run. Do not kill unknown CDP port owners.")
    }
}

$payload = New-Payload "ok"
if ($StartedProcessIds.Count -eq 0) {
    $payload.facts.skipped += "no AI-started process ids provided"
    if ($Json) { $payload | ConvertTo-Json -Depth 8 -Compress } else { Write-Output "No AI-started CDP host processes to clean up." }
    exit 0
}

$resolvedHost = ""
if ($HostAppRoot) {
    $resolvedHost = [System.IO.Path]::GetFullPath($HostAppRoot).TrimEnd("\", "/")
    $payload.facts.host_app_root = $resolvedHost
}

foreach ($pid in $StartedProcessIds) {
    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if (-not $process) {
        $payload.facts.skipped += [ordered]@{ pid = $pid; reason = "already-exited" }
        continue
    }

    $path = ""
    try { $path = [string]$process.Path } catch {}
    $name = [string]$process.ProcessName
    $isKnownHostName = ($name -match "^(electron|node|HostApplication|Utility)$")
    $underHost = $false
    if ($resolvedHost -and $path) {
        $fullPath = [System.IO.Path]::GetFullPath($path)
        $underHost = $fullPath.StartsWith($resolvedHost, [System.StringComparison]::OrdinalIgnoreCase)
    }

    if (-not $isKnownHostName -and -not $underHost) {
        $payload.status = "blocked"
        $payload.blockers += "Refusing to stop unverified process $pid ($name)."
        $payload.facts.skipped += [ordered]@{ pid = $pid; name = $name; path = $path; reason = "unverified-owner" }
        continue
    }

    if ($DryRun) {
        $payload.facts.stopped += [ordered]@{ pid = $pid; name = $name; path = $path; dry_run = $true }
        continue
    }

    Stop-Process -Id $pid -ErrorAction Stop
    $payload.facts.stopped += [ordered]@{ pid = $pid; name = $name; path = $path; dry_run = $false }
}

if ($Json) {
    $payload | ConvertTo-Json -Depth 8 -Compress
} else {
    Write-Output ("status: " + $payload.status)
    foreach ($item in @($payload.facts.stopped)) { Write-Output ("stopped: " + ($item | ConvertTo-Json -Compress)) }
    foreach ($blocker in @($payload.blockers)) { [Console]::Error.WriteLine(" - $blocker") }
}
if ($payload.status -eq "blocked") { exit 1 }
