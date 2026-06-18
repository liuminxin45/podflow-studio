param(
    [string]$ChecklistPath = "",
    [string]$FeatureDir = ""
)

$ErrorActionPreference = "Stop"

function Fail($Message) {
    Write-Error $Message
    exit 1
}

function Find-SpecKitRoot {
    $current = (Resolve-Path -LiteralPath (Get-Location).Path).Path
    while ($true) {
        if (Test-Path -LiteralPath (Join-Path $current ".specify") -PathType Container) {
            return $current
        }
        $parent = Split-Path $current -Parent
        if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $current) {
            return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "../../..")).Path
        }
        $current = $parent
    }
}

$specKitRoot = Find-SpecKitRoot

if (-not $FeatureDir) {
    $featureJson = Join-Path $specKitRoot ".specify\feature.json"
    if (Test-Path $featureJson) {
        $feature = Get-Content $featureJson -Raw | ConvertFrom-Json
        $FeatureDir = $feature.feature_directory
    }
}

if (-not $FeatureDir) {
    Fail "FeatureDir is required when .specify/feature.json is unavailable."
}

if (-not [System.IO.Path]::IsPathRooted($FeatureDir)) {
    $FeatureDir = Join-Path $specKitRoot $FeatureDir
}

if (-not $ChecklistPath) {
    $ChecklistPath = Join-Path $FeatureDir "checklists\requirements.md"
}

if (!(Test-Path $ChecklistPath)) {
    Fail "Checklist not found: $ChecklistPath"
}

$specPath = Join-Path $FeatureDir "spec.md"
if (!(Test-Path $specPath)) {
    Fail "Spec not found: $specPath"
}

$text = Get-Content $ChecklistPath -Raw
$badPlaceholders = @(
    "\[CHECKLIST TYPE\]",
    "\[CAPABILITY NAME\]",
    "\[DATE\]",
    "\[Link to spec\.md\]",
    "\bTBD\b",
    "\bTODO\b"
)

foreach ($pattern in $badPlaceholders) {
    if ($text -match $pattern) {
        Fail "Checklist contains unresolved placeholder or TODO matching: $pattern"
    }
}

$lines = $text -split "`r?`n"
$ids = foreach ($line in $lines) {
    if ($line -match "^- \[[ xX]\]\s*(CHK[0-9A-Z]+)\b") {
        $Matches[1]
    }
}
$duplicates = $ids | Group-Object | Where-Object { $_.Count -gt 1 } | Select-Object -ExpandProperty Name
if ($duplicates) {
    Fail "Checklist contains duplicate CHK identifiers: $($duplicates -join ', ')"
}

foreach ($line in $lines) {
    if ($line -match "^- \[[ xX]\].*N/A\s*$") {
        Fail "N/A checklist line must include a reason: $line"
    }
    if ($line -match "^- \[ \].*$" -and $line -notmatch "(缺失|待|需要|原因|gap|N/A|NEEDS CLARIFICATION)") {
        Fail "Unchecked checklist line must include a reason or follow-up: $line"
    }
}

if ($text -notmatch "spec\.md") {
    Fail "Checklist must link or refer to spec.md."
}

Write-Output "Checklist validation passed: $ChecklistPath"
