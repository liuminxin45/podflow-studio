#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$FeatureDir = "",
    [string]$Stage = "",
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output "Usage: select-gates.ps1 [-RepoRoot <repo>] [-FeatureDir <dir>] [-Stage <stage>] [-Json]"
    Write-Output "Selects the smallest useful Spec Kit workflow gate packs from ai/workflows/gates/index.yml."
    exit 0
}

function New-Result {
    [ordered]@{
        tool = "select-gates"
        status = "ok"
        facts = [ordered]@{}
        blockers = @()
        unknowns = @()
        hints = @()
    }
}

function Write-Result {
    param($Result)
    if ($Json) {
        $Result | ConvertTo-Json -Depth 10 -Compress
    } elseif ($Result.status -eq "ok") {
        Write-Output "Selected gate packs: $(@($Result.facts.selected | ForEach-Object { $_.id }) -join ', ')"
    } else {
        foreach ($blocker in $Result.blockers) {
            [Console]::Error.WriteLine(" - $blocker")
        }
    }
    if ($Result.status -eq "blocked") { exit 1 }
}

function Normalize-Token {
    param([string]$Value)
    return (($Value.ToLowerInvariant()) -replace "[^a-z0-9]+", "")
}

function Add-Term {
    param([System.Collections.Generic.HashSet[string]]$Terms, [string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return }
    $lower = $Value.ToLowerInvariant()
    [void]$Terms.Add($lower)
    foreach ($piece in ($lower -split "[^a-z0-9]+")) {
        if ($piece) { [void]$Terms.Add($piece) }
    }
}

function Get-InlineList {
    param([string]$Line)
    $match = [regex]::Match($Line, "\[(.*?)\]")
    if (-not $match.Success) { return @() }
    return @($match.Groups[1].Value -split "," | ForEach-Object { $_.Trim().Trim('"').Trim("'") } | Where-Object { $_ })
}

function Get-GateIndexPath {
    $templateRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    $candidates = @(
        (Join-Path $RepoRoot "ai/workflows/gates/index.yml"),
        (Join-Path $RepoRoot "spec-kit/templates/ai/workflows/gates/index.yml"),
        (Join-Path $templateRoot "templates/ai/workflows/gates/index.yml")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return ""
}

function Get-MaxSelected {
    param([string]$Path)
    $text = Get-Content -LiteralPath $Path -Raw
    $match = [regex]::Match($text, "(?m)^\s*max_selected_gates:\s*(\d+)\s*$")
    if ($match.Success) { return [Math]::Max(1, [int]$match.Groups[1].Value) }
    return 5
}

function Read-GateEntries {
    param([string]$Path)
    $entries = @()
    $current = $null
    $inGates = $false
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match "^gates:\s*$") {
            $inGates = $true
            continue
        }
        if (-not $inGates) { continue }
        if ($line -match "^\S") { break }
        if ($line -match "^\s{2}([A-Za-z0-9_-]+):\s*$") {
            if ($null -ne $current) { $entries += $current }
            $current = [ordered]@{
                id = $Matches[1]
                path = ""
                stages = @()
                affected_repositories = @()
                risk_flags = @()
                capability_tags = @()
                terms = @()
            }
            continue
        }
        if ($null -eq $current) { continue }
        if ($line -match "^\s{4}path:\s*['""]?(.+?)['""]?\s*$") {
            $current.path = $Matches[1]
        } elseif ($line -match "^\s{4}stages:\s*\[") {
            $current.stages = Get-InlineList $line
        } elseif ($line -match "^\s{4}affected_repositories:\s*\[") {
            $current.affected_repositories = Get-InlineList $line
        } elseif ($line -match "^\s{4}risk_flags:\s*\[") {
            $current.risk_flags = Get-InlineList $line
        } elseif ($line -match "^\s{4}capability_tags:\s*\[") {
            $current.capability_tags = Get-InlineList $line
        } elseif ($line -match "^\s{4}terms:\s*\[") {
            $current.terms = Get-InlineList $line
        }
    }
    if ($null -ne $current) { $entries += $current }
    return $entries
}

