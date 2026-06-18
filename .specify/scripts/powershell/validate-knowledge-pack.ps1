param(
    [string]$PackRoot = "",
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

$result = New-KnowledgePackResult "validate-knowledge-pack"

try {
    $packRootResolved = Resolve-KnowledgePackPath -Path $PackRoot
    if ([string]::IsNullOrWhiteSpace($packRootResolved)) {
        Set-KnowledgePackBlocked $result "PackRoot is required"
    } elseif (-not (Test-Path -LiteralPath $packRootResolved -PathType Container)) {
        Set-KnowledgePackBlocked $result "PackRoot not found: $packRootResolved"
    }

    if ($result.status -ne "blocked") {
        $info = Get-KnowledgePackInfo -PackRoot $packRootResolved
        if (-not (Test-Path -LiteralPath $info.manifest -PathType Leaf)) {
            Set-KnowledgePackBlocked $result "pack manifest not found: knowledge-pack.yml or pack.yml"
        }
        if ([string]::IsNullOrWhiteSpace($info.id)) {
            Set-KnowledgePackBlocked $result "pack manifest missing id"
        }
        if ([string]::IsNullOrWhiteSpace($info.version)) {
            Set-KnowledgePackBlocked $result "pack manifest missing version"
        }
        $strategy = Get-KnowledgePackComposeStrategy -PackRoot $packRootResolved
        if (@("overlay-active-knowledge", "replace-active-knowledge") -notcontains $strategy) {
            Set-KnowledgePackBlocked $result "pack manifest has unsupported compose.strategy: $strategy"
        }

        $indexPath = Join-Path $packRootResolved "ai\knowledge\index.yml"
        if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
            Set-KnowledgePackBlocked $result "ai/knowledge/index.yml not found"
        }

        $missingGuides = @()
        $absolutePathOffenders = @()
        $oversizedGuides = @()
        $invalidAuthorities = @()
        $validAuthorities = @("generated", "reviewed", "authoritative", "")

        if (Test-Path -LiteralPath $indexPath -PathType Leaf) {
            $indexText = Get-Content -LiteralPath $indexPath -Raw
            foreach ($phrase in @("repository_map_authority", "no_full_text_search_required", "max_selected_guides")) {
                if ($indexText -notmatch [regex]::Escape($phrase)) {
                    Set-KnowledgePackBlocked $result "knowledge index missing required phrase: $phrase"
                }
            }

            foreach ($entry in Get-KnowledgePackIndexEntries -IndexPath $indexPath) {
                $authority = if ($entry.authority) { $entry.authority.ToString().Trim().ToLowerInvariant() } else { "" }
                if ($validAuthorities -notcontains $authority) {
                    $invalidAuthorities += "$($entry.category).$($entry.key): $authority"
                }
                if (-not $entry.guide) {
                    $missingGuides += "$($entry.category).$($entry.key) has no guide"
                    continue
                }

                $guidePath = Resolve-KnowledgePackGuidePath -IndexPath $indexPath -Guide $entry.guide
                if (-not (Test-Path -LiteralPath $guidePath -PathType Leaf)) {
                    $missingGuides += (Get-KnowledgePackDisplayPath -Guide $entry.guide)
                    continue
                }

                $text = Get-Content -LiteralPath $guidePath -Raw
                foreach ($pattern in @("[A-Za-z]:\\", "(^|[\\/])Users[\\/][^\\/]+")) {
                    if ($text -match $pattern) {
                        $absolutePathOffenders += "$(Get-KnowledgePackDisplayPath -Guide $entry.guide) contains machine-specific path pattern: $pattern"
                    }
                }
                $lineCount = @((Get-Content -LiteralPath $guidePath)).Count
                if ($lineCount -gt 220) {
                    $oversizedGuides += "$(Get-KnowledgePackDisplayPath -Guide $entry.guide) has $lineCount lines"
                }
            }
        }

        if ($missingGuides.Count -gt 0) {
            Set-KnowledgePackBlocked $result ("missing knowledge guides: " + (($missingGuides | Select-Object -Unique) -join ", "))
        }
        if ($absolutePathOffenders.Count -gt 0) {
            Set-KnowledgePackBlocked $result ("machine-specific knowledge paths found: " + (($absolutePathOffenders | Select-Object -Unique) -join "; "))
        }
        if ($oversizedGuides.Count -gt 0) {
            Set-KnowledgePackBlocked $result ("knowledge guides exceed 220 lines: " + (($oversizedGuides | Select-Object -Unique) -join "; "))
        }
        if ($invalidAuthorities.Count -gt 0) {
            Set-KnowledgePackBlocked $result ("knowledge index entries use invalid authority values: " + (($invalidAuthorities | Select-Object -Unique) -join ", "))
        }

        $capabilityLayers = Get-KnowledgePackCapabilityLayers -PackRoot $packRootResolved
        $capabilityLayerFacts = [ordered]@{}
        $capabilityPathOffenders = @()
        $capabilityMachinePathOffenders = @()
        $skillManifestOffenders = @()
        $scriptExtensionOffenders = @()
        $scriptHashes = @()
        $extraCapabilityLayerPresent = $false
        foreach ($layerName in $capabilityLayers.Keys) {
            $layer = $capabilityLayers[$layerName]
            $capabilityLayerFacts[$layerName] = [ordered]@{
                present = [bool]$layer.present
                file_count = 0
            }
            if (-not $layer.present) { continue }
            $extraCapabilityLayerPresent = $true
            $files = @(Get-ChildItem -LiteralPath $layer.path -Recurse -File -Force)
            $capabilityLayerFacts[$layerName]["file_count"] = $files.Count
            foreach ($file in $files) {
                $relative = [System.IO.Path]::GetRelativePath($packRootResolved, $file.FullName).Replace('\', '/')
                if (-not (Test-KnowledgePackSafeRelativePath -RelativePath $relative)) {
                    $capabilityPathOffenders += $relative
                }
                if ($layerName -eq "scripts") {
                    if (@(".ps1", ".psm1", ".psd1", ".sh", ".cmd", ".bat") -notcontains $file.Extension.ToLowerInvariant()) {
                        $scriptExtensionOffenders += $relative
                    }
                    $scriptHashes += [ordered]@{
                        path = $relative
                        sha256 = Get-KnowledgePackFileHash -Path $file.FullName
                    }
                }
                if (@(".md", ".yml", ".yaml", ".json", ".ps1", ".psm1", ".psd1", ".txt") -contains $file.Extension.ToLowerInvariant()) {
                    $text = Get-Content -LiteralPath $file.FullName -Raw
                    foreach ($pattern in @("[A-Za-z]:\\", "(^|[\\/])Users[\\/][^\\/]+")) {
                        if ($text -match $pattern) {
                            $capabilityMachinePathOffenders += "$relative contains machine-specific path pattern: $pattern"
                        }
                    }
                }
            }
        }

        if ($capabilityLayers["skills"].present) {
            foreach ($skillDir in Get-ChildItem -LiteralPath $capabilityLayers["skills"].path -Directory -Force) {
                if (-not (Test-Path -LiteralPath (Join-Path $skillDir.FullName "SKILL.md") -PathType Leaf)) {
                    $relative = [System.IO.Path]::GetRelativePath($packRootResolved, $skillDir.FullName).Replace('\', '/')
                    $skillManifestOffenders += "$relative missing SKILL.md"
                }
            }
        }

        $capabilityIndexPath = Join-Path $packRootResolved "capabilities\index.yml"
        if ($extraCapabilityLayerPresent -and -not (Test-Path -LiteralPath $capabilityIndexPath -PathType Leaf)) {
            Set-KnowledgePackBlocked $result "capability pack layers require capabilities/index.yml"
        }
        if ($capabilityPathOffenders.Count -gt 0) {
            Set-KnowledgePackBlocked $result ("unsafe capability paths found: " + (($capabilityPathOffenders | Select-Object -Unique) -join ", "))
        }
        if ($capabilityMachinePathOffenders.Count -gt 0) {
            Set-KnowledgePackBlocked $result ("machine-specific capability paths found: " + (($capabilityMachinePathOffenders | Select-Object -Unique) -join "; "))
        }
        if ($skillManifestOffenders.Count -gt 0) {
            Set-KnowledgePackBlocked $result ("invalid skill layer entries: " + (($skillManifestOffenders | Select-Object -Unique) -join "; "))
        }
        if ($scriptExtensionOffenders.Count -gt 0) {
            Set-KnowledgePackBlocked $result ("unsupported script files in capability pack: " + (($scriptExtensionOffenders | Select-Object -Unique) -join ", "))
        }

        $aliases = Read-KnowledgeToolAliases -PackRoot $packRootResolved
        $scenarios = @(Get-KnowledgePackEvaluationScenarios -PackRoot $packRootResolved)
        $result.facts.pack_root = $packRootResolved
        $result.facts.pack_id = $info.id
        $result.facts.version = $info.version
        $result.facts.kind = $info.kind
        $result.facts.manifest = $info.manifest
        $result.facts.compose_strategy = $strategy
        $result.facts.index = $indexPath
        $result.facts.guide_count = @(Get-KnowledgePackIndexEntries -IndexPath $indexPath | Where-Object { $_.guide }).Count
        $result.facts.missing_guides = @($missingGuides | Select-Object -Unique)
        $result.facts.absolute_path_offenders = @($absolutePathOffenders | Select-Object -Unique)
        $result.facts.oversized_guides = @($oversizedGuides | Select-Object -Unique)
        $result.facts.invalid_authorities = @($invalidAuthorities | Select-Object -Unique)
        $result.facts.tool_aliases = $aliases
        $result.facts.evaluation_scenario_count = $scenarios.Count
        $result.facts.capability_index = $capabilityIndexPath
        $result.facts.capability_layers = $capabilityLayerFacts
        $result.facts.script_hashes = $scriptHashes
    }
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
}

if ($Json) { Write-KnowledgePackJson $result } else { $result }
