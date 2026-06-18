#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$SourceNativeDir = "",
    [string]$RuntimePluginDir = "",
    [string]$PluginId = "",
    [string]$ProtoFile = "",
    [string]$NativeExportsFile = "",
    [switch]$CopyAddonToRoot,
    [switch]$RemoveDuplicateProto,
    [switch]$DryRun,
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output "Usage: sync-native-runtime-artifacts.ps1 -SourceNativeDir <dir> -RuntimePluginDir <dir> -PluginId <id> [-ProtoFile <file>] [-NativeExportsFile <file>] [-CopyAddonToRoot] [-RemoveDuplicateProto] [-DryRun] [-Json]"
    Write-Output "Synchronizes native plugin build/export artifacts into one explicit runtime plugin directory and reports hashes, duplicate proto files, and blockers."
    exit 0
}

function Write-Result {
    param([string]$Status, [hashtable]$Facts, [array]$Blockers, [array]$Unknowns, [array]$Hints)
    $payload = [PSCustomObject]@{
        tool = "sync-native-runtime-artifacts"
        status = $Status
        facts = [PSCustomObject]$Facts
        blockers = $Blockers
        unknowns = $Unknowns
        hints = $Hints
    }
    if ($Json) {
        $payload | ConvertTo-Json -Depth 10 -Compress
    } elseif ($Status -eq "ok") {
        Write-Output "Native runtime artifacts synchronized."
    } else {
        [Console]::Error.WriteLine("Native runtime artifact synchronization failed:")
        foreach ($blocker in $Blockers) {
            [Console]::Error.WriteLine(" - $blocker")
        }
    }
    if ($Status -ne "ok") { exit 1 }
}

