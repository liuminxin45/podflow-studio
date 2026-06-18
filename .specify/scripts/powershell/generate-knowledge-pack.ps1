param(
    [string]$RepoRoot = "",
    [string]$OutputDir = "",
    [string]$PackId = "",
    [string]$PackOutputDir = "",
    [string]$ReviewedKnowledgeDir = "",
    [ValidateSet("overlay-active-knowledge", "replace-active-knowledge")]
    [string]$ComposeStrategy = "overlay-active-knowledge",
    [int]$MinimumQualityScore = 70,
    [switch]$IncludeProfiles,
    [switch]$Force,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

function Resolve-GeneratorRoot {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        return (Get-Location).Path
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Get-GeneratorRelativePath {
    param([string]$Root, [string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return "" }
    try {
        $rootUri = [System.Uri](([System.IO.Path]::GetFullPath($Root)).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar)
        $pathUri = [System.Uri]([System.IO.Path]::GetFullPath($Path))
        $relative = [System.Uri]::UnescapeDataString($rootUri.MakeRelativeUri($pathUri).ToString()).Replace('/', '\')
        if ($relative -and -not $relative.StartsWith("..")) { return $relative }
    } catch {
        return $Path
    }
    return $Path
}

function Write-GeneratorUtf8 {
    param([string]$Path, [string[]]$Lines)
    $dir = Split-Path -Parent $Path
    if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $Lines | Set-Content -LiteralPath $Path -Encoding utf8
}

function ConvertFrom-GeneratorJson {
    param(
        [string[]]$Raw,
        [string]$ToolName
    )
    $text = ($Raw | Out-String).Trim()
    $jsonStart = $text.IndexOf("{")
    if ($jsonStart -gt 0) {
        $text = $text.Substring($jsonStart)
    }
    try {
        return ($text | ConvertFrom-Json)
    } catch {
        return [PSCustomObject]@{
            tool = $ToolName
            status = "blocked"
            facts = [ordered]@{ raw_output = $text }
            blockers = @("failed to parse $ToolName output: $($_.Exception.Message)")
            unknowns = @()
            hints = @()
        }
    }
}

function Get-GeneratorRepositoryNames {
    param($BootstrapResult)
    $names = @()
    if ($BootstrapResult -and $BootstrapResult.facts -and $BootstrapResult.facts.repository_count -gt 0) {
        $factsPath = Join-Path (Split-Path -Parent $BootstrapResult.facts.draft_knowledge_dir) "..\..\facts.json"
        $factsPath = [System.IO.Path]::GetFullPath($factsPath)
        if (Test-Path -LiteralPath $factsPath -PathType Leaf) {
            try {
                $factsPayload = Get-Content -LiteralPath $factsPath -Raw | ConvertFrom-Json
                $names = @($factsPayload.facts.repositories | ForEach-Object { $_.name })
            } catch {
                $names = @()
            }
        }
    }
    return @($names | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

$result = New-KnowledgePackResult "generate-knowledge-pack"

try {
    $root = Resolve-GeneratorRoot -Path $RepoRoot
    if ([string]::IsNullOrWhiteSpace($OutputDir)) {
        $OutputDir = Join-Path $root ".specify\knowledge-pack-generation"
    } else {
        $OutputDir = Resolve-KnowledgePackPath -Path $OutputDir -Base $root
    }
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

    if ([string]::IsNullOrWhiteSpace($PackId)) {
        $PackId = ConvertTo-KnowledgePackSlug -Value ((Split-Path -Leaf $root) + "-knowledge-pack")
    } else {
        $PackId = ConvertTo-KnowledgePackSlug -Value $PackId
    }

    if ([string]::IsNullOrWhiteSpace($PackOutputDir)) {
        $PackOutputDir = Join-Path $OutputDir ("pack\" + $PackId)
    } else {
        $PackOutputDir = Resolve-KnowledgePackPath -Path $PackOutputDir -Base $root
    }

    $bootstrapDir = Join-Path $OutputDir "bootstrap"
    $generatorDir = Join-Path $OutputDir "ai-pack-generator"
    $synthesisKnowledgeDir = Join-Path $OutputDir "ai-synthesis\ai\knowledge"
    New-Item -ItemType Directory -Force -Path $bootstrapDir, $generatorDir | Out-Null

    $bootstrapRaw = @(& "$PSScriptRoot\bootstrap-knowledge.ps1" `
        -RepoRoot $root `
        -OutputDir $bootstrapDir `
        -Json)
    $bootstrapResult = ConvertFrom-GeneratorJson -Raw $bootstrapRaw -ToolName "bootstrap-knowledge"
    if ($bootstrapResult.status -eq "blocked") {
        Set-KnowledgePackBlocked $result ("bootstrap failed: " + (($bootstrapResult.blockers) -join "; "))
    }

    if ($result.status -ne "blocked") {
        $draftKnowledgeDir = $bootstrapResult.facts.draft_knowledge_dir
        if (-not (Test-Path -LiteralPath (Join-Path $draftKnowledgeDir "index.yml") -PathType Leaf)) {
            Set-KnowledgePackBlocked $result "bootstrap draft knowledge is missing index.yml: $draftKnowledgeDir"
        } elseif (-not (Test-Path -LiteralPath (Join-Path $synthesisKnowledgeDir "index.yml") -PathType Leaf)) {
            Copy-KnowledgePackDirectory -Source $draftKnowledgeDir -Destination $synthesisKnowledgeDir
        } else {
            $result.unknowns += "Existing AI synthesis workspace preserved: $synthesisKnowledgeDir"
        }
    }

    if ($result.status -ne "blocked") {
        $sourceKnowledgeDir = $synthesisKnowledgeDir
        $aiSynthesisRequired = $true
        if (-not [string]::IsNullOrWhiteSpace($ReviewedKnowledgeDir)) {
            $sourceKnowledgeDir = Resolve-KnowledgePackPath -Path $ReviewedKnowledgeDir -Base $root
            $aiSynthesisRequired = $false
        }
        if (-not (Test-Path -LiteralPath (Join-Path $sourceKnowledgeDir "index.yml") -PathType Leaf)) {
            Set-KnowledgePackBlocked $result "knowledge source for pack export must contain index.yml: $sourceKnowledgeDir"
        }
    }

    $contractPath = Join-Path $generatorDir "generation-contract.json"
    $synthesisPlanPath = Join-Path $generatorDir "ai-synthesis-plan.md"
    $sourceQueuePath = Join-Path $generatorDir "source-read-queue.md"
    $qualityDir = Join-Path $OutputDir "quality"
    $equivalenceDir = Join-Path $OutputDir "equivalence"

    if ($result.status -ne "blocked") {
        $repositoryNames = @(Get-GeneratorRepositoryNames -BootstrapResult $bootstrapResult)
        $status = if ($aiSynthesisRequired) { "needs_ai_synthesis" } else { "ai_synthesis_provided" }
        $contract = [ordered]@{
            schema_version = "1.0"
            mode = "ai-assisted-pack-generation"
            status = $status
            target_pack_id = $PackId
            repo_root = "."
            bootstrap = [ordered]@{
                output_dir = (Get-GeneratorRelativePath -Root $root -Path $bootstrapDir)
                facts = (Get-GeneratorRelativePath -Root $root -Path (Join-Path $bootstrapDir "facts.json"))
                inventory = (Get-GeneratorRelativePath -Root $root -Path (Join-Path $bootstrapDir "inventory.md"))
                review_brief = (Get-GeneratorRelativePath -Root $root -Path (Join-Path $bootstrapDir "ai-review\review-brief.md"))
                source_read_plan = (Get-GeneratorRelativePath -Root $root -Path (Join-Path $bootstrapDir "ai-review\source-read-plan.md"))
                claim_ledger = (Get-GeneratorRelativePath -Root $root -Path (Join-Path $bootstrapDir "ai-review\claim-ledger.json"))
            }
            ai_synthesis_workspace = [ordered]@{
                knowledge_dir = (Get-GeneratorRelativePath -Root $root -Path $synthesisKnowledgeDir)
                source_knowledge_dir = (Get-GeneratorRelativePath -Root $root -Path $sourceKnowledgeDir)
                pack_output_dir = (Get-GeneratorRelativePath -Root $root -Path $PackOutputDir)
            }
            repository_candidates = $repositoryNames
            ai_responsibilities = @(
                "perform targeted source reads from the bootstrap source-read plan",
                "turn deterministic inventory into layered knowledge guides",
                "separate workspace, repository, build, validation, and domain facts",
                "remove noisy or duplicated facts that do not help task routing",
                "preserve source_refs for every durable project claim",
                "keep unknown ownership, runtime behavior, and validation support explicit",
                "close the quality loop by fixing source coverage and claim verification gaps"
            )
            guardrails = @(
                "do not full-text scan the whole workspace by default",
                "do not store machine-specific absolute paths in long-term knowledge",
                "do not raise authority above generated without human approval",
                "do not infer repository ownership when repository-map exists"
            )
            rerun_after_ai = [ordered]@{
                script = "scripts/powershell/generate-knowledge-pack.ps1"
                required_args = @("-RepoRoot", ".", "-PackId", $PackId, "-ReviewedKnowledgeDir", (Get-GeneratorRelativePath -Root $root -Path $synthesisKnowledgeDir), "-MinimumQualityScore", "$MinimumQualityScore", "-Json")
            }
        }
        $contract | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $contractPath -Encoding utf8

        Write-GeneratorUtf8 -Path $synthesisPlanPath -Lines @(
            "# AI Knowledge Pack Synthesis Plan",
            "",
            "Goal: generate a portable Spec Kit knowledge pack for an arbitrary workspace.",
            "",
            "AI responsibilities:",
            "- Read the generation contract and bootstrap review packet first.",
            "- Use the source-read plan as a bounded queue; do not full-text scan the whole workspace by default.",
            "- Edit the AI synthesis workspace under $($contract.ai_synthesis_workspace.knowledge_dir).",
            "- Preserve the knowledge framework: `index.yml`, selected guides, authority, confidence, tags, and source references.",
            "- Prefer layered knowledge over long manuals: workspace overview, repository guides, build command matrix, validation capabilities, and domain guides only when source evidence supports them.",
            "- Run the quality loop and fix source coverage, unresolved source refs, and claim verification gaps before export.",
            "- Keep generated authority unless a human explicitly approves promotion.",
            "",
            "After synthesis:",
            "- Re-run this script with `-ReviewedKnowledgeDir $($contract.ai_synthesis_workspace.knowledge_dir)`.",
            "- Treat `facts.quality` and `facts.equivalence` as the minimum acceptance evidence.",
            "- Validate the pack before mounting it into another workspace.",
            "- Mount with `bootstrap-knowledge.ps1 -PackPath <pack-dir>` only after the user chooses to apply it."
        )

        $queueLines = @(
            "# AI Source Read Queue",
            "",
            "Read order:",
            "1. `.specify/workspace.yml` when present.",
            "2. `.specify/memory/repository-map.md` when present.",
            "3. `.specify/knowledge-pack-generation/bootstrap/facts.json`.",
            "4. `.specify/knowledge-pack-generation/bootstrap/ai-review/source-read-plan.md`.",
            "5. Repository marker files from the source-read plan.",
            "",
            "Extraction targets:",
            "- repository purpose and ownership boundaries",
            "- build/test/package commands with direct manifest or CI evidence",
            "- public contracts and runtime interfaces only when source files clearly expose them",
            "- validation support and known unsupported validation modes",
            "- project-specific terminology that improves routing without leaking local paths",
            "",
            "Stop rules:",
            "- Leave a claim unknown when evidence is missing.",
            "- Do not full-text scan the whole workspace by default.",
            "- Do not expand to broad source search unless a concrete guide needs it.",
            "- Do not mount a reviewed pack if quality or equivalence validation is blocked.",
            "- Do not promote authority without human approval."
        )
        Write-GeneratorUtf8 -Path $sourceQueuePath -Lines $queueLines
    }

    $qualityResult = $null
    if ($result.status -ne "blocked") {
        if ($aiSynthesisRequired) {
            $qualityRaw = @(& "$PSScriptRoot\evaluate-knowledge-pack-synthesis.ps1" `
                -RepoRoot $root `
                -KnowledgeDir $sourceKnowledgeDir `
                -BootstrapFacts (Join-Path $bootstrapDir "facts.json") `
                -ClaimLedger (Join-Path $bootstrapDir "ai-review\claim-ledger.json") `
                -OutputDir $qualityDir `
                -MinimumScore $MinimumQualityScore `
                -Json)
        } else {
            $qualityRaw = @(& "$PSScriptRoot\evaluate-knowledge-pack-synthesis.ps1" `
                -RepoRoot $root `
                -KnowledgeDir $sourceKnowledgeDir `
                -BootstrapFacts (Join-Path $bootstrapDir "facts.json") `
                -ClaimLedger (Join-Path $bootstrapDir "ai-review\claim-ledger.json") `
                -OutputDir $qualityDir `
                -MinimumScore $MinimumQualityScore `
                -FailBelowMinimum `
                -Json)
        }
        $qualityResult = ConvertFrom-GeneratorJson -Raw $qualityRaw -ToolName "evaluate-knowledge-pack-synthesis"
        if ((-not $aiSynthesisRequired) -and $qualityResult.status -eq "blocked") {
            Set-KnowledgePackBlocked $result ("quality gate failed: " + (($qualityResult.blockers) -join "; "))
        }
    }

    $exportResult = $null
    if ($result.status -ne "blocked") {
        if ($IncludeProfiles) {
            $workspaceFile = Join-Path $root ".specify\workspace.yml"
            $repositoryMap = Join-Path $root ".specify\memory\repository-map.md"
            $workspaceArg = ""
            $repositoryMapArg = ""
            if (Test-Path -LiteralPath $workspaceFile -PathType Leaf) { $workspaceArg = $workspaceFile }
            if (Test-Path -LiteralPath $repositoryMap -PathType Leaf) { $repositoryMapArg = $repositoryMap }
            $exportRaw = @(& "$PSScriptRoot\export-knowledge-pack.ps1" `
                -SourceKnowledgeDir $sourceKnowledgeDir `
                -WorkspaceFile $workspaceArg `
                -RepositoryMap $repositoryMapArg `
                -PackId $PackId `
                -OutputDir $PackOutputDir `
                -ComposeStrategy $ComposeStrategy `
                -EvaluationScenariosFile $bootstrapResult.facts.evaluation_scenarios `
                -Force `
                -Json)
        } else {
            $exportRaw = @(& "$PSScriptRoot\export-knowledge-pack.ps1" `
                -SourceKnowledgeDir $sourceKnowledgeDir `
                -PackId $PackId `
                -OutputDir $PackOutputDir `
                -ComposeStrategy $ComposeStrategy `
                -EvaluationScenariosFile $bootstrapResult.facts.evaluation_scenarios `
                -Force `
                -Json)
        }
        $exportResult = ConvertFrom-GeneratorJson -Raw $exportRaw -ToolName "export-knowledge-pack"
        if ($exportResult.status -eq "blocked") {
            Set-KnowledgePackBlocked $result ("pack export failed: " + (($exportResult.blockers) -join "; "))
        }
    }

    $equivalenceResult = $null
    if ($result.status -ne "blocked" -and $exportResult -and $exportResult.status -eq "ok") {
        $equivalenceRaw = @(& "$PSScriptRoot\compare-knowledge-pack-equivalence.ps1" `
            -SourceKnowledgeDir $sourceKnowledgeDir `
            -PackRoot $PackOutputDir `
            -OutputDir $equivalenceDir `
            -Json)
        $equivalenceResult = ConvertFrom-GeneratorJson -Raw $equivalenceRaw -ToolName "compare-knowledge-pack-equivalence"
        if ((-not $aiSynthesisRequired) -and $equivalenceResult.status -eq "blocked") {
            Set-KnowledgePackBlocked $result ("equivalence gate failed: " + (($equivalenceResult.blockers) -join "; "))
        }
    }

    $result.facts.mode = "ai-assisted-pack-generation"
    $result.facts.repo_root = $root
    $result.facts.output_dir = $OutputDir
    $result.facts.generator_dir = $generatorDir
    $result.facts.generation_contract = $contractPath
    $result.facts.ai_synthesis_plan = $synthesisPlanPath
    $result.facts.source_read_queue = $sourceQueuePath
    $result.facts.synthesis_knowledge_dir = $synthesisKnowledgeDir
    $result.facts.reviewed_knowledge_dir = $ReviewedKnowledgeDir
    $result.facts.ai_synthesis_required = [bool]$aiSynthesisRequired
    $result.facts.bootstrap = $bootstrapResult
    $result.facts.quality = $qualityResult
    $result.facts.equivalence = $equivalenceResult
    $result.facts.pack = $exportResult
    $result.hints += "Use the generation contract to drive AI synthesis before treating this pack as project-correct."
    $result.hints += "Re-run with -ReviewedKnowledgeDir after AI edits the synthesis workspace."
    $result.hints += "Treat quality and equivalence reports as the minimum synthesis closure evidence."
    $result.hints += "Mount the validated pack with bootstrap-knowledge.ps1 -PackPath <pack-dir> when the user chooses to apply it."
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
}

if ($Json) {
    Write-KnowledgePackJson $result
} else {
    $result
}
