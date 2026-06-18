param(
    [string]$RepoRoot = "",
    [string[]]$PackId = @(),
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

$result = New-KnowledgePackResult "compose-knowledge-packs"

try {
    $root = Resolve-KnowledgePackPath -Path $RepoRoot
    if ([string]::IsNullOrWhiteSpace($root)) { $root = (Get-Location).Path }
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
        Set-KnowledgePackBlocked $result "RepoRoot not found: $root"
    }

    if ($result.status -ne "blocked") {
        $knowledgeRoot = Join-Path $root ".specify\knowledge"
        $packsRoot = Join-Path $knowledgeRoot "packs"
        if (-not (Test-Path -LiteralPath $packsRoot -PathType Container)) {
            Set-KnowledgePackBlocked $result "No installed knowledge packs found under .specify/knowledge/packs"
        } else {
            if ($PackId.Count -eq 0) {
                $PackId = @(Get-ChildItem -LiteralPath $packsRoot -Directory | Where-Object {
                    Test-Path -LiteralPath (Get-KnowledgePackManifestPath -PackRoot $_.FullName) -PathType Leaf
                } | ForEach-Object { $_.Name })
            }
            if ($PackId.Count -eq 0) {
                Set-KnowledgePackBlocked $result "No PackId supplied and no installed packs discovered"
            }
        }
    }

    if ($result.status -ne "blocked") {
        $baseRoot = Join-Path $root ".specify\knowledge\base\ai\knowledge"
        $activeKnowledge = Join-Path $root "ai\knowledge"
        if (-not (Test-Path -LiteralPath $baseRoot -PathType Container) -and (Test-Path -LiteralPath $activeKnowledge -PathType Container)) {
            Copy-KnowledgePackDirectory -Source $activeKnowledge -Destination $baseRoot
        }

        $materialized = Join-Path $root ".specify\knowledge\materialized\ai\knowledge"
        Remove-KnowledgePackDirectorySafe -Root (Join-Path $root ".specify\knowledge") -Path $materialized
        New-Item -ItemType Directory -Force -Path $materialized | Out-Null
        $materializedInitialized = $false
        $baseKnowledgeIncluded = $false

        $applied = @()
        $capabilityApplied = @()
        $aliases = [ordered]@{}
        $capabilitiesRoot = Join-Path $root ".specify\capabilities"
        $capabilityMaterialized = Join-Path $capabilitiesRoot "materialized"
        Remove-KnowledgePackDirectorySafe -Root $capabilitiesRoot -Path $capabilityMaterialized
        New-Item -ItemType Directory -Force -Path $capabilityMaterialized | Out-Null
        foreach ($id in $PackId) {
            $slug = ConvertTo-KnowledgePackSlug -Value $id
            $packRoot = Join-Path $root ".specify\knowledge\packs\$slug"
            $packManifest = Get-KnowledgePackManifestPath -PackRoot $packRoot
            if (-not (Test-Path -LiteralPath $packManifest -PathType Leaf)) {
                Set-KnowledgePackBlocked $result "Installed pack not found: $slug"
                continue
            }
            $info = Get-KnowledgePackInfo -PackRoot $packRoot
            $packKnowledge = Join-Path $packRoot "ai\knowledge"
            if (-not (Test-Path -LiteralPath $packKnowledge -PathType Container)) {
                Set-KnowledgePackBlocked $result "Installed pack has no ai/knowledge directory: $slug"
                continue
            }
            $strategy = Get-KnowledgePackComposeStrategy -PackRoot $packRoot
            if ($strategy -eq "replace-active-knowledge") {
                Remove-KnowledgePackDirectorySafe -Root (Join-Path $root ".specify\knowledge") -Path $materialized
                New-Item -ItemType Directory -Force -Path $materialized | Out-Null
                $materializedInitialized = $true
                $baseKnowledgeIncluded = $false
            } elseif ($strategy -ne "overlay-active-knowledge") {
                Set-KnowledgePackBlocked $result "Unsupported compose.strategy '$strategy' in pack: $slug"
                continue
            } elseif (-not $materializedInitialized) {
                if (Test-Path -LiteralPath $baseRoot -PathType Container) {
                    Copy-KnowledgePackDirectory -Source $baseRoot -Destination $materialized
                    $baseKnowledgeIncluded = $true
                }
                $materializedInitialized = $true
            }
            Copy-KnowledgePackDirectory -Source $packKnowledge -Destination $materialized
            $layers = Get-KnowledgePackCapabilityLayers -PackRoot $packRoot
            foreach ($layerName in @("skills", "tools", "scripts", "commands", "prompts", "resources", "templates")) {
                $layer = $layers[$layerName]
                if (-not $layer.present) { continue }
                $layerDestination = Join-Path $capabilityMaterialized "$layerName\$($info.id)"
                Copy-KnowledgePackDirectory -Source $layer.path -Destination $layerDestination
                $capabilityApplied += [ordered]@{
                    pack_id = $info.id
                    layer = $layerName
                    materialized_path = ".specify/capabilities/materialized/$layerName/$($info.id)"
                }
            }
            $packAliases = Read-KnowledgeToolAliases -PackRoot $packRoot
            foreach ($key in $packAliases.Keys) { $aliases[$key] = $packAliases[$key] }
            $applied += [ordered]@{
                id = $info.id
                version = $info.version
                compose_strategy = $strategy
                installed_path = ".specify/knowledge/packs/$($info.id)"
            }
        }

        if ($result.status -ne "blocked") {
            $aliasChanged = Apply-KnowledgeToolAliases -Root $materialized -Aliases $aliases
            $backupRoot = Join-Path $root (".specify\knowledge\backups\" + (Get-Date -Format "yyyyMMdd-HHmmss") + "\ai\knowledge")
            if (Test-Path -LiteralPath $activeKnowledge -PathType Container) {
                Copy-KnowledgePackDirectory -Source $activeKnowledge -Destination $backupRoot
                Remove-KnowledgePackDirectorySafe -Root (Join-Path $root "ai") -Path $activeKnowledge
            }
            Copy-KnowledgePackDirectory -Source $materialized -Destination $activeKnowledge

            $removedPublishedCapabilities = @()
            $previousCapabilityLockPath = Join-Path $capabilitiesRoot "lock.yml"
            $packIdsToClean = @()
            $packIdsToClean += @(Get-KnowledgePackLockPackIds -LockPath $previousCapabilityLockPath)
            $packIdsToClean += @($applied | ForEach-Object { $_.id })
            foreach ($packIdToClean in @($packIdsToClean | Select-Object -Unique)) {
                $removedPublishedCapabilities += @(Remove-KnowledgePackPublishedArtifactsForPackId -RepoRoot $root -PackId $packIdToClean)
            }

            $publishedCapabilities = @()
            foreach ($pack in $applied) {
                $packIdForPublish = $pack.id
                $skillsStage = Join-Path $capabilityMaterialized "skills\$packIdForPublish"
                if (Test-Path -LiteralPath $skillsStage -PathType Container) {
                    $skillsTargetRoot = Join-Path $root ".agents\spec-kit\skills"
                    New-Item -ItemType Directory -Force -Path $skillsTargetRoot | Out-Null
                    foreach ($skillDir in Get-ChildItem -LiteralPath $skillsStage -Directory -Force) {
                        $targetName = "${packIdForPublish}__$($skillDir.Name)"
                        $target = Join-Path $skillsTargetRoot $targetName
                        if (Test-Path -LiteralPath $target) {
                            Remove-KnowledgePackDirectorySafe -Root $skillsTargetRoot -Path $target
                        }
                        Copy-KnowledgePackDirectory -Source $skillDir.FullName -Destination $target
                        $publishedCapabilities += [ordered]@{
                            layer = "skills"
                            pack_id = $packIdForPublish
                            path = ".agents/spec-kit/skills/$targetName"
                        }
                    }
                }

                $layerTargets = [ordered]@{
                    tools = "ai\tools\$packIdForPublish"
                    scripts = ".specify\scripts\packs\$packIdForPublish"
                    commands = ".specify\capabilities\commands\$packIdForPublish"
                    prompts = ".specify\capabilities\prompts\$packIdForPublish"
                    resources = ".specify\capabilities\resources\$packIdForPublish"
                    templates = ".specify\capabilities\templates\$packIdForPublish"
                }
                foreach ($layerName in $layerTargets.Keys) {
                    $stage = Join-Path $capabilityMaterialized "$layerName\$packIdForPublish"
                    if (-not (Test-Path -LiteralPath $stage -PathType Container)) { continue }
                    $targetRelative = $layerTargets[$layerName]
                    $target = Join-Path $root $targetRelative
                    $targetRoot = Split-Path -Parent $target
                    New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
                    if (Test-Path -LiteralPath $target) {
                        Remove-KnowledgePackDirectorySafe -Root $targetRoot -Path $target
                    }
                    Copy-KnowledgePackDirectory -Source $stage -Destination $target
                    $publishedCapabilities += [ordered]@{
                        layer = $layerName
                        pack_id = $packIdForPublish
                        path = $targetRelative.Replace('\', '/')
                    }
                }
            }

            $lockPath = Join-Path $root ".specify\knowledge\lock.yml"
            $lock = @(
                'schema_version: "1.0"',
                'generated_by: "compose-knowledge-packs"',
                'materialized: "ai/knowledge"',
                'base: ".specify/knowledge/base/ai/knowledge"',
                "packs:"
            )
            foreach ($pack in $applied) {
                $lock += "  - id: `"$($pack.id)`""
                $lock += "    version: `"$($pack.version)`""
                $lock += "    compose_strategy: `"$($pack.compose_strategy)`""
                $lock += "    installed_path: `"$($pack.installed_path)`""
            }
            $lock += "aliases_applied:"
            if ($aliases.Count -eq 0) {
                $lock += "  {}"
            } else {
                foreach ($key in $aliases.Keys) {
                    $lock += "  ${key}: $($aliases[$key])"
                }
            }
            $lock | Set-Content -LiteralPath $lockPath -Encoding utf8

            $capabilityLockPath = Join-Path $root ".specify\capabilities\lock.yml"
            $capabilityLock = @(
                'schema_version: "1.0"',
                'generated_by: "compose-knowledge-packs"',
                'materialized: ".specify/capabilities/materialized"',
                'auto_run_scripts: false',
                "packs:"
            )
            foreach ($pack in $applied) {
                $capabilityLock += "  - id: `"$($pack.id)`""
                $capabilityLock += "    version: `"$($pack.version)`""
                $capabilityLock += "    installed_path: `"$($pack.installed_path)`""
            }
            $capabilityLock += "published:"
            if ($publishedCapabilities.Count -eq 0) {
                $capabilityLock += "  []"
            } else {
                foreach ($capability in $publishedCapabilities) {
                    $capabilityLock += "  - layer: `"$($capability.layer)`""
                    $capabilityLock += "    pack_id: `"$($capability.pack_id)`""
                    $capabilityLock += "    path: `"$($capability.path)`""
                }
            }
            $capabilityLock | Set-Content -LiteralPath $capabilityLockPath -Encoding utf8

            $result.facts.repo_root = $root
            $result.facts.materialized_knowledge_dir = $activeKnowledge
            $result.facts.staging_dir = $materialized
            $result.facts.capability_materialized_dir = $capabilityMaterialized
            $result.facts.backup_dir = $backupRoot
            $result.facts.lock = $lockPath
            $result.facts.capability_lock = $capabilityLockPath
            $result.facts.applied_packs = $applied
            $result.facts.capability_layers_applied = $capabilityApplied
            $result.facts.removed_published_capabilities = $removedPublishedCapabilities
            $result.facts.published_capabilities = $publishedCapabilities
            $result.facts.base_knowledge_included = $baseKnowledgeIncluded
            $result.facts.aliases_applied = $aliases
            $result.facts.alias_changed_files = @($aliasChanged | ForEach-Object {
                try {
                    [System.IO.Path]::GetRelativePath($root, $_).Replace('\', '/')
                } catch {
                    $_
                }
            })
        }
    }
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
}

if ($Json) { Write-KnowledgePackJson $result } else { $result }