function Get-NormalizedPath {
    param([string]$Path)
    return [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
}

function Test-PathHasSegment {
    param([string]$Path, [string]$Segment)
    $segments = (Get-NormalizedPath $Path) -split "[\\/]+"
    return @($segments | Where-Object { $_ -ieq $Segment }).Count -gt 0
}

function Get-HashOrNull {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

$blockers = @()
$unknowns = @()
$hints = @(
    "Runtime native artifacts are validation/deployment output only; keep durable fixes in repository source.",
    "Loaded native modules require a host process restart before validation.",
    "Keep proto and native-exports.json in the plugin root; duplicate proto files under native/ are treated as blockers unless explicitly removed."
)
$facts = [ordered]@{
    source_native_dir = $SourceNativeDir
    runtime_plugin_dir = $RuntimePluginDir
    runtime_native_dir = ""
    plugin_id = $PluginId
    proto_file = $ProtoFile
    native_exports_file = $NativeExportsFile
    dry_run = [bool]$DryRun
    copy_addon_to_root = [bool]$CopyAddonToRoot
    remove_duplicate_proto = [bool]$RemoveDuplicateProto
    addon_files = @()
    copied_files = @()
    duplicate_native_proto_files = @()
    hashes = @()
}

if ([string]::IsNullOrWhiteSpace($SourceNativeDir)) { $blockers += "SourceNativeDir is required." }
if ([string]::IsNullOrWhiteSpace($RuntimePluginDir)) { $blockers += "RuntimePluginDir is required." }
if ([string]::IsNullOrWhiteSpace($PluginId)) { $blockers += "PluginId is required so runtime replacement is scoped to one plugin." }
if ($blockers.Count -gt 0) {
    Write-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints
}

if (-not (Test-Path -LiteralPath $SourceNativeDir -PathType Container)) {
    $blockers += "SourceNativeDir does not exist or is not a directory: $SourceNativeDir"
}
$sourceFull = Get-NormalizedPath $SourceNativeDir
$runtimeFull = Get-NormalizedPath $RuntimePluginDir
$runtimeNative = Join-Path $runtimeFull "native"
$facts.source_native_dir = $sourceFull
$facts.runtime_plugin_dir = $runtimeFull
$facts.runtime_native_dir = $runtimeNative

if (-not (Test-PathHasSegment -Path $runtimeFull -Segment $PluginId)) {
    $blockers += "RuntimePluginDir must include PluginId '$PluginId' as a path segment before native runtime replacement is allowed."
}

$runtimeParent = [System.IO.Directory]::GetParent($runtimeFull)
if ($null -eq $runtimeParent -or -not (Test-Path -LiteralPath $runtimeParent.FullName -PathType Container)) {
    $blockers += "RuntimePluginDir parent does not exist: $RuntimePluginDir"
}

$addonFiles = @()
if (Test-Path -LiteralPath $SourceNativeDir -PathType Container) {
    $addonFiles = @(Get-ChildItem -LiteralPath $SourceNativeDir -Filter "*.node" -File -Recurse)
}
if ($addonFiles.Count -eq 0) {
    $blockers += "No .node addon files found under SourceNativeDir."
}
$facts.addon_files = @($addonFiles | ForEach-Object { $_.FullName })

if ($ProtoFile -and -not (Test-Path -LiteralPath $ProtoFile -PathType Leaf)) {
    $blockers += "ProtoFile does not exist: $ProtoFile"
}
if ($NativeExportsFile -and -not (Test-Path -LiteralPath $NativeExportsFile -PathType Leaf)) {
    $blockers += "NativeExportsFile does not exist: $NativeExportsFile"
}

if ($blockers.Count -gt 0) {
    Write-Result -Status "blocked" -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints
}

if (-not $DryRun) {
    if (-not (Test-Path -LiteralPath $runtimeFull -PathType Container)) {
        New-Item -ItemType Directory -Path $runtimeFull | Out-Null
    }
    if (-not (Test-Path -LiteralPath $runtimeNative -PathType Container)) {
        New-Item -ItemType Directory -Path $runtimeNative | Out-Null
    }
}

foreach ($addon in $addonFiles) {
    $nativeTarget = Join-Path $runtimeNative $addon.Name
    $rootTarget = Join-Path $runtimeFull $addon.Name
    if (-not $DryRun) {
        Copy-Item -LiteralPath $addon.FullName -Destination $nativeTarget -Force
        if ($CopyAddonToRoot -or (Test-Path -LiteralPath $rootTarget -PathType Leaf)) {
            Copy-Item -LiteralPath $addon.FullName -Destination $rootTarget -Force
        }
    }
    $facts.copied_files += $nativeTarget
    $facts.hashes += [PSCustomObject][ordered]@{
        source = $addon.FullName
        target = $nativeTarget
        source_sha256 = Get-HashOrNull $addon.FullName
        target_sha256 = if ($DryRun) { $null } else { Get-HashOrNull $nativeTarget }
    }
    if ($CopyAddonToRoot -or (Test-Path -LiteralPath $rootTarget -PathType Leaf)) {
        $facts.copied_files += $rootTarget
    }
}

foreach ($metadataFile in @($ProtoFile, $NativeExportsFile)) {
    if ([string]::IsNullOrWhiteSpace($metadataFile)) { continue }
    $target = Join-Path $runtimeFull (Split-Path -Leaf $metadataFile)
    if (-not $DryRun) {
        Copy-Item -LiteralPath $metadataFile -Destination $target -Force
    }
    $facts.copied_files += $target
    $facts.hashes += [PSCustomObject][ordered]@{
        source = (Get-NormalizedPath $metadataFile)
        target = $target
        source_sha256 = Get-HashOrNull $metadataFile
        target_sha256 = if ($DryRun) { $null } else { Get-HashOrNull $target }
    }
}

$duplicateProtoFiles = @()
if (Test-Path -LiteralPath $runtimeNative -PathType Container) {
    $duplicateProtoFiles = @(Get-ChildItem -LiteralPath $runtimeNative -Filter "*.proto" -File -ErrorAction SilentlyContinue)
}
$facts.duplicate_native_proto_files = @($duplicateProtoFiles | ForEach-Object { $_.FullName })
if ($duplicateProtoFiles.Count -gt 0) {
    if ($RemoveDuplicateProto -and -not $DryRun) {
        foreach ($duplicate in $duplicateProtoFiles) {
            Remove-Item -LiteralPath $duplicate.FullName -Force
        }
        $facts.duplicate_native_proto_files = @()
        $hints += "Removed duplicate proto files from runtime native/."
    } elseif ($RemoveDuplicateProto -and $DryRun) {
        $hints += "DryRun would remove duplicate proto files from runtime native/."
    } else {
        $blockers += "Duplicate proto files found under runtime native/: " + (($duplicateProtoFiles | ForEach-Object { $_.FullName }) -join ", ")
    }
}

$status = if ($blockers.Count -eq 0) { "ok" } else { "blocked" }
Write-Result -Status $status -Facts $facts -Blockers $blockers -Unknowns $unknowns -Hints $hints