function Read-Routing {
    $terms = [System.Collections.Generic.HashSet[string]]::new()
    Add-Term $terms $Stage
    $routing = [ordered]@{
        affected_repositories = @()
        risk_flags = @()
        capability_tags = @()
        ai_context_terms = @()
        feature_json = Join-Path $RepoRoot ".specify/feature.json"
        plan = ""
    }

    if (Test-Path -LiteralPath $routing.feature_json) {
        try {
            $feature = Get-Content -LiteralPath $routing.feature_json -Raw | ConvertFrom-Json
            foreach ($name in @("affected_repositories", "risk_flags", "capability_tags")) {
                if ($feature.PSObject.Properties.Name -contains $name) {
                    $routing[$name] = @($feature.$name | ForEach-Object { [string]$_ })
                    foreach ($value in $routing[$name]) { Add-Term $terms $value }
                }
            }
            if ($feature.PSObject.Properties.Name -contains "request_summary") {
                Add-Term $terms ([string]$feature.request_summary)
            }
        } catch {
            # Keep gate selection usable; feature-artifact validation owns JSON blocking.
        }
    }

    $planPath = if ($FeatureDir) { Join-Path $FeatureDir "plan.md" } else { "" }
    if ($planPath -and (Test-Path -LiteralPath $planPath)) {
        $routing.plan = $planPath
        $text = Get-Content -LiteralPath $planPath -Raw
        $match = [regex]::Match($text, "(?s)## AI Context Contract(.*?)(\n## |\z)")
        if ($match.Success) {
            $section = $match.Groups[1].Value
            foreach ($piece in ($section.ToLowerInvariant() -split "[^a-z0-9]+")) {
                if ($piece) {
                    [void]$terms.Add($piece)
                    $routing.ai_context_terms += $piece
                }
            }
        }
    }

    $routing.terms = @($terms | Sort-Object)
    $routing.ai_context_terms = @($routing.ai_context_terms | Select-Object -Unique | Sort-Object)
    return $routing
}

$result = New-Result
$indexPath = Get-GateIndexPath
if (-not $indexPath) {
    $result.status = "blocked"
    $result.blockers += "ai/workflows/gates/index.yml not found"
    Write-Result $result
}

$routing = Read-Routing
$entries = Read-GateEntries -Path $indexPath
$selected = @()
$normalizedRepos = @($routing.affected_repositories | ForEach-Object { Normalize-Token $_ })

foreach ($entry in $entries) {
    if (-not $entry.path) { continue }
    $score = 0
    $reasons = @()
    $matched = @()
    foreach ($stageName in @($entry.stages)) {
        if ($Stage -and $stageName -eq $Stage) {
            $score += 1
            $reasons += "stage"
        }
    }
    foreach ($repo in @($entry.affected_repositories)) {
        if ($normalizedRepos -contains (Normalize-Token $repo)) {
            $score += 4
            $matched += $repo
        }
    }
    foreach ($flag in @($entry.risk_flags)) {
        if ($routing.risk_flags -contains $flag) {
            $score += 5
            $matched += $flag
        }
    }
    foreach ($tag in @($entry.capability_tags)) {
        if ($routing.capability_tags -contains $tag -or $routing.terms -contains $tag.ToLowerInvariant()) {
            $score += 3
            $matched += $tag
        }
    }
    foreach ($term in @($entry.terms)) {
        if ($routing.terms -contains $term.ToLowerInvariant()) {
            $score += 2
            $matched += $term
        }
    }
    if ($matched.Count -gt 0) {
        $reasons += "matched: " + (($matched | Select-Object -Unique) -join ", ")
    }
    if ($score -gt 0) {
        $selected += [ordered]@{
            id = $entry.id
            path = "ai/workflows/gates/$($entry.path)"
            score = $score
            reason = (($reasons | Select-Object -Unique) -join "; ")
            matched = @($matched | Select-Object -Unique)
        }
    }
}

$maxSelected = Get-MaxSelected -Path $indexPath
$selected = @($selected | Sort-Object -Property @{ Expression = { $_.score }; Descending = $true }, @{ Expression = { $_.path }; Descending = $false } | Select-Object -First $maxSelected)
$result.facts.index = $indexPath
$result.facts.max_selected_gates = $maxSelected
$result.facts.stage = $Stage
$result.facts.affected_repositories = $routing.affected_repositories
$result.facts.risk_flags = $routing.risk_flags
$result.facts.capability_tags = $routing.capability_tags
$result.facts.ai_context_terms = $routing.ai_context_terms
$result.facts.selected = @($selected)
if ($selected.Count -eq 0) {
    $result.hints += "no workflow gate pack matched; keep the command contract and active artifacts only"
}

Write-Result $result
