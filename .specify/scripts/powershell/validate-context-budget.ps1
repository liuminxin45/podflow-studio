#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Get-SpecKitRoot
}
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path

if ($Help) {
    Write-Output "Usage: validate-context-budget.ps1 [-RepoRoot <repo>] [-Json]"
    Write-Output "Checks that Spec Kit default context, command templates, skill maps, internal skills, knowledge guides, and gate packs stay compact."
    exit 0
}

function Count-Lines {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return @((Get-Content -LiteralPath $Path)).Count
}

function Add-Check {
    param($Checks, [string]$Scope, [string]$Path, [int]$MaxLines)
    $full = Join-Path $RepoRoot $Path
    $lines = Count-Lines $full
    $Checks.Add([ordered]@{
        scope = $Scope
        path = $Path
        lines = $lines
        max_lines = $MaxLines
        status = if ($null -eq $lines) { "missing" } elseif ($lines -le $MaxLines) { "ok" } else { "over_budget" }
    }) | Out-Null
}

function Add-CheckCandidate {
    param($Checks, [string]$Scope, [string[]]$Paths, [int]$MaxLines)
    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath (Join-Path $RepoRoot $path) -PathType Leaf) {
            Add-Check $Checks $Scope $path $MaxLines
            return
        }
    }
    Add-Check $Checks $Scope $Paths[0] $MaxLines
}

function Get-InternalSkillBudget {
    param([string]$Name)
    $budgets = @{
        "speckit-retrospective" = 360
        "speckit-tasks" = 310
        "speckit-intake" = 280
        "speckit-analyze" = 240
        "speckit-acceptance" = 230
        "speckit-checklist" = 230
        "speckit-constitution" = 220
        "speckit-promote-lessons" = 210
        "speckit-commit" = 180
    }
    if ($budgets.ContainsKey($Name)) { return [int]$budgets[$Name] }
    return 160
}

$checks = [System.Collections.ArrayList]::new()
$blockers = @()
$hints = @()
$sourceOnlySpecKitRoot = (
    (Test-Path -LiteralPath (Join-Path $RepoRoot "spec-kit/templates") -PathType Container) -and
    -not (Test-Path -LiteralPath (Join-Path $RepoRoot ".specify") -PathType Container) -and
    -not (Test-Path -LiteralPath (Join-Path $RepoRoot "ai") -PathType Container)
)

foreach ($item in @(
    @("default-context", @("AGENTS.md"), 130),
    @("default-context", @(".specify/memory/repository-map.md"), 140),
    @("default-context", @("ai/workflows/task-routing.md"), 180),
    @("workflow-map", @("spec-kit/templates/ai/workflows/skill-routing.yml", "ai/workflows/skill-routing.yml"), 90),
    @("core-command", @("spec-kit/templates/commands/implement.md", ".agents/spec-kit/skills/speckit-implement/SKILL.md"), 220),
    @("core-command", @("spec-kit/templates/commands/plan.md", ".agents/spec-kit/skills/speckit-plan/SKILL.md"), 220),
    @("core-template", @("spec-kit/templates/plan-template.md", ".specify/templates/plan-template.md"), 220),
    @("core-template", @("spec-kit/templates/layer-manifest.yml", ".specify/templates/layer-manifest.yml"), 380),
    @("knowledge-index", @("spec-kit/templates/ai/knowledge/index.yml", "ai/knowledge/index.yml"), 140)
)) {
    Add-CheckCandidate $checks $item[0] $item[1] $item[2]
}

$gatesRoot = Join-Path $RepoRoot "spec-kit/templates/ai/workflows/gates"
if (-not (Test-Path -LiteralPath $gatesRoot -PathType Container)) {
    $gatesRoot = Join-Path $RepoRoot "ai/workflows/gates"
}
foreach ($path in Get-ChildItem -LiteralPath $gatesRoot -File -Filter "*.yml" -ErrorAction SilentlyContinue) {
    $rel = $path.FullName.Substring($RepoRoot.Length).TrimStart('\', '/') -replace "\\", "/"
    $max = if ($path.Name -eq "index.yml") { 80 } else { 60 }
    Add-Check $checks "gate-pack" $rel $max
}

$internalSkillsRoot = Join-Path $RepoRoot ".agents/spec-kit/skills"
if (Test-Path -LiteralPath $internalSkillsRoot -PathType Container) {
    foreach ($path in Get-ChildItem -LiteralPath $internalSkillsRoot -Directory -ErrorAction SilentlyContinue) {
        $skillFile = Join-Path $path.FullName "SKILL.md"
        if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) { continue }
        $rel = $skillFile.Substring($RepoRoot.Length).TrimStart('\', '/') -replace "\\", "/"
        Add-Check $checks "internal-skill" $rel (Get-InternalSkillBudget $path.Name)
    }
}

$knowledgeRoot = Join-Path $RepoRoot "spec-kit/templates/ai/knowledge"
if (-not (Test-Path -LiteralPath $knowledgeRoot -PathType Container)) {
    $knowledgeRoot = Join-Path $RepoRoot "ai/knowledge"
}
foreach ($path in Get-ChildItem -LiteralPath $knowledgeRoot -Recurse -File -Include "*.md", "*.yml", "*.yaml" -ErrorAction SilentlyContinue) {
    $rel = $path.FullName.Substring($RepoRoot.Length).TrimStart('\', '/') -replace "\\", "/"
    $max = if ($path.Name -eq "build-and-package-notes.md") { 180 } else { 140 }
    Add-Check $checks "knowledge-guide" $rel $max
}

foreach ($check in $checks) {
    if ($check.status -eq "missing") {
        if ($sourceOnlySpecKitRoot -and $check.scope -eq "default-context") {
            $hints += "source-only check skipped generated workspace target: $($check.path)"
        } else {
            $blockers += "context budget target missing: $($check.path)"
        }
    } elseif ($check.status -eq "over_budget") {
        $blockers += "$($check.path) has $($check.lines) lines; budget is $($check.max_lines)"
    }
}

$nearBudget = @($checks | Where-Object { $_.status -eq "ok" -and $_.max_lines -gt 0 -and $_.lines -ge [Math]::Floor($_.max_lines * 0.9) })
foreach ($check in $nearBudget) {
    $hints += "$($check.path) is near its context budget ($($check.lines)/$($check.max_lines) lines)"
}

$payload = [ordered]@{
    tool = "validate-context-budget"
    status = if ($blockers.Count -gt 0) { "blocked" } else { "ok" }
    facts = [ordered]@{
        checked = @($checks)
        over_budget = @($checks | Where-Object { $_.status -eq "over_budget" })
        near_budget = @($nearBudget)
    }
    blockers = $blockers
    unknowns = @()
    hints = $hints
}

if ($Json) {
    $payload | ConvertTo-Json -Depth 10 -Compress
} elseif ($payload.status -eq "ok") {
    Write-Output "Spec Kit context budget is ok."
} else {
    foreach ($blocker in $blockers) {
        [Console]::Error.WriteLine(" - $blocker")
    }
}
if ($payload.status -eq "blocked") { exit 1 }
