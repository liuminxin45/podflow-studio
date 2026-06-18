param(
    [string]$RepoRoot = "",
    [string]$PackPath = "",
    [switch]$Force,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

$result = New-KnowledgePackResult "install-knowledge-pack"

try {
    $root = Resolve-KnowledgePackPath -Path $RepoRoot
    if ([string]::IsNullOrWhiteSpace($root)) { $root = (Get-Location).Path }
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
        Set-KnowledgePackBlocked $result "RepoRoot not found: $root"
    }

    $packRoot = Resolve-KnowledgePackPath -Path $PackPath
    if ([string]::IsNullOrWhiteSpace($packRoot)) {
        Set-KnowledgePackBlocked $result "PackPath is required"
    } elseif (-not (Test-Path -LiteralPath $packRoot -PathType Container)) {
        Set-KnowledgePackBlocked $result "PackPath not found: $packRoot"
    }

    if ($result.status -ne "blocked") {
        $validationRaw = & "$PSScriptRoot\validate-knowledge-pack.ps1" -PackRoot $packRoot -Json
        $validation = $validationRaw | ConvertFrom-Json
        if ($validation.status -eq "blocked") {
            Set-KnowledgePackBlocked $result ("pack validation failed: " + (($validation.blockers) -join "; "))
        } else {
            $info = Get-KnowledgePackInfo -PackRoot $packRoot
            $knowledgeRoot = Join-Path $root ".specify\knowledge"
            $packsRoot = Join-Path $knowledgeRoot "packs"
            $baseRoot = Join-Path $knowledgeRoot "base\ai\knowledge"
            New-Item -ItemType Directory -Force -Path $packsRoot | Out-Null

            $activeKnowledge = Join-Path $root "ai\knowledge"
            if (-not (Test-Path -LiteralPath $baseRoot -PathType Container) -and (Test-Path -LiteralPath $activeKnowledge -PathType Container)) {
                Copy-KnowledgePackDirectory -Source $activeKnowledge -Destination $baseRoot
            }

            $destination = Join-Path $packsRoot $info.id
            if ((Test-Path -LiteralPath $destination) -and -not $Force) {
                Set-KnowledgePackBlocked $result "Pack is already installed; pass -Force to replace: $($info.id)"
            } else {
                if (Test-Path -LiteralPath $destination) {
                    Remove-KnowledgePackDirectorySafe -Root $packsRoot -Path $destination
                }
                Copy-KnowledgePackDirectory -Source $packRoot -Destination $destination
                $result.facts.repo_root = $root
                $result.facts.pack_id = $info.id
                $result.facts.version = $info.version
                $result.facts.installed_path = $destination
                $result.facts.base_knowledge = $baseRoot
                $result.facts.validation = $validation
                $result.hints += "Run apply-knowledge-pack.ps1 to materialize installed pack knowledge into ai/knowledge."
            }
        }
    }
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
}

if ($Json) { Write-KnowledgePackJson $result } else { $result }
