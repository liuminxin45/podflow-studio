param(
    [string]$RepoRoot = "",
    [string]$OutputDir = "",
    [switch]$ExportPack,
    [string]$PackId = "",
    [string]$PackPath = "",
    [string]$PackOutputDir = "",
    [ValidateSet("overlay-active-knowledge", "replace-active-knowledge")]
    [string]$ComposeStrategy = "overlay-active-knowledge",
    [switch]$IncludeProfiles,
    [switch]$ApplyProfiles,
    [switch]$Apply,
    [switch]$Force,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

function Resolve-Root {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        return (Get-Location).Path
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function ConvertTo-KnowledgeSlug {
    param([string]$Value)
    $slug = ($Value.ToLowerInvariant() -replace "[^a-z0-9]+", "-").Trim("-")
    if ([string]::IsNullOrWhiteSpace($slug)) { return "repository" }
    return $slug
}

function ConvertTo-YamlString {
    param([string]$Value)
    return '"' + ($Value -replace '\\', '\\' -replace '"', '\"') + '"'
}

function Write-Utf8File {
    param([string]$Path, [string[]]$Lines)
    $dir = Split-Path -Parent $Path
    if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $Lines | Set-Content -LiteralPath $Path -Encoding utf8
}

function Get-MarkerTags {
    param([array]$Markers)
    $tags = @($Markers | ForEach-Object { $_.kind } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    if ($tags.Count -eq 0) { return @("repository") }
    return $tags
}

function Write-EvaluationScenarios {
    param(
        [string]$Path,
        [array]$Repositories
    )
    $scenarios = @()
    foreach ($repo in @($Repositories | Select-Object -First 5)) {
        $slug = ConvertTo-KnowledgeSlug -Value $repo.name
        $tags = @(Get-MarkerTags -Markers @($repo.markers))
        $scenarios += [ordered]@{
            name = "$slug-generated-routing"
            stage = "plan"
            affected_repositories = @($repo.name)
            risk_flags = @("generated-knowledge")
            capability_tags = $tags
            request_summary = "route generated knowledge for $($repo.name)"
        }
    }

    if ($scenarios.Count -eq 0) {
        $scenarios += [ordered]@{
            name = "workspace-generated-routing"
            stage = "plan"
            affected_repositories = @()
            risk_flags = @("generated-knowledge")
            capability_tags = @("workspace")
            request_summary = "route generated workspace knowledge"
        }
    }

    $dir = Split-Path -Parent $Path
    if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    ConvertTo-Json -InputObject @($scenarios) -Depth 8 | Set-Content -LiteralPath $Path -Encoding utf8
}

$root = Resolve-Root -Path $RepoRoot
if (-not [string]::IsNullOrWhiteSpace($PackOutputDir)) {
    $ExportPack = $true
}

if (-not [string]::IsNullOrWhiteSpace($PackPath)) {
    $result = New-KnowledgePackResult "bootstrap-knowledge"
    $result.facts.mode = "mount-pack"
    $result.facts.repo_root = $root
    $result.facts.output_dir = $null
    $result.facts.draft_knowledge_dir = $null
    $result.facts.ai_review_dir = $null
    $result.facts.generated_review_packet = $false
    $result.facts.applied = $true
    $result.facts.export_pack = $false

    if ($ExportPack) {
        Set-KnowledgePackBlocked $result "PackPath mounts an existing pack; do not combine it with ExportPack or PackOutputDir."
    } else {
        $resolvedPackPath = Resolve-KnowledgePackPath -Path $PackPath -Base $root
        $result.facts.pack_path = $resolvedPackPath
        $applyRaw = @(& "$PSScriptRoot\apply-knowledge-pack.ps1" `
            -RepoRoot $root `
            -PackPath $resolvedPackPath `
            -ApplyProfiles:$ApplyProfiles `
            -Force:$Force `
            -Json)
        $applyText = ($applyRaw | Out-String).Trim()
        $jsonStart = $applyText.IndexOf("{")
        if ($jsonStart -gt 0) {
            $result.unknowns += "Ignored non-JSON output before pack apply result."
            $applyText = $applyText.Substring($jsonStart)
        }
        try {
            $applyResult = $applyText | ConvertFrom-Json
        } catch {
            $applyResult = [PSCustomObject]@{
                tool = "apply-knowledge-pack"
                status = "blocked"
                facts = [ordered]@{ raw_output = $applyText }
                blockers = @("failed to parse apply output: $($_.Exception.Message)")
                unknowns = @()
                hints = @()
            }
        }

        $result.facts.applied_pack = $applyResult
        if ($applyResult.status -eq "blocked") {
            Set-KnowledgePackBlocked $result ("pack apply failed: " + (($applyResult.blockers) -join "; "))
        } else {
            $result.hints += "Pack mounted as the active ai/knowledge layer."
            $result.hints += "No AI review packet was generated because PackPath uses existing knowledge."
        }
    }

    if ($Json) {
        Write-KnowledgePackJson $result
    } else {
        if ($result.status -eq "ok") {
            "mounted pack: $($result.facts.pack_path)"
        } else {
            "blocked: $(($result.blockers) -join '; ')"
        }
    }
    return
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $root ".specify\knowledge-bootstrap"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$collector = Join-Path $PSScriptRoot "collect-knowledge-bootstrap-facts.ps1"
$raw = & $collector -RepoRoot $root -OutputDir $OutputDir -Json
$facts = $raw | ConvertFrom-Json

$draftRoot = Join-Path $OutputDir "draft\ai\knowledge"
$repoDir = Join-Path $draftRoot "repositories"
$workspaceDir = Join-Path $draftRoot "workspace"
$buildDir = Join-Path $draftRoot "build"
$reviewDir = Join-Path $OutputDir "ai-review"
$evaluationFile = Join-Path $OutputDir "evaluation\scenarios.json"
New-Item -ItemType Directory -Force -Path $repoDir, $workspaceDir, $buildDir, $reviewDir | Out-Null

$index = @(
    'schema_version: "1.1"',
    'purpose: "Workspace-specific generated knowledge index. Review before promotion."',
    'policy:',
    '  default_context: false',
    '  no_full_text_search_required: true',
    '  repository_map_authority: ".specify/memory/repository-map.md"',
    '  selection_rule: "Match affected repositories, risk flags, capability tags, stage, and explicit task terms; read only the smallest useful guide set."',
    '  max_selected_guides: 3',
    '  default_authority: "generated"',
    '  authority_levels: [generated, reviewed, authoritative]',
    '',
    'workspace:',
    '  overview:',
    '    guide: "workspace/overview.md"',
    '    authority: "generated"',
    '    confidence: "medium"',
    '    tags: ["workspace", "overview", "bootstrap"]',
    '',
    'repositories:'
)

foreach ($repo in @($facts.facts.repositories)) {
    $slug = ConvertTo-KnowledgeSlug -Value $repo.name
    $index += "  $($repo.name):"
    $index += "    guide: `"repositories/$slug.md`""
    $index += '    authority: "generated"'
    $index += '    confidence: "low"'
    $index += '    tags: ["repository", "bootstrap"]'

    $repoLines = @(
        "---",
        "authority: generated",
        "confidence: low",
        "source_refs:",
        "  - .specify/knowledge-bootstrap/facts.json",
        "last_verified: null",
        "---",
        "",
        "# $($repo.name)",
        "",
        "- Path: $($repo.path)",
        "- Required: $($repo.required)",
        "- Exists: $($repo.exists)",
        ""
    )
    $repoLines += "## Detected Markers"
    if (@($repo.markers).Count -gt 0) {
        foreach ($marker in @($repo.markers)) {
            $repoLines += "- $($marker.marker) ($($marker.kind))"
        }
    } else {
        $repoLines += "- none"
    }
    $repoLines += ""
    $repoLines += "## Candidate Commands"
    if (@($repo.candidate_commands).Count -gt 0) {
        foreach ($command in @($repo.candidate_commands)) {
            $repoLines += ("- " + [char]96 + $command + [char]96)
        }
    } else {
        $repoLines += "- none detected"
    }
    $repoLines += ""
    $repoLines += "## Review Checklist"
    $repoLines += '- Confirm ownership against `.specify/memory/repository-map.md`.'
    $repoLines += "- Confirm commands against package files, CI, or maintainer evidence."
    $repoLines += "- Add public contracts, runtime notes, and validation gaps only after source review."
    Write-Utf8File -Path (Join-Path $repoDir "$slug.md") -Lines $repoLines
}

$index += ''
$index += 'build:'
$index += '  command-matrix:'
$index += '    guide: "build/command-matrix.yml"'
$index += '    authority: "generated"'
$index += '    confidence: "low"'
$index += '    tags: ["build", "test", "command"]'
$index += '  validation-capabilities:'
$index += '    guide: "build/validation-capabilities.yml"'
$index += '    authority: "generated"'
$index += '    confidence: "low"'
$index += '    tags: ["validation", "test", "api", "e2e"]'
Write-Utf8File -Path (Join-Path $draftRoot "index.yml") -Lines $index

Write-Utf8File -Path (Join-Path $workspaceDir "overview.md") -Lines @(
    "---",
    "authority: generated",
    "confidence: medium",
    "source_refs:",
    "  - .specify/knowledge-bootstrap/facts.json",
    "last_verified: null",
    "---",
    "",
    "# Workspace Overview",
    "",
    "- Workspace root: .",
    "- Repository count: $($facts.facts.repository_count)",
    '- Source of truth for ownership: `.specify/memory/repository-map.md`',
    "",
    "This is a generated draft. Review before promotion."
)

$commandLines = @(
    'schema_version: "1.0"',
    "authority: generated",
    "confidence: low",
    "source_refs:",
    "  - .specify/knowledge-bootstrap/facts.json",
    "",
    "repositories:"
)
foreach ($repo in @($facts.facts.repositories)) {
    $commandLines += "  $($repo.name):"
    if (@($repo.candidate_commands).Count -gt 0) {
        foreach ($command in @($repo.candidate_commands)) {
            $commandLines += "    - command: $(ConvertTo-YamlString -Value $command)"
            $commandLines += "      evidence: $(ConvertTo-YamlString -Value $repo.path)"
        }
    } else {
        $commandLines += '    - command: ""'
        $commandLines += '      evidence: "no command marker detected"'
    }
}
Write-Utf8File -Path (Join-Path $buildDir "command-matrix.yml") -Lines $commandLines

Write-Utf8File -Path (Join-Path $buildDir "validation-capabilities.yml") -Lines @(
    'schema_version: "1.0"',
    "authority: generated",
    "confidence: low",
    "source_refs:",
    "  - .specify/knowledge-bootstrap/facts.json",
    "",
    "capabilities:",
    "  unit:",
    "    status: unknown",
    "  api:",
    "    status: unknown",
    "  e2e:",
    "    status: unknown",
    "",
    "notes:",
    '  - "Inspect tests, contracts, and runtime automation before marking a capability supported or N/A."'
)

$prompt = @(
    "# Knowledge Bootstrap AI Review Prompt",
    "",
    'Use `.specify/knowledge-bootstrap/facts.json` and targeted source reads to improve the draft under `.specify/knowledge-bootstrap/draft/ai/knowledge`.',
    "",
    "Rules:",
    '- Keep all new guides at `authority: generated` unless a human explicitly approves promotion.',
    '- Do not invent ownership; use `.specify/memory/repository-map.md` when available.',
    "- Do not full-text scan the entire workspace by default.",
    "- Preserve source references for every claim that survives into the draft.",
    "- Keep machine-specific absolute paths out of long-term knowledge."
)
Write-Utf8File -Path (Join-Path $OutputDir "bootstrap-prompt.md") -Lines $prompt

$sourceReadPlan = @(
    "# AI Source Read Plan",
    "",
    "Use this as a bounded read plan. Do not full-text scan the whole workspace by default.",
    "",
    "## Required First Reads",
    "",
    "- .specify/workspace.yml when present",
    "- .specify/memory/repository-map.md when present",
    "- .specify/knowledge-bootstrap/facts.json",
    "- .specify/knowledge-bootstrap/inventory.md",
    "",
    "## Repository Reads"
)
foreach ($repo in @($facts.facts.repositories)) {
    $sourceReadPlan += ""
    $sourceReadPlan += "### $($repo.name)"
    $sourceReadPlan += "- Draft guide: .specify/knowledge-bootstrap/draft/ai/knowledge/repositories/$(ConvertTo-KnowledgeSlug -Value $repo.name).md"
    $sourceReadPlan += "- Start from marker files only:"
    if (@($repo.markers).Count -gt 0) {
        foreach ($marker in @($repo.markers)) {
            $sourceReadPlan += "  - $($repo.path)/$($marker.marker)"
        }
    } else {
        $sourceReadPlan += "  - no marker file detected; inspect README, manifest, or test roots only if present"
    }
    $sourceReadPlan += "- Confirm candidate commands before moving confidence above low."
}
Write-Utf8File -Path (Join-Path $reviewDir "source-read-plan.md") -Lines $sourceReadPlan

$reviewBrief = @(
    "# AI Knowledge Review Brief",
    "",
    "Goal: turn deterministic inventory into useful generated knowledge without inventing project facts.",
    "",
    "Inputs:",
    "- facts: .specify/knowledge-bootstrap/facts.json",
    "- inventory: .specify/knowledge-bootstrap/inventory.md",
    "- draft knowledge: .specify/knowledge-bootstrap/draft/ai/knowledge/",
    "- source read plan: .specify/knowledge-bootstrap/ai-review/source-read-plan.md",
    "",
    "AI responsibilities:",
    "- read only targeted marker/source files needed to improve a concrete guide",
    "- preserve `authority: generated` unless a human explicitly approves promotion",
    "- add `source_refs` for every durable claim",
    "- keep paths relative and replace local roots with placeholders",
    "- leave unknown ownership, APIs, runtime behavior, or validation support as unknown instead of guessing",
    "",
    "After review:",
    "- run `validate-knowledge-index` against the draft or applied workspace",
    "- export a pack with bootstrap-knowledge.ps1 -ExportPack or export-knowledge-pack.ps1",
    "- apply the pack only after explicit user intent"
)
Write-Utf8File -Path (Join-Path $reviewDir "review-brief.md") -Lines $reviewBrief

$claims = @()
foreach ($repo in @($facts.facts.repositories)) {
    $claims += [ordered]@{
        id = "repo-" + (ConvertTo-KnowledgeSlug -Value $repo.name)
        target = "repositories/" + (ConvertTo-KnowledgeSlug -Value $repo.name) + ".md"
        status = "needs_ai_review"
        confidence = "low"
        source_refs = @(".specify/knowledge-bootstrap/facts.json", ".specify/knowledge-bootstrap/inventory.md")
        ai_task = "Confirm repository role, commands, public contracts, runtime notes, and validation support from targeted source reads."
    }
}
$claimLedger = [ordered]@{
    schema_version = "1.0"
    generated_by = "bootstrap-knowledge"
    status = "needs_ai_review"
    draft_knowledge = ".specify/knowledge-bootstrap/draft/ai/knowledge"
    claims = $claims
}
$claimLedger | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reviewDir "claim-ledger.json") -Encoding utf8

Write-EvaluationScenarios -Path $evaluationFile -Repositories @($facts.facts.repositories)

$exportResult = $null
$exportUnknowns = @()
if ($ExportPack) {
    if ([string]::IsNullOrWhiteSpace($PackId)) {
        $PackId = ConvertTo-KnowledgePackSlug -Value (Split-Path -Leaf $root)
    } else {
        $PackId = ConvertTo-KnowledgePackSlug -Value $PackId
    }
    if ([string]::IsNullOrWhiteSpace($PackOutputDir)) {
        $PackOutputDir = Join-Path $OutputDir ("pack\" + $PackId)
    }

    $workspaceFile = ""
    $repositoryMap = ""
    if ($IncludeProfiles) {
        $candidateWorkspaceFile = Join-Path $root ".specify\workspace.yml"
        $candidateRepositoryMap = Join-Path $root ".specify\memory\repository-map.md"
        if (Test-Path -LiteralPath $candidateWorkspaceFile -PathType Leaf) { $workspaceFile = $candidateWorkspaceFile }
        if (Test-Path -LiteralPath $candidateRepositoryMap -PathType Leaf) { $repositoryMap = $candidateRepositoryMap }
    }

    if ($IncludeProfiles) {
        $exportRaw = @(& "$PSScriptRoot\export-knowledge-pack.ps1" `
            -SourceKnowledgeDir $draftRoot `
            -WorkspaceFile $workspaceFile `
            -RepositoryMap $repositoryMap `
            -PackId $PackId `
            -OutputDir $PackOutputDir `
            -ComposeStrategy $ComposeStrategy `
            -EvaluationScenariosFile $evaluationFile `
            -Force `
            -Json)
    } else {
        $exportRaw = @(& "$PSScriptRoot\export-knowledge-pack.ps1" `
            -SourceKnowledgeDir $draftRoot `
            -PackId $PackId `
            -OutputDir $PackOutputDir `
            -ComposeStrategy $ComposeStrategy `
            -EvaluationScenariosFile $evaluationFile `
            -Force `
            -Json)
    }
    $exportText = ($exportRaw | Out-String).Trim()
    $jsonStart = $exportText.IndexOf("{")
    if ($jsonStart -gt 0) {
        $exportUnknowns += "Ignored non-JSON output before export result."
        $exportText = $exportText.Substring($jsonStart)
    }
    try {
        $exportResult = $exportText | ConvertFrom-Json
    } catch {
        $exportResult = [PSCustomObject]@{
            tool = "export-knowledge-pack"
            status = "blocked"
            facts = [ordered]@{ raw_output = $exportText }
            blockers = @("failed to parse export output: $($_.Exception.Message)")
            unknowns = @()
            hints = @()
        }
    }
}

if ($Apply) {
    $target = Join-Path $root "ai"
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -LiteralPath (Join-Path $OutputDir "draft\ai\knowledge") -Destination $target -Recurse -Force
}

$result = [ordered]@{
    tool = "bootstrap-knowledge"
    status = "ok"
    facts = [ordered]@{
        mode = "generated-draft"
        output_dir = $OutputDir
        draft_knowledge_dir = $draftRoot
        prompt = (Join-Path $OutputDir "bootstrap-prompt.md")
        ai_review_dir = $reviewDir
        generated_review_packet = $true
        source_read_plan = (Join-Path $reviewDir "source-read-plan.md")
        claim_ledger = (Join-Path $reviewDir "claim-ledger.json")
        evaluation_scenarios = $evaluationFile
        applied = [bool]$Apply
        repository_count = $facts.facts.repository_count
        export_pack = [bool]$ExportPack
        pack = $exportResult
    }
    blockers = @()
    unknowns = @($exportUnknowns)
    hints = @(
        "Review generated guides before promotion.",
        "Run validate-knowledge-index after applying drafts.",
        "Use the AI review packet before raising confidence or authority."
    )
}

if ($exportResult -and $exportResult.status -eq "blocked") {
    $result.status = "blocked"
    $result.blockers += ("pack export failed: " + (($exportResult.blockers) -join "; "))
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
} else {
    "draft: $draftRoot"
    "prompt: $(Join-Path $OutputDir "bootstrap-prompt.md")"
}
