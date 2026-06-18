#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$Message = "",
    [string]$MessageFile = "",
    [switch]$Stdin,
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Output "Usage: validate-commit-message.ps1 [-Message <text> | -MessageFile <path> | -Stdin] [-Json]"
    Write-Output "Validates the HostApplication / application Chinese commit-message template."
    exit 0
}

function Get-InputMessage {
    if ($Stdin) {
        return [Console]::In.ReadToEnd()
    }
    if (-not [string]::IsNullOrWhiteSpace($MessageFile)) {
        return Get-Content -LiteralPath $MessageFile -Raw
    }
    return $Message
}

function Get-DisplayWidth {
    param([string]$Text)
    $width = 0
    foreach ($ch in $Text.ToCharArray()) {
        if ([int][char]$ch -le 0x7f) {
            $width += 1
        } else {
            $width += 2
        }
    }
    return $width
}

function Test-ContainsCjk {
    param([string]$Text)
    foreach ($ch in $Text.ToCharArray()) {
        $code = [int][char]$ch
        if ($code -ge 0x4e00 -and $code -le 0x9fff) {
            return $true
        }
    }
    return $false
}

function Get-SectionContentLines {
    param(
        [string[]]$AllLines,
        [string]$Section,
        [string[]]$SectionNames
    )
    $index = [Array]::IndexOf($AllLines, $Section)
    if ($index -lt 0) { return @() }

    $content = @()
    for ($i = $index + 1; $i -lt $AllLines.Count; $i++) {
        $line = $AllLines[$i]
        if ($SectionNames -contains $line -or $line -match '^Change-Id:\s*') { break }
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            $content += $line
        }
    }
    return $content
}

$messageText = Get-InputMessage
$normalized = $messageText -replace "`r`n", "`n"
$lines = @($normalized -split "`n")
$nonEmptyLines = @($lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$blockers = @()
$unknowns = @()
$hints = @()

if ($nonEmptyLines.Count -eq 0) {
    $blockers += "Commit message is empty."
}

$requiredSections = @(
    "【提交类型】",
    "【问题描述】",
    "【修改方案】",
    "【影响评估】",
    "【兼容性分析】",
    "【需要同时入库的提交】",
    "【自测结果】"
)

foreach ($section in $requiredSections) {
    if ($lines -notcontains $section) {
        $blockers += "Missing required section: $section"
        continue
    }

    $index = [Array]::IndexOf($lines, $section)
    $hasContent = $false
    for ($i = $index + 1; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($requiredSections -contains $line -or $line -match '^Change-Id:\s*') { break }
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            $hasContent = $true
            break
        }
    }
    if (-not $hasContent) {
        $blockers += "Required section has no content: $section"
    }
}

if ($nonEmptyLines.Count -ge 1 -and $nonEmptyLines[0] -match '^【') {
    $blockers += "Missing subject line before template sections."
}
if ($nonEmptyLines.Count -ge 1) {
    $subject = $nonEmptyLines[0]
    if ($subject -match '^(fix|feat|chore|docs|refactor|test|tests|build|ci|perf|style|revert)(\(|:)') {
        $blockers += "Subject must use '<Module>: <concise English summary>', not Conventional Commit format: $subject"
    }
    if ($subject -notmatch '^[A-Za-z][A-Za-z0-9._/-]*:\s+\S') {
        $blockers += "Subject must use '<Module>: <concise English summary>': $subject"
    }
}
if ($nonEmptyLines.Count -lt 2) {
    $blockers += "Missing Chinese summary line after subject."
} elseif ($nonEmptyLines[1] -match '^【') {
    $blockers += "Missing Chinese summary line before template sections."
} elseif (-not (Test-ContainsCjk -Text $nonEmptyLines[1])) {
    $blockers += "Second non-empty line must be the Chinese summary, not a wrapped subject line: $($nonEmptyLines[1])"
}

$typeLines = @(Get-SectionContentLines -AllLines $lines -Section "【提交类型】" -SectionNames $requiredSections)
if ($typeLines.Count -gt 0 -and $typeLines[0] -notmatch '\s-\s') {
    $blockers += "【提交类型】 must use '<类型> - <范围或问题域>': $($typeLines[0])"
}
if ($typeLines.Count -gt 0) {
    $genericTypes = @(
        "修复 - UI 交互",
        "修复 - 代码",
        "修复 - 逻辑",
        "缺陷修复 - UI",
        "缺陷修复 - 前端"
    )
    if ($genericTypes -contains $typeLines[0].Trim()) {
        $blockers += "【提交类型】 scope is too generic; name the concrete module or problem domain: $($typeLines[0])"
    }
}

$selfTestLines = @(Get-SectionContentLines -AllLines $lines -Section "【自测结果】" -SectionNames $requiredSections)
if ($selfTestLines.Count -gt 0) {
    $lastSelfTest = $selfTestLines[$selfTestLines.Count - 1]
    if ($lastSelfTest -notmatch '相关测试通过，自测通过') {
        $blockers += "【自测结果】 must end with '相关测试通过，自测通过' when validation passes: $lastSelfTest"
    }
}

foreach ($line in $nonEmptyLines) {
    $width = Get-DisplayWidth -Text $line
    if ($width -gt 68) {
        $blockers += "Line exceeds 68 display columns ($width): $line"
    }
    if ($line -match '[A-Za-z_][A-Za-z0-9_]*::$') {
        $blockers += "Technical token appears split across lines: $line"
    }
}

if ($normalized -match "【提交类型】\n\s*\n\s*Change-Id:") {
    $blockers += "Commit message appears truncated after 【提交类型】."
}

$status = if ($blockers.Count -eq 0) { "ok" } else { "blocked" }
$payload = [PSCustomObject]@{
    tool = "validate-commit-message"
    status = $status
    facts = [PSCustomObject]@{
        required_sections = $requiredSections
        non_empty_line_count = $nonEmptyLines.Count
        generic_type_blocklist = @("修复 - UI 交互", "修复 - 代码", "修复 - 逻辑", "缺陷修复 - UI", "缺陷修复 - 前端")
    }
    blockers = $blockers
    unknowns = $unknowns
    hints = $hints
}

if ($Json) {
    $payload | ConvertTo-Json -Depth 8 -Compress
} elseif ($status -eq "ok") {
    Write-Output "Commit message template validation passed."
} else {
    [Console]::Error.WriteLine("Commit message template validation failed:")
    foreach ($blocker in $blockers) {
        [Console]::Error.WriteLine(" - $blocker")
    }
}

if ($status -ne "ok") { exit 1 }
