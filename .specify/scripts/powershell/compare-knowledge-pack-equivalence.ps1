param(
    [string]$SourceKnowledgeDir = "",
    [string]$PackRoot = "",
    [string]$SpecKitRoot = "",
    [string]$OutputDir = "",
    [string]$ScenarioFile = "",
    [double]$MinOverallPercent = 95.0,
    [switch]$UseSpecKitInit,
    [switch]$KeepWorkspaces,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

function ConvertTo-EquivalentText {
    param(
        [string]$Text,
        [hashtable]$Aliases
    )
    $updated = $Text -replace "`r`n", "`n"
    $updated = $updated -replace "`r", "`n"
    if ($Aliases) {
        foreach ($key in $Aliases.Keys) {
            $updated = $updated.Replace([string]$key, [string]$Aliases[$key])
        }
    }
    return $updated.TrimEnd()
}

function Get-GuideMapByDisplayPath {
    param([string]$IndexPath)
    $map = [ordered]@{}
    foreach ($entry in Get-KnowledgePackIndexEntries -IndexPath $IndexPath) {
        if (-not $entry.guide) { continue }
        $display = Get-KnowledgePackDisplayPath -Guide $entry.guide
        $map[$display] = [ordered]@{
            category = $entry.category
            key = $entry.key
            guide = $entry.guide
            path = Resolve-KnowledgePackGuidePath -IndexPath $IndexPath -Guide $entry.guide
        }
    }
    return $map
}

function Get-RelativeFileSet {
    param([string]$Root)
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return @() }
    return @(Get-ChildItem -LiteralPath $Root -Recurse -File | ForEach-Object {
        [System.IO.Path]::GetRelativePath($Root, $_.FullName).Replace('\', '/')
    } | Sort-Object)
}

function Get-RepositoryKeysFromKnowledgeIndex {
    param([string]$KnowledgeDir)
    $indexPath = Join-Path $KnowledgeDir "index.yml"
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) { return @() }
    return @(Get-KnowledgePackIndexEntries -IndexPath $indexPath |
        Where-Object { $_.category -eq "repositories" -and -not [string]::IsNullOrWhiteSpace($_.key) } |
        ForEach-Object { $_.key } |
        Select-Object -Unique)
}

function Get-Percent {
    param([int]$Good, [int]$Total)
    if ($Total -le 0) { return 100.0 }
    return [Math]::Round(($Good * 100.0) / $Total, 2)
}

function Write-FeatureScenario {
    param(
        [string]$Root,
        $Scenario
    )
    $featurePath = Join-Path $Root ".specify\feature.json"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $featurePath) | Out-Null
    $payload = [ordered]@{
        affected_repositories = @($Scenario.affected_repositories)
        risk_flags = @($Scenario.risk_flags)
        capability_tags = @($Scenario.capability_tags)
        request_summary = [string]$Scenario.request_summary
    }
    $payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $featurePath -Encoding utf8
}

function Invoke-SelectKnowledgeForScenario {
    param(
        [string]$Root,
        $Scenario
    )
    Write-FeatureScenario -Root $Root -Scenario $Scenario
    $raw = & "$PSScriptRoot\automation-common.ps1" -Tool "select-knowledge" -RepoRoot $Root -Stage $Scenario.stage -Json
    return ($raw | ConvertFrom-Json)
}

