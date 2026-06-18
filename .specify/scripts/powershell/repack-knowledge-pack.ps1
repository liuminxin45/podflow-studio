param(
    [string]$RepoRoot = "",
    [string]$PackId = "",
    [string]$Title = "",
    [string]$Version = "0.1.0",
    [string]$OutputDir = "",
    [ValidateSet("full-snapshot", "delta-overlay", "promote-reviewed")]
    [string]$Mode = "full-snapshot",
    [ValidateSet("overlay-active-knowledge", "replace-active-knowledge")]
    [string]$ComposeStrategy = "overlay-active-knowledge",
    [bool]$IncludeCapabilities = $true,
    [switch]$IncludeProfiles,
    [switch]$Force,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

$result = New-KnowledgePackResult "repack-knowledge-pack"

function Copy-RepackItemToStage {
    param(
        [string]$SourcePath,
        [string]$DestinationRoot
    )
    if (-not (Test-Path -LiteralPath $SourcePath)) { return $false }
    New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null
    $destination = Join-Path $DestinationRoot (Split-Path -Leaf $SourcePath)
    if (Test-Path -LiteralPath $destination) {
        Remove-KnowledgePackDirectorySafe -Root $DestinationRoot -Path $destination
    }
    if (Test-Path -LiteralPath $SourcePath -PathType Container) {
        Copy-KnowledgePackDirectory -Source $SourcePath -Destination $destination
    } else {
        Copy-Item -LiteralPath $SourcePath -Destination $destination -Force
    }
    return $true
}

function Copy-RepackChildrenToStage {
    param(
        [string]$Root,
        [string]$RelativePath,
        [string]$DestinationRoot,
        [string]$DirectoryNamePattern = "*",
        [switch]$DirectoriesOnly
    )
    $sourceRoot = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) { return @() }
    $items = if ($DirectoriesOnly) {
        @(Get-ChildItem -LiteralPath $sourceRoot -Directory -Force -Filter $DirectoryNamePattern)
    } else {
        @(Get-ChildItem -LiteralPath $sourceRoot -Force | Where-Object {
            $_.PSIsContainer -or -not $DirectoriesOnly
        })
    }
    $copied = @()
    foreach ($item in $items) {
        if (Copy-RepackItemToStage -SourcePath $item.FullName -DestinationRoot $DestinationRoot) {
            $copied += $item.FullName
        }
    }
    return $copied
}

try {
    $root = Resolve-KnowledgePackPath -Path $RepoRoot
    if ([string]::IsNullOrWhiteSpace($root)) { $root = (Get-Location).Path }
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
        Set-KnowledgePackBlocked $result "RepoRoot not found: $root"
    }

    if ([string]::IsNullOrWhiteSpace($PackId)) {
        $PackId = ConvertTo-KnowledgePackSlug -Value ((Split-Path -Leaf $root) + "-capability-pack")
    } else {
        $PackId = ConvertTo-KnowledgePackSlug -Value $PackId
    }
    if ([string]::IsNullOrWhiteSpace($Title)) { $Title = $PackId }
    if ([string]::IsNullOrWhiteSpace($OutputDir)) {
        $OutputDir = Join-Path $root ".specify\knowledge\exports\$PackId"
    }

    $activeKnowledge = Join-Path $root "ai\knowledge"
    if ($result.status -ne "blocked" -and -not (Test-Path -LiteralPath (Join-Path $activeKnowledge "index.yml") -PathType Leaf)) {
        Set-KnowledgePackBlocked $result "Active ai/knowledge/index.yml not found; apply or bootstrap knowledge before repack."
    }

    $workspaceFile = ""
    $repositoryMap = ""
    if ($IncludeProfiles) {
        $candidateWorkspace = Join-Path $root ".specify\workspace.yml"
        $candidateMap = Join-Path $root ".specify\memory\repository-map.md"
        if (Test-Path -LiteralPath $candidateWorkspace -PathType Leaf) { $workspaceFile = $candidateWorkspace }
        if (Test-Path -LiteralPath $candidateMap -PathType Leaf) { $repositoryMap = $candidateMap }
    }

    $capabilityArgs = @{}
    $capabilitySourceSummary = [ordered]@{}
    $capabilityStagingRoot = ""
    if ($IncludeCapabilities) {
        $capabilityStagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("speckit-repack-capabilities-" + [guid]::NewGuid().ToString("N"))
        $layerSpecs = @(
            @{ key = "SkillsDir"; name = "skills"; published = @(@{ path = ".agents\spec-kit\skills"; pattern = "*__*"; dirsOnly = $true }); overlays = @(".specify\capabilities\overlays\local\skills") },
            @{ key = "ToolsDir"; name = "tools"; published = @(@{ path = "ai\tools"; pattern = "*"; dirsOnly = $true }); overlays = @(".specify\capabilities\overlays\local\tools") },
            @{ key = "ScriptsDir"; name = "scripts"; published = @(@{ path = ".specify\scripts\packs"; pattern = "*"; dirsOnly = $true }); overlays = @(".specify\capabilities\overlays\local\scripts") },
            @{ key = "CommandsDir"; name = "commands"; published = @(@{ path = ".specify\capabilities\commands"; pattern = "*"; dirsOnly = $true }); overlays = @(".specify\capabilities\overlays\local\commands") },
            @{ key = "PromptsDir"; name = "prompts"; published = @(@{ path = ".specify\capabilities\prompts"; pattern = "*"; dirsOnly = $true }); overlays = @(".specify\capabilities\overlays\local\prompts") },
            @{ key = "ResourcesDir"; name = "resources"; published = @(@{ path = ".specify\capabilities\resources"; pattern = "*"; dirsOnly = $true }); overlays = @(".specify\capabilities\overlays\local\resources") },
            @{ key = "TemplatesDir"; name = "templates"; published = @(@{ path = ".specify\capabilities\templates"; pattern = "*"; dirsOnly = $true }); overlays = @(".specify\capabilities\overlays\local\templates") }
        )
        foreach ($spec in $layerSpecs) {
            $stage = Join-Path $capabilityStagingRoot $spec.name
            $copied = @()
            foreach ($published in $spec.published) {
                $copied += @(Copy-RepackChildrenToStage -Root $root -RelativePath $published.path -DestinationRoot $stage -DirectoryNamePattern $published.pattern -DirectoriesOnly:([bool]$published.dirsOnly))
            }
            foreach ($overlay in $spec.overlays) {
                $copied += @(Copy-RepackChildrenToStage -Root $root -RelativePath $overlay -DestinationRoot $stage)
            }
            if (Test-Path -LiteralPath $stage -PathType Container) {
                $capabilityArgs[$spec.key] = $stage
                $capabilitySourceSummary[$spec.name] = @($copied | ForEach-Object {
                    try {
                        [System.IO.Path]::GetRelativePath($root, $_).Replace('\', '/')
                    } catch {
                        $_
                    }
                })
            }
        }
    }

    if ($result.status -ne "blocked") {
        $exportParams = @{
            SourceKnowledgeDir = $activeKnowledge
            PackId = $PackId
            Title = $Title
            Version = $Version
            OutputDir = (Resolve-KnowledgePackPath -Path $OutputDir)
            ComposeStrategy = $ComposeStrategy
            RepackMode = $Mode
            Json = $true
        }
        if ($Force) { $exportParams.Force = $true }
        if (-not [string]::IsNullOrWhiteSpace($workspaceFile)) { $exportParams.WorkspaceFile = $workspaceFile }
        if (-not [string]::IsNullOrWhiteSpace($repositoryMap)) { $exportParams.RepositoryMap = $repositoryMap }
        foreach ($key in @("SkillsDir", "ToolsDir", "ScriptsDir", "CommandsDir", "PromptsDir", "ResourcesDir", "TemplatesDir")) {
            if ($capabilityArgs.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($capabilityArgs[$key])) {
                $exportParams[$key] = $capabilityArgs[$key]
            }
        }
        $exportRaw = & "$PSScriptRoot\export-knowledge-pack.ps1" @exportParams
        $export = $exportRaw | ConvertFrom-Json
        if ($export.status -eq "blocked") {
            Set-KnowledgePackBlocked $result ("export failed: " + (($export.blockers) -join "; "))
        }

        $result.facts.repo_root = $root
        $result.facts.mode = $Mode
        $result.facts.pack_id = $PackId
        $result.facts.include_capabilities = $IncludeCapabilities
        $result.facts.capability_sources = $capabilitySourceSummary
        $result.facts.export = $export
        if ($export.status -eq "ok") {
            $result.facts.pack_root = $export.facts.pack_root
            $result.hints += "Repacked capability pack is ready for validate-knowledge-pack.ps1 and apply-knowledge-pack.ps1."
        }
    }
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
} finally {
    if (-not [string]::IsNullOrWhiteSpace($capabilityStagingRoot) -and (Test-Path -LiteralPath $capabilityStagingRoot)) {
        Remove-KnowledgePackDirectorySafe -Root (Split-Path -Parent $capabilityStagingRoot) -Path $capabilityStagingRoot
    }
}

if ($Json) { Write-KnowledgePackJson $result } else { $result }
