param(
    [string]$SourceKnowledgeDir = "",
    [string]$WorkspaceFile = "",
    [string]$RepositoryMap = "",
    [string]$PackId = "",
    [string]$Title = "",
    [string]$Version = "0.1.0",
    [string]$OutputDir = "",
    [ValidateSet("overlay-active-knowledge", "replace-active-knowledge")]
    [string]$ComposeStrategy = "overlay-active-knowledge",
    [ValidateSet("none", "full-snapshot", "delta-overlay", "promote-reviewed")]
    [string]$RepackMode = "none",
    [string]$SkillsDir = "",
    [string]$ToolsDir = "",
    [string]$ScriptsDir = "",
    [string]$CommandsDir = "",
    [string]$PromptsDir = "",
    [string]$ResourcesDir = "",
    [string]$TemplatesDir = "",
    [string]$EvaluationScenariosFile = "",
    [string[]]$ToolAlias = @(),
    [switch]$Force,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

$result = New-KnowledgePackResult "export-knowledge-pack"

try {
    $source = Resolve-KnowledgePackPath -Path $SourceKnowledgeDir
    if ([string]::IsNullOrWhiteSpace($source)) {
        Set-KnowledgePackBlocked $result "SourceKnowledgeDir is required"
    } elseif (-not (Test-Path -LiteralPath (Join-Path $source "index.yml") -PathType Leaf)) {
        Set-KnowledgePackBlocked $result "SourceKnowledgeDir must contain index.yml: $source"
    }

    if ([string]::IsNullOrWhiteSpace($PackId)) {
        $PackId = ConvertTo-KnowledgePackSlug -Value (Split-Path -Leaf (Split-Path -Parent $source))
    } else {
        $PackId = ConvertTo-KnowledgePackSlug -Value $PackId
    }
    if ([string]::IsNullOrWhiteSpace($Title)) { $Title = $PackId }
    if ([string]::IsNullOrWhiteSpace($OutputDir)) {
        $OutputDir = Join-Path (Get-Location).Path $PackId
    }
    $out = Resolve-KnowledgePackPath -Path $OutputDir

    if ($result.status -ne "blocked") {
        if ((Test-Path -LiteralPath $out) -and -not $Force) {
            Set-KnowledgePackBlocked $result "OutputDir already exists; pass -Force to replace: $out"
        } else {
            if (Test-Path -LiteralPath $out) {
                Remove-KnowledgePackDirectorySafe -Root (Split-Path -Parent $out) -Path $out
            }
            New-Item -ItemType Directory -Force -Path $out | Out-Null
            Copy-KnowledgePackDirectory -Source $source -Destination (Join-Path $out "ai\knowledge")
            $capabilityLayers = [ordered]@{
                knowledge = $true
                skills = $false
                tools = $false
                scripts = $false
                commands = $false
                prompts = $false
                resources = $false
                templates = $false
            }

            $layerSources = [ordered]@{
                skills = $SkillsDir
                tools = $ToolsDir
                scripts = $ScriptsDir
                commands = $CommandsDir
                prompts = $PromptsDir
                resources = $ResourcesDir
                templates = $TemplatesDir
            }
            foreach ($layerName in $layerSources.Keys) {
                $layerSource = $layerSources[$layerName]
                if ([string]::IsNullOrWhiteSpace($layerSource)) { continue }
                $resolvedLayerSource = Resolve-KnowledgePackPath -Path $layerSource
                if (Test-Path -LiteralPath $resolvedLayerSource -PathType Container) {
                    Copy-KnowledgePackDirectory -Source $resolvedLayerSource -Destination (Join-Path $out $layerName)
                    $capabilityLayers[$layerName] = $true
                } else {
                    $result.unknowns += "Capability layer source not found: ${layerName}=$resolvedLayerSource"
                }
            }

            $profiles = Join-Path $out "profiles"
            New-Item -ItemType Directory -Force -Path $profiles | Out-Null
            $hasWorkspaceProfile = $false
            $hasRepositoryMapProfile = $false
            if (-not [string]::IsNullOrWhiteSpace($WorkspaceFile)) {
                $workspace = Resolve-KnowledgePackPath -Path $WorkspaceFile
                if (Test-Path -LiteralPath $workspace -PathType Leaf) {
                    Copy-Item -LiteralPath $workspace -Destination (Join-Path $profiles "workspace.yml") -Force
                    $hasWorkspaceProfile = $true
                } else {
                    $result.unknowns += "WorkspaceFile not found: $workspace"
                }
            }
            if (-not [string]::IsNullOrWhiteSpace($RepositoryMap)) {
                $map = Resolve-KnowledgePackPath -Path $RepositoryMap
                if (Test-Path -LiteralPath $map -PathType Leaf) {
                    Copy-Item -LiteralPath $map -Destination (Join-Path $profiles "repository-map.md") -Force
                    $hasRepositoryMapProfile = $true
                } else {
                    $result.unknowns += "RepositoryMap not found: $map"
                }
            }

            if ($ToolAlias.Count -gt 0) {
                $aliasDir = Join-Path $out "aliases"
                New-Item -ItemType Directory -Force -Path $aliasDir | Out-Null
                $lines = @('schema_version: "1.0"', "aliases:")
                foreach ($alias in $ToolAlias) {
                    if ($alias -notmatch "^([^=]+)=(.+)$") {
                        $result.unknowns += "Ignored malformed ToolAlias: $alias"
                        continue
                    }
                    $from = $Matches[1].Trim()
                    $to = $Matches[2].Trim()
                    $lines += "  ${from}: $to"
                }
                $lines | Set-Content -LiteralPath (Join-Path $aliasDir "tools.yml") -Encoding utf8
            }

            $hasEvaluationScenarios = $false
            if (-not [string]::IsNullOrWhiteSpace($EvaluationScenariosFile)) {
                $scenarios = Resolve-KnowledgePackPath -Path $EvaluationScenariosFile
                if (Test-Path -LiteralPath $scenarios -PathType Leaf) {
                    $evaluationDir = Join-Path $out "evaluation"
                    New-Item -ItemType Directory -Force -Path $evaluationDir | Out-Null
                    Copy-Item -LiteralPath $scenarios -Destination (Join-Path $evaluationDir "scenarios.json") -Force
                    $hasEvaluationScenarios = $true
                } else {
                    $result.unknowns += "EvaluationScenariosFile not found: $scenarios"
                }
            }

            $manifest = @(
                'schema_version: "1.0"',
                "id: `"$PackId`"",
                "title: `"$Title`"",
                "version: `"$Version`"",
                'kind: "capability-pack"',
                'description: "Portable Spec Kit capability pack. Install and compose knowledge, skills, tools, scripts, prompts, resources, and profiles into a workspace-local capability layer."',
                "provides:",
                "  knowledge: true",
                "  skills: $($capabilityLayers['skills'].ToString().ToLowerInvariant())",
                "  tools: $($capabilityLayers['tools'].ToString().ToLowerInvariant())",
                "  scripts: $($capabilityLayers['scripts'].ToString().ToLowerInvariant())",
                "  commands: $($capabilityLayers['commands'].ToString().ToLowerInvariant())",
                "  prompts: $($capabilityLayers['prompts'].ToString().ToLowerInvariant())",
                "  resources: $($capabilityLayers['resources'].ToString().ToLowerInvariant())",
                "  templates: $($capabilityLayers['templates'].ToString().ToLowerInvariant())",
                "  workspace_profile: $($hasWorkspaceProfile.ToString().ToLowerInvariant())",
                "  repository_map_profile: $($hasRepositoryMapProfile.ToString().ToLowerInvariant())",
                "  command_aliases: $((($ToolAlias.Count -gt 0)).ToString().ToLowerInvariant())",
                "  evaluation_scenarios: $($hasEvaluationScenarios.ToString().ToLowerInvariant())",
                "activation:",
                "  mode: `"$(@{ 'overlay-active-knowledge' = 'overlay'; 'replace-active-knowledge' = 'replace' }[$ComposeStrategy])`"",
                '  progressive_disclosure: true',
                '  auto_run_scripts: false',
                "  skills: `"namespaced`"",
                "  tools: `"namespaced-overlay`"",
                "  scripts: `"namespaced-bin`"",
                "authority:",
                '  default: "generated"',
                "  source_refs_required: false",
                "ancestry:",
                "  repack_mode: `"$RepackMode`"",
                "  base_packs: []",
                "compose:",
                "  strategy: `"$ComposeStrategy`"",
                "  apply_tool_aliases: true"
            )
            $manifestPath = Join-Path $out "knowledge-pack.yml"
            $manifest | Set-Content -LiteralPath $manifestPath -Encoding utf8
            Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $out "pack.yml") -Force
            Write-KnowledgePackCapabilityIndex -PackRoot $out -Layers $capabilityLayers -PackId $PackId -Version $Version -RepackMode $RepackMode

            $validationRaw = & "$PSScriptRoot\validate-knowledge-pack.ps1" -PackRoot $out -Json
            $validation = $validationRaw | ConvertFrom-Json
            if ($validation.status -eq "blocked") {
                Set-KnowledgePackBlocked $result ("exported pack failed validation: " + (($validation.blockers) -join "; "))
            }

            $result.facts.pack_root = $out
            $result.facts.pack_id = $PackId
            $result.facts.version = $Version
            $result.facts.knowledge_dir = Join-Path $out "ai\knowledge"
            $result.facts.workspace_profile = $hasWorkspaceProfile
            $result.facts.repository_map_profile = $hasRepositoryMapProfile
            $result.facts.evaluation_scenarios = $hasEvaluationScenarios
            $result.facts.capability_layers = $capabilityLayers
            $result.facts.capability_index = Join-Path $out "capabilities\index.yml"
            $result.facts.validation = $validation
            $result.hints += "Install this pack with install-knowledge-pack.ps1, then materialize it with apply-knowledge-pack.ps1."
        }
    }
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
}

if ($Json) { Write-KnowledgePackJson $result } else { $result }