function Initialize-ReferenceWorkspace {
    param(
        [string]$Root,
        [string]$KnowledgeDir,
        [string]$PackRoot
    )
    New-Item -ItemType Directory -Force -Path (Join-Path $Root ".specify\memory") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $Root "ai") | Out-Null
    Copy-KnowledgePackDirectory -Source $KnowledgeDir -Destination (Join-Path $Root "ai\knowledge")

    $workspaceProfile = Join-Path $PackRoot "profiles\workspace.yml"
    if (Test-Path -LiteralPath $workspaceProfile -PathType Leaf) {
        Copy-Item -LiteralPath $workspaceProfile -Destination (Join-Path $Root ".specify\workspace.yml") -Force
    } else {
        $repositoryKeys = @(Get-RepositoryKeysFromKnowledgeIndex -KnowledgeDir $KnowledgeDir)
        if ($repositoryKeys.Count -eq 0) { $repositoryKeys = @("Reference") }
        $workspaceLines = @("repositories:")
        foreach ($repoName in $repositoryKeys) {
            $workspaceLines += "  - name: $repoName"
            $workspaceLines += "    path: `".`""
            $workspaceLines += "    required: false"
        }
        $workspaceLines | Set-Content -LiteralPath (Join-Path $Root ".specify\workspace.yml") -Encoding utf8
    }

    $repositoryMapProfile = Join-Path $PackRoot "profiles\repository-map.md"
    if (Test-Path -LiteralPath $repositoryMapProfile -PathType Leaf) {
        Copy-Item -LiteralPath $repositoryMapProfile -Destination (Join-Path $Root ".specify\memory\repository-map.md") -Force
    } else {
        "# Repository Map`n`n## Project Path Categories`n`nDo not write machine-specific absolute paths here.`n" |
            Set-Content -LiteralPath (Join-Path $Root ".specify\memory\repository-map.md") -Encoding utf8
    }
}

function Initialize-CandidateWorkspace {
    param(
        [string]$Root,
        [string]$PackRoot,
        [string]$SpecKitRoot,
        [bool]$UseInit
    )
    if ($UseInit) {
        if (-not (Test-Path -LiteralPath (Join-Path $SpecKitRoot "src\specify_cli\__init__.py") -PathType Leaf)) {
            throw "SpecKitRoot does not look like a source checkout: $SpecKitRoot"
        }
        New-Item -ItemType Directory -Force -Path $Root | Out-Null
        Push-Location $Root
        try {
            $oldPythonPath = $env:PYTHONPATH
            $env:PYTHONPATH = (Join-Path $SpecKitRoot "src")
            python -c "import sys; from specify_cli import main; sys.argv=['specify','init','--here','--force','--no-git','--ignore-agent-tools']; main()" | Out-Null
            $env:PYTHONPATH = $oldPythonPath
        } finally {
            Pop-Location
        }
    } else {
        New-Item -ItemType Directory -Force -Path (Join-Path $Root ".specify") | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $Root "ai\knowledge") | Out-Null
        $coreKnowledge = Join-Path $SpecKitRoot "templates\ai\knowledge"
        if (Test-Path -LiteralPath $coreKnowledge -PathType Container) {
            Copy-KnowledgePackDirectory -Source $coreKnowledge -Destination (Join-Path $Root "ai\knowledge")
        }
    }

    $raw = & "$PSScriptRoot\apply-knowledge-pack.ps1" -RepoRoot $Root -PackPath $PackRoot -ApplyProfiles -Force -Json
    $applyResult = $raw | ConvertFrom-Json
    if ($applyResult.status -eq "blocked") {
        throw ("apply-knowledge-pack failed: " + (($applyResult.blockers) -join "; "))
    }
    return $applyResult
}

$result = New-KnowledgePackResult "compare-knowledge-pack-equivalence"
$workRoot = ""
$reportRoot = ""

