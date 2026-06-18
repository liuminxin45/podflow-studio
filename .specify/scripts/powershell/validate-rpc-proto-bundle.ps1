#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$BundleJs = "",
    [string]$ServiceName = "",
    [string]$RequiredMessages = "",
    [string]$RequiredFields = "",
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output "Usage: validate-rpc-proto-bundle.ps1 -BundleJs <file> [-ServiceName <name>] [-RequiredMessages A,B] [-RequiredFields Message:field1,field2;Other:field]"
    Write-Output "Validates generated RPC proto bundle JSON keeps required messages and fields."
    exit 0
}

function Write-Result {
    param([string]$Status, [hashtable]$Facts, [array]$Blockers, [array]$Unknowns, [array]$Hints)
    $payload = [PSCustomObject]@{
        tool = "validate-rpc-proto-bundle"
        status = $Status
        facts = [PSCustomObject]$Facts
        blockers = $Blockers
        unknowns = $Unknowns
        hints = $Hints
    }
    if ($Json) {
        $payload | ConvertTo-Json -Depth 12 -Compress
    } elseif ($Status -eq "ok") {
        Write-Output "RPC proto bundle validation passed."
    } else {
        [Console]::Error.WriteLine("RPC proto bundle validation failed:")
        foreach ($blocker in $Blockers) {
            [Console]::Error.WriteLine(" - $blocker")
        }
    }
    if ($Status -ne "ok") { exit 1 }
}

function Get-JsonObjectFromJs {
    param([string]$Text)
    $start = $Text.IndexOf("{")
    $end = $Text.LastIndexOf("}")
    if ($start -lt 0 -or $end -le $start) {
        throw "no JSON object found in bundle"
    }
    return $Text.Substring($start, $end - $start + 1) | ConvertFrom-Json
}

function Find-MessageNode {
    param($Node, [string]$Name)
    if ($null -eq $Node) { return $null }
    if ($Node -is [System.Collections.IEnumerable] -and -not ($Node -is [string])) {
        foreach ($item in @($Node)) {
            $found = Find-MessageNode -Node $item -Name $Name
            if ($found) { return $found }
        }
    }
    if ($Node.PSObject -and $Node.PSObject.Properties) {
        foreach ($property in $Node.PSObject.Properties) {
            if ($property.Name -eq $Name) { return $property.Value }
            $found = Find-MessageNode -Node $property.Value -Name $Name
            if ($found) { return $found }
        }
    }
    return $null
}

function Get-FieldNames {
    param($MessageNode)
    if ($null -eq $MessageNode) { return @() }
    if ($MessageNode.PSObject.Properties.Name -contains "fields") {
        $fields = $MessageNode.fields
        if ($fields.PSObject -and $fields.PSObject.Properties) {
            return @($fields.PSObject.Properties.Name)
        }
    }
    return @()
}

function Parse-RequiredFields {
    param([string]$Text)
    $map = [ordered]@{}
    if ([string]::IsNullOrWhiteSpace($Text)) { return $map }
    foreach ($entry in ($Text -split ";")) {
        if ([string]::IsNullOrWhiteSpace($entry)) { continue }
        $parts = $entry -split ":", 2
        if ($parts.Count -ne 2) { continue }
        $message = $parts[0].Trim()
        $fields = @($parts[1] -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        if ($message) { $map[$message] = $fields }
    }
    return $map
}

$blockers = @()
$unknowns = @()
$hints = @(
    "Run this after native bridge/proto output changes and before host CDP validation.",
    "A generated bundle that keeps the message name but drops fields is treated as a blocker."
)
$facts = [ordered]@{
    bundle_js = $BundleJs
    service_name = $ServiceName
    required_messages = @()
    required_fields = [ordered]@{}
    discovered_messages = @{}
}

if ([string]::IsNullOrWhiteSpace($BundleJs)) {
    $blockers += "BundleJs is required."
} elseif (-not (Test-Path -LiteralPath $BundleJs -PathType Leaf)) {
    $blockers += "BundleJs does not exist: $BundleJs"
}
if ($blockers.Count -gt 0) {
    Write-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints
}

$messageNames = @($RequiredMessages -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$fieldMap = Parse-RequiredFields -Text $RequiredFields
foreach ($message in $fieldMap.Keys) {
    if ($messageNames -notcontains $message) { $messageNames += $message }
}
$facts.required_messages = $messageNames
$facts.required_fields = $fieldMap

try {
    $text = Get-Content -LiteralPath $BundleJs -Raw
    $bundle = Get-JsonObjectFromJs -Text $text
    if ($ServiceName -and $text -notmatch [regex]::Escape($ServiceName)) {
        $blockers += "ServiceName '$ServiceName' was not found in bundle text."
    }
    foreach ($message in $messageNames) {
        $node = Find-MessageNode -Node $bundle -Name $message
        if (-not $node) {
            $blockers += "Required message '$message' was not found in bundle."
            continue
        }
        $fields = @(Get-FieldNames -MessageNode $node)
        $facts.discovered_messages[$message] = $fields
        if ($fields.Count -eq 0) {
            $blockers += "Required message '$message' has no fields in bundle."
        }
        foreach ($field in @($fieldMap[$message])) {
            if ($fields -notcontains $field) {
                $blockers += "Required field '$message.$field' was not found in bundle."
            }
        }
    }
} catch {
    $blockers += "BundleJs could not be parsed as generated JSON payload: $($_.Exception.Message)"
}

$status = if ($blockers.Count -eq 0) { "ok" } else { "blocked" }
Write-Result -Status $status -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints
