param(
    [string]$RepoRoot = "",
    [string]$PackId = "",
    [switch]$Force,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

function Write-EmptyKnowledgePackLocks {
    param([string]$Root)

    $knowledgeDir = Join-Path $Root ".specify\knowledge"
    $capabilitiesDir = Join-Path $Root ".specify\capabilities"
    New-Item -ItemType Directory -Force -Path $knowledgeDir | Out-Null
    New-Item -ItemType Directory -Force -Path $capabilitiesDir | Out-Null

    $knowledgeLockPath = Join-Path $knowledgeDir "lock.yml"
    @(
        'schema_version: "1.0"',
        'generated_by: "uninstall-knowledge-pack"',
        'materialized: "ai/knowledge"',
        'base: ".specify/knowledge/base/ai/knowledge"',
        "packs:",
        "aliases_applied:",
        "  {}"
    ) | Set-Content -LiteralPath $knowledgeLockPath -Encoding utf8

    $capabilityLockPath = Join-Path $capabilitiesDir "lock.yml"
    @(
        'schema_version: "1.0"',
        'generated_by: "uninstall-knowledge-pack"',
        'materialized: ".specify/capabilities/materialized"',
        'auto_run_scripts: false',
        "packs:",
        "published:",
        "  []"
    ) | Set-Content -LiteralPath $capabilityLockPath -Encoding utf8

    return [ordered]@{
        knowledge_lock = $knowledgeLockPath
        capability_lock = $capabilityLockPath
    }
}

$result = New-KnowledgePackResult "uninstall-knowledge-pack"

try {
    $root = Resolve-KnowledgePackPath -Path $RepoRoot
    if ([string]::IsNullOrWhiteSpace($root)) { $root = (Get-Location).Path }
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
        Set-KnowledgePackBlocked $result "RepoRoot not found: $root"
    }

    if ($result.status -ne "blocked" -and [string]::IsNullOrWhiteSpace($PackId)) {
        Set-KnowledgePackBlocked $result "PackId is required"
    }

    $slug = ConvertTo-KnowledgePackSlug -Value $PackId
    $knowledgeRoot = Join-Path $root ".specify\knowledge"
    $packsRoot = Join-Path $knowledgeRoot "packs"
    $installedPackRoot = Join-Path $packsRoot $slug
    $lockPath = Join-Path $knowledgeRoot "lock.yml"
    $activeBefore = @()
    if ($result.status -ne "blocked") {
        $activeBefore = @(Get-KnowledgePackLockPackIds -LockPath $lockPath)
        if (-not (Test-Path -LiteralPath $installedPackRoot -PathType Container) -and -not $Force) {
            Set-KnowledgePackBlocked $result "Installed pack not found: $slug"
        }
    }

    if ($result.status -ne "blocked") {
        if (Test-Path -LiteralPath $installedPackRoot -PathType Container) {
            Remove-KnowledgePackDirectorySafe -Root $packsRoot -Path $installedPackRoot
        }
        $removedPublishedCapabilities = @(Remove-KnowledgePackPublishedArtifactsForPackId -RepoRoot $root -PackId $slug)

        $installedAfter = @()
        if (Test-Path -LiteralPath $packsRoot -PathType Container) {
            $installedAfter = @(Get-ChildItem -LiteralPath $packsRoot -Directory | Where-Object {
                Test-Path -LiteralPath (Get-KnowledgePackManifestPath -PackRoot $_.FullName) -PathType Leaf
            } | ForEach-Object { ConvertTo-KnowledgePackSlug -Value $_.Name })
        }

        if ($activeBefore.Count -gt 0) {
            $remainingActive = @($activeBefore | Where-Object { $_ -ne $slug -and $installedAfter -contains $_ })
        } else {
            $remainingActive = @($installedAfter | Where-Object { $_ -ne $slug })
        }

        $compose = $null
        $validation = $null
        $restoredBase = $false
        $backupRoot = ""
        $emptyLocks = $null

        if ($remainingActive.Count -gt 0) {
            $composeRaw = & "$PSScriptRoot\compose-knowledge-packs.ps1" -RepoRoot $root -PackId $remainingActive -Json
            $compose = $composeRaw | ConvertFrom-Json
            if ($compose.status -eq "blocked") {
                Set-KnowledgePackBlocked $result ("compose failed after uninstall: " + (($compose.blockers) -join "; "))
            } else {
                $validationRaw = & "$PSScriptRoot\automation-common.ps1" -Tool "validate-knowledge-index" -RepoRoot $root -Json
                $validation = $validationRaw | ConvertFrom-Json
                if ($validation.status -eq "blocked") {
                    Set-KnowledgePackBlocked $result ("materialized knowledge failed validation after uninstall: " + (($validation.blockers) -join "; "))
                }
            }
        } else {
            $activeKnowledge = Join-Path $root "ai\knowledge"
            $baseRoot = Join-Path $knowledgeRoot "base\ai\knowledge"
            $backupRoot = Join-Path $root (".specify\knowledge\backups\" + (Get-Date -Format "yyyyMMdd-HHmmss") + "\ai\knowledge")
            if (Test-Path -LiteralPath $activeKnowledge -PathType Container) {
                Copy-KnowledgePackDirectory -Source $activeKnowledge -Destination $backupRoot
                Remove-KnowledgePackDirectorySafe -Root (Join-Path $root "ai") -Path $activeKnowledge
            }
            if (Test-Path -LiteralPath $baseRoot -PathType Container) {
                Copy-KnowledgePackDirectory -Source $baseRoot -Destination $activeKnowledge
                $restoredBase = $true
                $validationRaw = & "$PSScriptRoot\automation-common.ps1" -Tool "validate-knowledge-index" -RepoRoot $root -Json
                $validation = $validationRaw | ConvertFrom-Json
                if ($validation.status -eq "blocked") {
                    Set-KnowledgePackBlocked $result ("base knowledge failed validation after uninstall: " + (($validation.blockers) -join "; "))
                }
            } else {
                $result.hints += "No base knowledge snapshot exists; ai/knowledge was removed because no packs remain active."
            }

            Remove-KnowledgePackDirectorySafe -Root $knowledgeRoot -Path (Join-Path $knowledgeRoot "materialized")
            $capabilitiesRoot = Join-Path $root ".specify\capabilities"
            Remove-KnowledgePackDirectorySafe -Root $capabilitiesRoot -Path (Join-Path $capabilitiesRoot "materialized")
            $emptyLocks = Write-EmptyKnowledgePackLocks -Root $root
        }

        $result.facts.repo_root = $root
        $result.facts.pack_id = $slug
        $result.facts.removed_installed_path = $installedPackRoot
        $result.facts.removed_published_capabilities = $removedPublishedCapabilities
        $result.facts.active_before = $activeBefore
        $result.facts.remaining_active = $remainingActive
        $result.facts.installed_after = $installedAfter
        $result.facts.compose = $compose
        $result.facts.validation = $validation
        $result.facts.restored_base_knowledge = $restoredBase
        $result.facts.backup_dir = $backupRoot
        $result.facts.empty_locks = $emptyLocks
    }
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
}

if ($Json) { Write-KnowledgePackJson $result } else { $result }