try {
    if ([string]::IsNullOrWhiteSpace($SpecKitRoot)) {
        $SpecKitRoot = Resolve-KnowledgePackPath -Path (Join-Path $PSScriptRoot "..\..")
    } else {
        $SpecKitRoot = Resolve-KnowledgePackPath -Path $SpecKitRoot
    }
    $source = Resolve-KnowledgePackPath -Path $SourceKnowledgeDir
    $pack = Resolve-KnowledgePackPath -Path $PackRoot
    if (-not (Test-Path -LiteralPath (Join-Path $source "index.yml") -PathType Leaf)) {
        Set-KnowledgePackBlocked $result "SourceKnowledgeDir must contain index.yml: $source"
    }
    if (-not (Test-Path -LiteralPath (Get-KnowledgePackManifestPath -PackRoot $pack) -PathType Leaf)) {
        Set-KnowledgePackBlocked $result "PackRoot must contain knowledge-pack.yml or pack.yml: $pack"
    }

    if ($result.status -ne "blocked") {
        $packInfo = Get-KnowledgePackInfo -PackRoot $pack
        $workRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("speckit-knowledge-equivalence-" + [guid]::NewGuid().ToString("N"))
        if (-not [string]::IsNullOrWhiteSpace($OutputDir)) {
            $reportRoot = Resolve-KnowledgePackPath -Path $OutputDir
            if (Test-Path -LiteralPath $reportRoot) {
                Remove-KnowledgePackDirectorySafe -Root (Split-Path -Parent $reportRoot) -Path $reportRoot
            }
            New-Item -ItemType Directory -Force -Path $reportRoot | Out-Null
        } else {
            $reportRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("speckit-knowledge-equivalence-report-" + [guid]::NewGuid().ToString("N"))
            New-Item -ItemType Directory -Force -Path $reportRoot | Out-Null
        }
        New-Item -ItemType Directory -Force -Path $workRoot | Out-Null

        $referenceRoot = Join-Path $workRoot "reference"
        $candidateRoot = Join-Path $workRoot "candidate"
        Initialize-ReferenceWorkspace -Root $referenceRoot -KnowledgeDir $source -PackRoot $pack
        $applyResult = Initialize-CandidateWorkspace -Root $candidateRoot -PackRoot $pack -SpecKitRoot $SpecKitRoot -UseInit ([bool]$UseSpecKitInit)

        $aliases = Read-KnowledgeToolAliases -PackRoot $pack
        $sourceIndex = Join-Path $referenceRoot "ai\knowledge\index.yml"
        $candidateIndex = Join-Path $candidateRoot "ai\knowledge\index.yml"
        $sourceGuides = Get-GuideMapByDisplayPath -IndexPath $sourceIndex
        $candidateGuides = Get-GuideMapByDisplayPath -IndexPath $candidateIndex

        $sourceEntryKeys = @($sourceGuides.Keys | Sort-Object)
        $candidateEntryKeys = @($candidateGuides.Keys | Sort-Object)
        $commonEntries = @($sourceEntryKeys | Where-Object { $candidateEntryKeys -contains $_ })
        $missingEntries = @($sourceEntryKeys | Where-Object { $candidateEntryKeys -notcontains $_ })
        $extraEntries = @($candidateEntryKeys | Where-Object { $sourceEntryKeys -notcontains $_ })
        $indexParity = Get-Percent -Good $commonEntries.Count -Total $sourceEntryKeys.Count

        $matchingGuides = @()
        $differentGuides = @()
        foreach ($entryPath in $commonEntries) {
            $sourceText = ConvertTo-EquivalentText -Text (Get-Content -LiteralPath $sourceGuides[$entryPath].path -Raw) -Aliases $aliases
            $candidateText = ConvertTo-EquivalentText -Text (Get-Content -LiteralPath $candidateGuides[$entryPath].path -Raw) -Aliases $aliases
            if ($sourceText -eq $candidateText) {
                $matchingGuides += $entryPath
            } else {
                $differentGuides += $entryPath
            }
        }
        $guideParity = Get-Percent -Good $matchingGuides.Count -Total $sourceEntryKeys.Count

        $sourceFiles = Get-RelativeFileSet -Root (Join-Path $referenceRoot "ai\knowledge")
        $candidateFiles = Get-RelativeFileSet -Root (Join-Path $candidateRoot "ai\knowledge")
        $extraUnindexedCandidateFiles = @($candidateFiles | Where-Object {
            ($sourceFiles -notcontains $_) -and ($candidateEntryKeys -notcontains ("ai/knowledge/" + $_))
        })

        $scenarioPath = if ([string]::IsNullOrWhiteSpace($ScenarioFile)) { "" } else { Resolve-KnowledgePackPath -Path $ScenarioFile }
        $scenarios = @(Get-KnowledgePackEvaluationScenarios -PackRoot $pack -ScenarioFile $scenarioPath)
        if ($scenarios.Count -eq 0) {
            $result.unknowns += "No evaluation scenarios supplied; routing parity is vacuously 100%."
        }

        $routingResults = @()
        $routingMatches = 0
        foreach ($scenario in $scenarios) {
            $sourceSelection = Invoke-SelectKnowledgeForScenario -Root $referenceRoot -Scenario $scenario
            $candidateSelection = Invoke-SelectKnowledgeForScenario -Root $candidateRoot -Scenario $scenario
            $sourcePaths = @($sourceSelection.facts.selected | ForEach-Object { $_.path })
            $candidatePaths = @($candidateSelection.facts.selected | ForEach-Object { $_.path })
            $matches = (($sourcePaths -join "|") -eq ($candidatePaths -join "|"))
            if ($matches) { $routingMatches += 1 }
            $routingResults += [ordered]@{
                name = $scenario.name
                stage = $scenario.stage
                matches = $matches
                source_selected = $sourcePaths
                candidate_selected = $candidatePaths
            }
        }
        $routingParity = Get-Percent -Good $routingMatches -Total $scenarios.Count

        $packValidation = (& "$PSScriptRoot\validate-knowledge-pack.ps1" -PackRoot $pack -Json) | ConvertFrom-Json
        $sourceValidation = (& "$PSScriptRoot\automation-common.ps1" -Tool "validate-knowledge-index" -RepoRoot $referenceRoot -Json) | ConvertFrom-Json
        $candidateValidation = (& "$PSScriptRoot\automation-common.ps1" -Tool "validate-knowledge-index" -RepoRoot $candidateRoot -Json) | ConvertFrom-Json
        $generatedContextValidation = $null
        if ($UseSpecKitInit) {
            $generatedContextValidation = (& "$PSScriptRoot\automation-common.ps1" -Tool "validate-generated-context" -RepoRoot $candidateRoot -Json) | ConvertFrom-Json
        }

        $validationPass = (
            $packValidation.status -eq "ok" -and
            $sourceValidation.status -eq "ok" -and
            $candidateValidation.status -eq "ok" -and
            ((-not $UseSpecKitInit) -or $generatedContextValidation.status -eq "ok")
        )

        $aliasKeys = @($aliases.Keys)
        $aliasLeakFiles = @()
        if ($aliasKeys.Count -gt 0) {
            foreach ($file in Get-ChildItem -LiteralPath (Join-Path $candidateRoot "ai\knowledge") -Recurse -File) {
                $text = Get-Content -LiteralPath $file.FullName -Raw
                foreach ($key in $aliasKeys) {
                    if ($text.Contains([string]$key)) {
                        $aliasLeakFiles += [System.IO.Path]::GetRelativePath((Join-Path $candidateRoot "ai\knowledge"), $file.FullName).Replace('\', '/')
                        break
                    }
                }
            }
        }
        $aliasPass = ($aliasLeakFiles.Count -eq 0)

        $validationPercent = if ($validationPass) { 100.0 } else { 0.0 }
        $aliasPercent = if ($aliasPass) { 100.0 } else { 0.0 }
        $overall = [Math]::Round(
            ($indexParity * 0.25) +
            ($guideParity * 0.25) +
            ($routingParity * 0.30) +
            ($validationPercent * 0.10) +
            ($aliasPercent * 0.10),
            2
        )

        if ($indexParity -lt 100.0) {
            Set-KnowledgePackBlocked $result "index parity below 100%"
        }
        if ($guideParity -lt 100.0) {
            Set-KnowledgePackBlocked $result "indexed guide parity below 100%"
        }
        if ($routingParity -lt 100.0) {
            Set-KnowledgePackBlocked $result "routing parity below 100%"
        }
        if (-not $validationPass) {
            Set-KnowledgePackBlocked $result "validation gate parity failed"
        }
        if (-not $aliasPass) {
            Set-KnowledgePackBlocked $result "legacy tool alias leakage found in active knowledge"
        }
        if ($overall -lt $MinOverallPercent) {
            Set-KnowledgePackBlocked $result "overall equivalence score $overall is below threshold $MinOverallPercent"
        }

        $result.facts.source_knowledge_dir = $source
        $result.facts.pack_root = $pack
        $result.facts.pack_id = $packInfo.id
        $result.facts.spec_kit_root = $SpecKitRoot
        $result.facts.work_root = $workRoot
        $result.facts.reference_workspace = $referenceRoot
        $result.facts.candidate_workspace = $candidateRoot
        $result.facts.use_spec_kit_init = [bool]$UseSpecKitInit
        $result.facts.scenario_file = if ($scenarioPath) { $scenarioPath } else { Join-Path $pack "evaluation\scenarios.json" }
        $result.facts.scenario_count = $scenarios.Count
        $result.facts.scores = [ordered]@{
            index_parity_percent = $indexParity
            indexed_guide_parity_percent = $guideParity
            routing_parity_percent = $routingParity
            validation_percent = $validationPercent
            alias_percent = $aliasPercent
            overall_percent = $overall
            threshold_percent = $MinOverallPercent
        }
        $result.facts.index = [ordered]@{
            source_entry_count = $sourceEntryKeys.Count
            candidate_entry_count = $candidateEntryKeys.Count
            missing_entries = $missingEntries
            extra_entries = $extraEntries
        }
        $result.facts.guides = [ordered]@{
            matching = $matchingGuides
            different = $differentGuides
            extra_unindexed_candidate_files = $extraUnindexedCandidateFiles
        }
        $result.facts.routing = $routingResults
        $result.facts.validation = [ordered]@{
            pack = $packValidation
            source_knowledge = $sourceValidation
            candidate_knowledge = $candidateValidation
            candidate_generated_context = $generatedContextValidation
        }
        $result.facts.aliases = [ordered]@{
            mappings = $aliases
            leakage_files = @($aliasLeakFiles | Select-Object -Unique)
        }
        $result.facts.apply = $applyResult

        $reportDestination = if ([string]::IsNullOrWhiteSpace($reportRoot)) { $workRoot } else { $reportRoot }
        $reportPath = Join-Path $reportDestination "equivalence-report.json"
        $summaryPath = Join-Path $reportDestination "equivalence-summary.md"
        $result.facts.report = $reportPath
        $result.facts.summary = $summaryPath
        $result.facts.report_root = $reportDestination

        @(
            "# Knowledge Pack Equivalence Summary",
            "",
            "- Source knowledge: $source",
            "- Pack: $pack",
            "- Overall: $overall%",
            "- Index parity: $indexParity%",
            "- Indexed guide parity: $guideParity%",
            "- Routing parity: $routingParity%",
            "- Validation pass: $validationPass",
            "- Alias leakage pass: $aliasPass"
        ) | Set-Content -LiteralPath $summaryPath -Encoding utf8

        if (-not $KeepWorkspaces) {
            Remove-KnowledgePackDirectorySafe -Root ([System.IO.Path]::GetTempPath()) -Path $workRoot
            $result.facts.work_root_removed = $true
        } else {
            $result.facts.work_root_removed = $false
        }
        $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $reportPath -Encoding utf8
    }
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
} finally {
    if ($result.status -eq "blocked" -and -not $KeepWorkspaces -and [string]::IsNullOrWhiteSpace($OutputDir) -and -not [string]::IsNullOrWhiteSpace($workRoot) -and (Test-Path -LiteralPath $workRoot)) {
        try { Remove-KnowledgePackDirectorySafe -Root ([System.IO.Path]::GetTempPath()) -Path $workRoot } catch {}
    }
}

if ($Json) { Write-KnowledgePackJson $result } else { $result }
