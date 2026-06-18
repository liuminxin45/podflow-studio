param(
    [string]$RepoRoot = "",
    [string]$PackPath = "",
    [string]$PackId = "",
    [switch]$Force,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

$result = New-KnowledgePackResult "update-knowledge-pack"

try {
    $root = Resolve-KnowledgePackPath -Path $RepoRoot
    if ([string]::IsNullOrWhiteSpace($root)) { $root = (Get-Location).Path }
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
        Set-KnowledgePackBlocked $result "RepoRoot not found: $root"
    }

    $packRoot = Resolve-KnowledgePackPath -Path $PackPath
    if ($result.status -ne "blocked") {
        if ([string]::IsNullOrWhiteSpace($packRoot)) {
            Set-KnowledgePackBlocked $result "PackPath is required"
        } elseif (-not (Test-Path -LiteralPath $packRoot -PathType Container)) {
            Set-KnowledgePackBlocked $result "PackPath not found: $packRoot"
        }
    }

    if ($result.status -ne "blocked") {
        $info = Get-KnowledgePackInfo -PackRoot $packRoot
        $incomingPackId = ConvertTo-KnowledgePackSlug -Value $info.id
        if ([string]::IsNullOrWhiteSpace($info.id)) {
            Set-KnowledgePackBlocked $result "Pack manifest id is required"
        } elseif (-not [string]::IsNullOrWhiteSpace($PackId) -and (ConvertTo-KnowledgePackSlug -Value $PackId) -ne $incomingPackId) {
            Set-KnowledgePackBlocked $result "PackId '$PackId' does not match incoming pack id '$incomingPackId'"
        }
    }

    if ($result.status -ne "blocked") {
        $knowledgeRoot = Join-Path $root ".specify\knowledge"
        $packsRoot = Join-Path $knowledgeRoot "packs"
        $installedPackRoot = Join-Path $packsRoot $incomingPackId
        $wasInstalled = Test-Path -LiteralPath $installedPackRoot -PathType Container
        if (-not $wasInstalled -and -not $Force) {
            Set-KnowledgePackBlocked $result "Pack is not installed; use apply-knowledge-pack.ps1 first or pass -Force to install as update: $incomingPackId"
        }
    }

    if ($result.status -ne "blocked") {
        $lockPath = Join-Path $root ".specify\knowledge\lock.yml"
        $activeBefore = @(Get-KnowledgePackLockPackIds -LockPath $lockPath)
        $targetWasActive = $activeBefore -contains $incomingPackId

        $installRaw = & "$PSScriptRoot\install-knowledge-pack.ps1" -RepoRoot $root -PackPath $packRoot -Force -Json
        $install = $installRaw | ConvertFrom-Json
        if ($install.status -eq "blocked") {
            Set-KnowledgePackBlocked $result ("install replacement failed: " + (($install.blockers) -join "; "))
        }
    }

    $compose = $null
    $validation = $null
    $activeAfter = @()
    $removedPublishedCapabilities = @()
    if ($result.status -ne "blocked") {
        $removedPublishedCapabilities = @(Remove-KnowledgePackPublishedArtifactsForPackId -RepoRoot $root -PackId $incomingPackId)

        if ($activeBefore.Count -gt 0) {
            $activeAfter = @($activeBefore)
        } else {
            $activeAfter = @($incomingPackId)
            $targetWasActive = $true
        }

        $composeRaw = & "$PSScriptRoot\compose-knowledge-packs.ps1" -RepoRoot $root -PackId $activeAfter -Json
        $compose = $composeRaw | ConvertFrom-Json
        if ($compose.status -eq "blocked") {
            Set-KnowledgePackBlocked $result ("compose failed after update: " + (($compose.blockers) -join "; "))
        } else {
            $validationRaw = & "$PSScriptRoot\automation-common.ps1" -Tool "validate-knowledge-index" -RepoRoot $root -Json
            $validation = $validationRaw | ConvertFrom-Json
            if ($validation.status -eq "blocked") {
                Set-KnowledgePackBlocked $result ("materialized knowledge failed validation after update: " + (($validation.blockers) -join "; "))
            }
        }
    }

    $result.facts.repo_root = $root
    $result.facts.pack_id = if ($incomingPackId) { $incomingPackId } else { "" }
    $result.facts.version = if ($info) { $info.version } else { "" }
    $result.facts.was_installed = $wasInstalled
    $result.facts.target_was_active = $targetWasActive
    $result.facts.active_before = $activeBefore
    $result.facts.active_after = $activeAfter
    $result.facts.removed_published_capabilities = $removedPublishedCapabilities
    $result.facts.install = $install
    $result.facts.compose = $compose
    $result.facts.validation = $validation
    if ($result.status -eq "ok" -and -not $targetWasActive) {
        $result.hints += "Pack was updated on disk but was not active before update; current active pack set was preserved."
    }
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
}

if ($Json) { Write-KnowledgePackJson $result } else { $result }
