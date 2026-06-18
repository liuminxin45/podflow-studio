param(
    [string]$RepoRoot = "",
    [string]$PackId = "",
    [string]$PackPath = "",
    [switch]$ApplyProfiles,
    [switch]$Force,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

$result = New-KnowledgePackResult "apply-knowledge-pack"

try {
    $root = Resolve-KnowledgePackPath -Path $RepoRoot
    if ([string]::IsNullOrWhiteSpace($root)) { $root = (Get-Location).Path }
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
        Set-KnowledgePackBlocked $result "RepoRoot not found: $root"
    }

    $install = $null
    if ($result.status -ne "blocked" -and -not [string]::IsNullOrWhiteSpace($PackPath)) {
        $packRoot = Resolve-KnowledgePackPath -Path $PackPath
        $info = Get-KnowledgePackInfo -PackRoot $packRoot
        if ([string]::IsNullOrWhiteSpace($PackId)) { $PackId = $info.id }
        $installRaw = & "$PSScriptRoot\install-knowledge-pack.ps1" -RepoRoot $root -PackPath $packRoot -Force:$Force -Json
        $install = $installRaw | ConvertFrom-Json
        if ($install.status -eq "blocked") {
            Set-KnowledgePackBlocked $result ("install failed: " + (($install.blockers) -join "; "))
        }
    }

    if ($result.status -ne "blocked" -and [string]::IsNullOrWhiteSpace($PackId)) {
        Set-KnowledgePackBlocked $result "PackId is required when PackPath is not supplied"
    }

    $profilesApplied = @()
    if ($result.status -ne "blocked" -and $ApplyProfiles) {
        $slug = ConvertTo-KnowledgePackSlug -Value $PackId
        $installedPackRoot = Join-Path $root ".specify\knowledge\packs\$slug"
        $profilesRoot = Join-Path $installedPackRoot "profiles"
        if (-not (Test-Path -LiteralPath $profilesRoot -PathType Container)) {
            $result.unknowns += "Pack has no profiles directory: $slug"
        } else {
            $backupRoot = Join-Path $root (".specify\knowledge\backups\" + (Get-Date -Format "yyyyMMdd-HHmmss") + "\profiles")
            $profilePairs = @(
                @{ source = "workspace.yml"; target = ".specify\workspace.yml" },
                @{ source = "repository-map.md"; target = ".specify\memory\repository-map.md" }
            )
            foreach ($pair in $profilePairs) {
                $src = Join-Path $profilesRoot $pair.source
                if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { continue }
                $dst = Join-Path $root $pair.target
                if ((Test-Path -LiteralPath $dst -PathType Leaf) -and -not $Force) {
                    Set-KnowledgePackBlocked $result "Profile target exists; pass -Force to replace: $($pair.target)"
                    break
                }
                if (Test-Path -LiteralPath $dst -PathType Leaf) {
                    $backupDst = Join-Path $backupRoot $pair.target
                    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupDst) | Out-Null
                    Copy-Item -LiteralPath $dst -Destination $backupDst -Force
                }
                New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
                Copy-Item -LiteralPath $src -Destination $dst -Force
                $profilesApplied += $pair.target
            }
        }
    }

    $compose = $null
    $validation = $null
    if ($result.status -ne "blocked") {
        $composeRaw = & "$PSScriptRoot\compose-knowledge-packs.ps1" -RepoRoot $root -PackId (ConvertTo-KnowledgePackSlug -Value $PackId) -Json
        $compose = $composeRaw | ConvertFrom-Json
        if ($compose.status -eq "blocked") {
            Set-KnowledgePackBlocked $result ("compose failed: " + (($compose.blockers) -join "; "))
        } else {
            $validationRaw = & "$PSScriptRoot\automation-common.ps1" -Tool "validate-knowledge-index" -RepoRoot $root -Json
            $validation = $validationRaw | ConvertFrom-Json
            if ($validation.status -eq "blocked") {
                Set-KnowledgePackBlocked $result ("materialized knowledge failed validation: " + (($validation.blockers) -join "; "))
            }
        }
    }

    $result.facts.repo_root = $root
    $result.facts.pack_id = if ($PackId) { ConvertTo-KnowledgePackSlug -Value $PackId } else { "" }
    $result.facts.install = $install
    $result.facts.profiles_applied = $profilesApplied
    $result.facts.compose = $compose
    $result.facts.validation = $validation
    if ($result.status -eq "ok") {
        $result.hints += "Knowledge pack is active in ai/knowledge and will be selected by the existing select-knowledge tool."
    }
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
}

if ($Json) { Write-KnowledgePackJson $result } else { $result }
