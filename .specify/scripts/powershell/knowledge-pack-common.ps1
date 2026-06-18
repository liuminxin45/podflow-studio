$ErrorActionPreference = "Stop"

function New-KnowledgePackResult {
    param([string]$Name)
    [ordered]@{
        tool = $Name
        status = "ok"
        facts = [ordered]@{}
        blockers = @()
        unknowns = @()
        hints = @()
    }
}

function Set-KnowledgePackBlocked {
    param($Result, [string]$Message)
    $Result.status = "blocked"
    $Result.blockers += $Message
}

function Write-KnowledgePackJson {
    param($Result)
    $Result | ConvertTo-Json -Depth 12 -Compress
}

function Resolve-KnowledgePackPath {
    param(
        [string]$Path,
        [string]$Base = (Get-Location).Path
    )
    if ([string]::IsNullOrWhiteSpace($Path)) { return "" }
    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $Base $Path))
}

function ConvertTo-KnowledgePackSlug {
    param([string]$Value)
    $slug = ($Value.ToLowerInvariant() -replace "[^a-z0-9]+", "-").Trim("-")
    if ([string]::IsNullOrWhiteSpace($slug)) { return "knowledge-pack" }
    return $slug
}

function Get-KnowledgePackManifestValue {
    param(
        [string]$ManifestPath,
        [string]$Key
    )
    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { return "" }
    $text = Get-Content -LiteralPath $ManifestPath -Raw
    $pattern = '(?m)^\s*' + [regex]::Escape($Key) + ':\s*[''"]?(.+?)[''"]?\s*$'
    $match = [regex]::Match($text, $pattern)
    if (-not $match.Success) { return "" }
    return $match.Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Get-KnowledgePackManifestPath {
    param([string]$PackRoot)
    $packManifest = Join-Path $PackRoot "pack.yml"
    if (Test-Path -LiteralPath $packManifest -PathType Leaf) {
        return $packManifest
    }
    return (Join-Path $PackRoot "knowledge-pack.yml")
}

function Get-KnowledgePackInfo {
    param([string]$PackRoot)
    $manifest = Get-KnowledgePackManifestPath -PackRoot $PackRoot
    [ordered]@{
        root = $PackRoot
        manifest = $manifest
        id = Get-KnowledgePackManifestValue -ManifestPath $manifest -Key "id"
        title = Get-KnowledgePackManifestValue -ManifestPath $manifest -Key "title"
        version = Get-KnowledgePackManifestValue -ManifestPath $manifest -Key "version"
        kind = Get-KnowledgePackManifestValue -ManifestPath $manifest -Key "kind"
    }
}

function Get-KnowledgePackComposeStrategy {
    param([string]$PackRoot)
    $manifest = Get-KnowledgePackManifestPath -PackRoot $PackRoot
    if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
        return "overlay-active-knowledge"
    }

    $inCompose = $false
    foreach ($line in Get-Content -LiteralPath $manifest) {
        if ($line -match "^\s*compose:\s*$") {
            $inCompose = $true
            continue
        }
        if ($inCompose -and $line -match "^\s{2}strategy:\s*['""]?(.+?)['""]?\s*$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
        if ($inCompose -and $line -match "^\S") {
            break
        }
    }
    return "overlay-active-knowledge"
}

function Get-KnowledgePackLockPackIds {
    param([string]$LockPath)
    $ids = @()
    if (-not (Test-Path -LiteralPath $LockPath -PathType Leaf)) { return $ids }

    $inPacks = $false
    foreach ($line in Get-Content -LiteralPath $LockPath) {
        if ($line -match "^\s*packs:\s*$") {
            $inPacks = $true
            continue
        }
        if (-not $inPacks) { continue }
        if ($line -match "^\s*-\s+id:\s*['""]?(.+?)['""]?\s*$") {
            $ids += (ConvertTo-KnowledgePackSlug -Value $Matches[1].Trim().Trim('"').Trim("'"))
            continue
        }
        if ($line -match "^\S" -and $line -notmatch "^\s*packs:\s*$") {
            break
        }
    }
    return $ids
}

function Get-KnowledgePackCapabilityLayers {
    param([string]$PackRoot)
    $layers = [ordered]@{}
    foreach ($name in @("skills", "tools", "scripts", "commands", "prompts", "resources", "templates")) {
        $path = Join-Path $PackRoot $name
        $layers[$name] = [ordered]@{
            present = (Test-Path -LiteralPath $path -PathType Container)
            path = $path
        }
    }
    return $layers
}

function Test-KnowledgePackSafeRelativePath {
    param([string]$RelativePath)
    if ([string]::IsNullOrWhiteSpace($RelativePath)) { return $false }
    if ([System.IO.Path]::IsPathRooted($RelativePath)) { return $false }
    $normalized = $RelativePath.Replace('\', '/')
    if ($normalized -match '(^|/)\.\.($|/)') { return $false }
    if ($normalized -match '^[A-Za-z]:') { return $false }
    return $true
}

function Get-KnowledgePackFileHash {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return "" }
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Copy-KnowledgePackLayerIfPresent {
    param(
        [string]$Source,
        [string]$Destination
    )
    if ([string]::IsNullOrWhiteSpace($Source)) { return $false }
    if (-not (Test-Path -LiteralPath $Source -PathType Container)) { return $false }
    Copy-KnowledgePackDirectory -Source $Source -Destination $Destination
    return $true
}

function Write-KnowledgePackCapabilityIndex {
    param(
        [string]$PackRoot,
        $Layers,
        [string]$PackId,
        [string]$Version,
        [string]$RepackMode = ""
    )

    $capabilityDir = Join-Path $PackRoot "capabilities"
    New-Item -ItemType Directory -Force -Path $capabilityDir | Out-Null
    $lines = @(
        'schema_version: "1.0"',
        "pack_id: `"$PackId`"",
        "version: `"$Version`"",
        'progressive_disclosure: true',
        'default_context: false',
        'auto_run_scripts: false',
        "layers:"
    )
    foreach ($name in @("knowledge", "skills", "tools", "scripts", "commands", "prompts", "resources", "templates")) {
        $present = $false
        if ($Layers.Contains($name)) { $present = [bool]$Layers[$name] }
        $path = if ($name -eq "knowledge") { "ai/knowledge" } else { $name }
        $lines += "  ${name}:"
        $lines += "    present: $($present.ToString().ToLowerInvariant())"
        $lines += "    path: `"$path`""
    }
    if (-not [string]::IsNullOrWhiteSpace($RepackMode)) {
        $lines += "repack:"
        $lines += "  mode: `"$RepackMode`""
    }
    $lines | Set-Content -LiteralPath (Join-Path $capabilityDir "index.yml") -Encoding utf8
}

function Copy-KnowledgePackDirectory {
    param(
        [string]$Source,
        [string]$Destination
    )
    if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
        throw "Source directory not found: $Source"
    }
    if (Test-KnowledgePackChildPath -Root $Source -Path $Destination) {
        throw "Refusing to copy a directory into itself. Source: $Source Destination: $Destination"
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
        Copy-Item -LiteralPath $item.FullName -Destination $Destination -Recurse -Force
    }
}

function Test-KnowledgePackChildPath {
    param(
        [string]$Root,
        [string]$Path
    )
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $pathFull = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    $comparison = [System.StringComparison]::OrdinalIgnoreCase
    return ($pathFull.Equals($rootFull, $comparison) -or $pathFull.StartsWith($rootFull + [System.IO.Path]::DirectorySeparatorChar, $comparison))
}

function Remove-KnowledgePackDirectorySafe {
    param(
        [string]$Root,
        [string]$Path
    )
    if (-not (Test-Path -LiteralPath $Path)) { return }
    if (-not (Test-KnowledgePackChildPath -Root $Root -Path $Path)) {
        throw "Refusing to remove path outside root. Root: $Root Path: $Path"
    }
    Remove-Item -LiteralPath $Path -Recurse -Force
}

function Remove-KnowledgePackPublishedArtifactsForPackId {
    param(
        [string]$RepoRoot,
        [string]$PackId
    )

    $root = Resolve-KnowledgePackPath -Path $RepoRoot
    $slug = ConvertTo-KnowledgePackSlug -Value $PackId
    $removed = @()

    $skillsRoot = Join-Path $root ".agents\spec-kit\skills"
    if (Test-Path -LiteralPath $skillsRoot -PathType Container) {
        foreach ($skillDir in Get-ChildItem -LiteralPath $skillsRoot -Directory -Force -Filter "${slug}__*") {
            Remove-KnowledgePackDirectorySafe -Root $skillsRoot -Path $skillDir.FullName
            $removed += ".agents/spec-kit/skills/$($skillDir.Name)"
        }
    }

    $targets = [ordered]@{
        tools = "ai\tools\$slug"
        scripts = ".specify\scripts\packs\$slug"
        commands = ".specify\capabilities\commands\$slug"
        prompts = ".specify\capabilities\prompts\$slug"
        resources = ".specify\capabilities\resources\$slug"
        templates = ".specify\capabilities\templates\$slug"
    }

    foreach ($layerName in $targets.Keys) {
        $relative = $targets[$layerName]
        $target = Join-Path $root $relative
        if (-not (Test-Path -LiteralPath $target)) { continue }
        $targetRoot = Split-Path -Parent $target
        Remove-KnowledgePackDirectorySafe -Root $targetRoot -Path $target
        $removed += $relative.Replace('\', '/')
    }

    return $removed
}

function Get-KnowledgePackIndexEntries {
    param([string]$IndexPath)
    if (-not (Test-Path -LiteralPath $IndexPath -PathType Leaf)) { return @() }

    $entrySections = @("workspace", "repositories", "domains", "build")
    $entries = @()
    $section = ""
    $current = $null

    foreach ($line in Get-Content -LiteralPath $IndexPath) {
        if ($line -match "^([A-Za-z0-9_-]+):\s*$") {
            if ($current) {
                $entries += [PSCustomObject]$current
                $current = $null
            }
            $section = $Matches[1]
            continue
        }

        if ($entrySections -contains $section -and $line -match "^\s{2}([A-Za-z0-9_-]+):\s*$") {
            if ($current) { $entries += [PSCustomObject]$current }
            $current = [ordered]@{
                category = $section
                key = $Matches[1]
                guide = ""
                authority = ""
            }
            continue
        }

        if (-not $current) { continue }
        if ($line -match "^\s{4}guide:\s*['""]?(.+?)['""]?\s*$") {
            $current.guide = $Matches[1].Trim().Trim('"').Trim("'")
            continue
        }
        if ($line -match "^\s{4}authority:\s*['""]?(.+?)['""]?\s*$") {
            $current.authority = $Matches[1].Trim().Trim('"').Trim("'")
            continue
        }
    }
    if ($current) { $entries += [PSCustomObject]$current }
    return $entries
}

function Resolve-KnowledgePackGuidePath {
    param(
        [string]$IndexPath,
        [string]$Guide
    )
    if ([System.IO.Path]::IsPathRooted($Guide)) { return $Guide }
    if (($Guide -replace "\\", "/").StartsWith("ai/knowledge/")) {
        $packRoot = Split-Path (Split-Path (Split-Path $IndexPath -Parent) -Parent) -Parent
        return Join-Path $packRoot $Guide
    }
    return Join-Path (Split-Path $IndexPath -Parent) $Guide
}

function Get-KnowledgePackDisplayPath {
    param([string]$Guide)
    $normalized = $Guide -replace "\\", "/"
    if ($normalized.StartsWith("ai/knowledge/")) { return $normalized }
    return "ai/knowledge/$normalized"
}

function Read-KnowledgeToolAliases {
    param([string]$PackRoot)
    $path = Join-Path $PackRoot "aliases\tools.yml"
    $aliases = [ordered]@{}
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $aliases }

    $inAliases = $false
    foreach ($line in Get-Content -LiteralPath $path) {
        if ($line -match "^\s*aliases:\s*$") {
            $inAliases = $true
            continue
        }
        if (-not $inAliases) { continue }
        if ($line -match "^\s{2}([^:#]+):\s*['""]?(.+?)['""]?\s*$") {
            $from = $Matches[1].Trim().Trim('"').Trim("'")
            $to = $Matches[2].Trim().Trim('"').Trim("'")
            if ($from -and $to) { $aliases[$from] = $to }
            continue
        }
        if ($line -match "^\S") { $inAliases = $false }
    }
    return $aliases
}

function Get-KnowledgePackEvaluationScenarios {
    param(
        [string]$PackRoot,
        [string]$ScenarioFile = ""
    )
    $path = $ScenarioFile
    if ([string]::IsNullOrWhiteSpace($path)) {
        $path = Join-Path $PackRoot "evaluation\scenarios.json"
    }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        return @()
    }

    $payload = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($payload -is [System.Array]) {
        return @($payload)
    }
    if ($payload.PSObject.Properties.Name -contains "scenarios") {
        return @($payload.scenarios)
    }
    throw "Evaluation scenarios must be a JSON array or an object with a scenarios array: $path"
}

function Apply-KnowledgeToolAliases {
    param(
        [string]$Root,
        [hashtable]$Aliases
    )
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return @() }
    $changed = @()
    if (-not $Aliases -or $Aliases.Count -eq 0) { return $changed }

    $files = Get-ChildItem -LiteralPath $Root -Recurse -File -Include "*.md", "*.yml", "*.yaml", "*.json" -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        $text = Get-Content -LiteralPath $file.FullName -Raw
        $updated = $text
        foreach ($key in $Aliases.Keys) {
            $updated = $updated.Replace([string]$key, [string]$Aliases[$key])
        }
        if ($updated -ne $text) {
            Set-Content -LiteralPath $file.FullName -Value $updated -Encoding utf8
            $changed += $file.FullName
        }
    }
    return $changed
}
