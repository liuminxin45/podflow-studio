param(
    [string]$RepoRoot = "",
    [string]$KnowledgeDir = "",
    [string]$BootstrapFacts = "",
    [string]$ClaimLedger = "",
    [string]$OutputDir = "",
    [int]$MinimumScore = 70,
    [switch]$FailBelowMinimum,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

function Resolve-SynthesisRoot {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        return (Get-Location).Path
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Get-SynthesisRelativePath {
    param([string]$Root, [string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return "" }
    try {
        $rootUri = [System.Uri](([System.IO.Path]::GetFullPath($Root)).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar)
        $pathUri = [System.Uri]([System.IO.Path]::GetFullPath($Path))
        $relative = [System.Uri]::UnescapeDataString($rootUri.MakeRelativeUri($pathUri).ToString()).Replace('\', '/')
        if ($relative -and -not $relative.StartsWith("..")) { return $relative }
    } catch {
        return $Path
    }
    return $Path
}

function Get-SynthesisPercent {
    param([int]$Good, [int]$Total)
    if ($Total -le 0) { return 100.0 }
    return [Math]::Round(($Good * 100.0) / $Total, 2)
}

function Get-GuideFrontmatter {
    param([string]$Path)
    $frontmatter = [ordered]@{
        authority = ""
        confidence = ""
        source_refs = @()
        has_frontmatter = $false
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $frontmatter }

    $lines = Get-Content -LiteralPath $Path
    if ($lines.Count -eq 0) { return $frontmatter }
    $inSourceRefs = $false
    $startIndex = 0
    $endIndex = $lines.Count
    if ($lines[0].Trim() -eq "---") {
        $frontmatter.has_frontmatter = $true
        $startIndex = 1
        for ($j = 1; $j -lt $lines.Count; $j++) {
            if (([string]$lines[$j]).Trim() -eq "---") {
                $endIndex = $j
                break
            }
        }
    }

    for ($i = $startIndex; $i -lt $endIndex; $i++) {
        $line = [string]$lines[$i]
        if ($line -match "^\s*authority:\s*(.+?)\s*$") {
            $frontmatter.authority = $Matches[1].Trim().Trim('"').Trim("'")
            $inSourceRefs = $false
            continue
        }
        if ($line -match "^\s*confidence:\s*(.+?)\s*$") {
            $frontmatter.confidence = $Matches[1].Trim().Trim('"').Trim("'")
            $inSourceRefs = $false
            continue
        }
        if ($line -match "^\s*source_refs:\s*$") {
            $inSourceRefs = $true
            continue
        }
        if ($inSourceRefs -and $line -match "^\s*-\s*(.+?)\s*$") {
            $frontmatter.source_refs += $Matches[1].Trim().Trim('"').Trim("'")
            continue
        }
        if ($inSourceRefs -and $line -match "^\S") {
            $inSourceRefs = $false
        }
    }
    return $frontmatter
}

function Get-GuideClaimCandidates {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return @() }
    $text = Get-Content -LiteralPath $Path -Raw
    if ($text -match "(?s)^---\s*.*?\s*---\s*") {
        $text = $text -replace "(?s)^---\s*.*?\s*---\s*", ""
    }
    $claims = @()
    foreach ($line in ($text -split "`r?`n")) {
        $trimmed = $line.Trim()
        if ($trimmed -notmatch "^[-*]\s+(.+)$") { continue }
        $claim = $Matches[1].Trim()
        if ($claim.Length -lt 8) { continue }
        if ($claim -match "^(none|none detected|n/a)$") { continue }
        if ($claim -match "^(Confirm|Add public contracts|Inspect tests)") { continue }
        $claims += $claim
    }
    return $claims
}

function Resolve-GuideSourceRef {
    param(
        [string]$Root,
        [string]$Ref
    )
    $clean = ([string]$Ref).Trim().Trim('"').Trim("'")
    $status = "unresolved"
    $resolvedPath = ""
    $machineSpecific = $false

    if ([string]::IsNullOrWhiteSpace($clean)) {
        $status = "empty"
    } elseif ($clean -match "^[A-Za-z]:\\" -or $clean -match "(^|[\\/])Users[\\/][^\\/]+") {
        $status = "machine-specific"
        $machineSpecific = $true
    } elseif ($clean -match "^(https?://|git://)") {
        $status = "external"
        $resolvedPath = $clean
    } elseif ($clean.StartsWith("<") -and $clean.EndsWith(">")) {
        $status = "placeholder"
        $resolvedPath = $clean
    } else {
        $candidate = if ([System.IO.Path]::IsPathRooted($clean)) { $clean } else { Join-Path $Root ($clean -replace "/", "\") }
        if (Test-Path -LiteralPath $candidate) {
            $status = "resolved"
            $resolvedPath = [System.IO.Path]::GetFullPath($candidate)
        } else {
            $resolvedPath = [System.IO.Path]::GetFullPath($candidate)
        }
    }

    return [ordered]@{
        ref = $clean
        status = $status
        resolved_path = $resolvedPath
        machine_specific = $machineSpecific
    }
}

function Read-BootstrapRepositories {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return @()
    }
    try {
        $payload = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
        return @($payload.facts.repositories)
    } catch {
        return @()
    }
}

$result = New-KnowledgePackResult "evaluate-knowledge-pack-synthesis"

try {
    $root = Resolve-SynthesisRoot -Path $RepoRoot
    if ([string]::IsNullOrWhiteSpace($KnowledgeDir)) {
        $KnowledgeDir = Join-Path $root ".specify\knowledge-pack-generation\ai-synthesis\ai\knowledge"
    } else {
        $KnowledgeDir = Resolve-KnowledgePackPath -Path $KnowledgeDir -Base $root
    }
    if ([string]::IsNullOrWhiteSpace($BootstrapFacts)) {
        $BootstrapFacts = Join-Path $root ".specify\knowledge-pack-generation\bootstrap\facts.json"
    } else {
        $BootstrapFacts = Resolve-KnowledgePackPath -Path $BootstrapFacts -Base $root
    }
    if ([string]::IsNullOrWhiteSpace($ClaimLedger)) {
        $ClaimLedger = Join-Path $root ".specify\knowledge-pack-generation\bootstrap\ai-review\claim-ledger.json"
    } else {
        $ClaimLedger = Resolve-KnowledgePackPath -Path $ClaimLedger -Base $root
    }
    if ([string]::IsNullOrWhiteSpace($OutputDir)) {
        $OutputDir = Join-Path $root ".specify\knowledge-pack-generation\quality"
    } else {
        $OutputDir = Resolve-KnowledgePackPath -Path $OutputDir -Base $root
    }
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

    $indexPath = Join-Path $KnowledgeDir "index.yml"
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
        Set-KnowledgePackBlocked $result "KnowledgeDir must contain index.yml: $KnowledgeDir"
    }

    $guideFacts = @()
    $sourceRefs = @()
    $claimFacts = @()
    $missingGuides = @()
    $machineSpecificRefs = @()
    $unresolvedRefs = @()

    if ($result.status -ne "blocked") {
        $entries = @(Get-KnowledgePackIndexEntries -IndexPath $indexPath)
        foreach ($entry in $entries) {
            if (-not $entry.guide) { continue }
            $guidePath = Resolve-KnowledgePackGuidePath -IndexPath $indexPath -Guide $entry.guide
            $displayPath = Get-KnowledgePackDisplayPath -Guide $entry.guide
            $guideExists = Test-Path -LiteralPath $guidePath -PathType Leaf
            if (-not $guideExists) { $missingGuides += $displayPath }

            $frontmatter = Get-GuideFrontmatter -Path $guidePath
            $claims = @(Get-GuideClaimCandidates -Path $guidePath)
            $refDetails = @()
            foreach ($ref in @($frontmatter.source_refs)) {
                $detail = Resolve-GuideSourceRef -Root $root -Ref $ref
                $detail.guide = $displayPath
                $refDetails += $detail
                $sourceRefs += $detail
                if ($detail.status -eq "machine-specific") { $machineSpecificRefs += "$displayPath -> $($detail.ref)" }
                if ($detail.status -eq "unresolved") { $unresolvedRefs += "$displayPath -> $($detail.ref)" }
            }

            $resolvedRefCount = @($refDetails | Where-Object { @("resolved", "placeholder", "external") -contains $_.status }).Count
            $hasResolvedSource = ($resolvedRefCount -gt 0)
            $claimCoveredCount = if ($hasResolvedSource) { $claims.Count } else { 0 }

            $guideFacts += [ordered]@{
                category = $entry.category
                key = $entry.key
                guide = $displayPath
                path = $guidePath
                exists = [bool]$guideExists
                has_frontmatter = [bool]$frontmatter.has_frontmatter
                authority = $frontmatter.authority
                confidence = $frontmatter.confidence
                source_ref_count = @($frontmatter.source_refs).Count
                resolved_source_ref_count = $resolvedRefCount
                unresolved_source_refs = @($refDetails | Where-Object { $_.status -eq "unresolved" } | ForEach-Object { $_.ref })
                claim_candidate_count = $claims.Count
                covered_claim_count = $claimCoveredCount
            }
            $claimFacts += [ordered]@{
                guide = $displayPath
                candidate_count = $claims.Count
                covered_count = $claimCoveredCount
                coverage_status = if ($claims.Count -eq 0) { "no_claim_candidates" } elseif ($hasResolvedSource) { "covered_by_guide_source_refs" } else { "missing_resolved_source_ref" }
                claims = $claims
            }
        }

        $repositories = @(Read-BootstrapRepositories -Path $BootstrapFacts)
        $repoCoverage = @()
        foreach ($repo in $repositories) {
            $slug = ConvertTo-KnowledgePackSlug -Value $repo.name
            $expectedGuide = "ai/knowledge/repositories/$slug.md"
            $guide = @($guideFacts | Where-Object { $_.guide -eq $expectedGuide } | Select-Object -First 1)
            $covered = ($guide.Count -gt 0 -and $guide[0].exists -and $guide[0].source_ref_count -gt 0)
            $repoCoverage += [ordered]@{
                name = $repo.name
                path = $repo.path
                expected_guide = $expectedGuide
                guide_exists = ($guide.Count -gt 0 -and $guide[0].exists)
                source_ref_count = if ($guide.Count -gt 0) { $guide[0].source_ref_count } else { 0 }
                covered = [bool]$covered
            }
        }

        $entryCount = @($guideFacts).Count
        $existingGuideCount = @($guideFacts | Where-Object { $_.exists }).Count
        $sourceRefGuideCount = @($guideFacts | Where-Object { $_.source_ref_count -gt 0 }).Count
        $resolvedSourceRefCount = @($sourceRefs | Where-Object { @("resolved", "placeholder", "external") -contains $_.status }).Count
        $claimCandidateCount = 0
        $coveredClaimCount = 0
        foreach ($guide in $guideFacts) {
            $claimCandidateCount += [int]$guide.claim_candidate_count
            $coveredClaimCount += [int]$guide.covered_claim_count
        }
        $repoCoveredCount = @($repoCoverage | Where-Object { $_.covered }).Count

        $scores = [ordered]@{
            index_integrity_percent = if ($missingGuides.Count -eq 0) { 100.0 } else { Get-SynthesisPercent -Good $existingGuideCount -Total $entryCount }
            indexed_guide_coverage_percent = Get-SynthesisPercent -Good $existingGuideCount -Total $entryCount
            source_ref_coverage_percent = Get-SynthesisPercent -Good $sourceRefGuideCount -Total $entryCount
            source_ref_resolution_percent = Get-SynthesisPercent -Good $resolvedSourceRefCount -Total @($sourceRefs).Count
            repository_coverage_percent = Get-SynthesisPercent -Good $repoCoveredCount -Total $repoCoverage.Count
            claim_verification_percent = Get-SynthesisPercent -Good $coveredClaimCount -Total $claimCandidateCount
        }
        $totalScore = [Math]::Round(
            ($scores.index_integrity_percent * 0.15) +
            ($scores.indexed_guide_coverage_percent * 0.15) +
            ($scores.source_ref_coverage_percent * 0.20) +
            ($scores.source_ref_resolution_percent * 0.20) +
            ($scores.repository_coverage_percent * 0.15) +
            ($scores.claim_verification_percent * 0.15),
            2
        )

        $sourceLedgerPath = Join-Path $OutputDir "source-coverage-ledger.json"
        $claimReportPath = Join-Path $OutputDir "claim-verification-report.json"
        $summaryPath = Join-Path $OutputDir "synthesis-quality-summary.md"
        $qualityReportPath = Join-Path $OutputDir "synthesis-quality-report.json"

        $sourceLedger = [ordered]@{
            schema_version = "1.0"
            repo_root = "."
            knowledge_dir = Get-SynthesisRelativePath -Root $root -Path $KnowledgeDir
            bootstrap_facts = Get-SynthesisRelativePath -Root $root -Path $BootstrapFacts
            guides = $guideFacts
            source_refs = $sourceRefs
            repositories = $repoCoverage
            unresolved_refs = @($unresolvedRefs | Select-Object -Unique)
            machine_specific_refs = @($machineSpecificRefs | Select-Object -Unique)
        }
        $claimReport = [ordered]@{
            schema_version = "1.0"
            claim_ledger = Get-SynthesisRelativePath -Root $root -Path $ClaimLedger
            claim_candidate_count = $claimCandidateCount
            covered_claim_count = $coveredClaimCount
            claim_verification_percent = $scores.claim_verification_percent
            guides = $claimFacts
        }
        $qualityReport = [ordered]@{
            schema_version = "1.0"
            status = if ($totalScore -ge $MinimumScore) { "ok" } else { "below-threshold" }
            total_score = $totalScore
            minimum_score = $MinimumScore
            component_scores = $scores
            source_coverage_ledger = $sourceLedgerPath
            claim_verification_report = $claimReportPath
            summary = $summaryPath
        }

        $sourceLedger | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $sourceLedgerPath -Encoding utf8
        $claimReport | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $claimReportPath -Encoding utf8
        $qualityReport | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $qualityReportPath -Encoding utf8
        @(
            "# Knowledge Synthesis Quality Summary",
            "",
            "- Knowledge dir: $(Get-SynthesisRelativePath -Root $root -Path $KnowledgeDir)",
            "- Total score: $totalScore",
            "- Minimum score: $MinimumScore",
            "- Indexed guide coverage: $($scores.indexed_guide_coverage_percent)%",
            "- Source ref coverage: $($scores.source_ref_coverage_percent)%",
            "- Source ref resolution: $($scores.source_ref_resolution_percent)%",
            "- Repository coverage: $($scores.repository_coverage_percent)%",
            "- Claim verification: $($scores.claim_verification_percent)%",
            "- Unresolved refs: $($unresolvedRefs.Count)",
            "- Machine-specific refs: $($machineSpecificRefs.Count)"
        ) | Set-Content -LiteralPath $summaryPath -Encoding utf8

        $result.facts.repo_root = $root
        $result.facts.knowledge_dir = $KnowledgeDir
        $result.facts.bootstrap_facts = $BootstrapFacts
        $result.facts.claim_ledger = $ClaimLedger
        $result.facts.output_dir = $OutputDir
        $result.facts.source_coverage_ledger = $sourceLedgerPath
        $result.facts.claim_verification_report = $claimReportPath
        $result.facts.summary = $summaryPath
        $result.facts.quality_report = $qualityReportPath
        $result.facts.total_score = $totalScore
        $result.facts.minimum_score = $MinimumScore
        $result.facts.component_scores = $scores
        $result.facts.guide_count = $entryCount
        $result.facts.source_ref_count = @($sourceRefs).Count
        $result.facts.unresolved_refs = @($unresolvedRefs | Select-Object -Unique)
        $result.facts.machine_specific_refs = @($machineSpecificRefs | Select-Object -Unique)

        if ($missingGuides.Count -gt 0) {
            Set-KnowledgePackBlocked $result ("missing indexed guides: " + (($missingGuides | Select-Object -Unique) -join ", "))
        }
        if ($machineSpecificRefs.Count -gt 0) {
            Set-KnowledgePackBlocked $result ("machine-specific source refs found: " + (($machineSpecificRefs | Select-Object -Unique) -join "; "))
        }
        if ($totalScore -lt $MinimumScore) {
            if ($FailBelowMinimum) {
                Set-KnowledgePackBlocked $result "knowledge synthesis quality score $totalScore is below minimum $MinimumScore"
            } elseif ($result.status -eq "ok") {
                $result.status = "warning"
            }
        }
        if ($unresolvedRefs.Count -gt 0) {
            $result.unknowns += "Unresolved source refs remain; keep authority generated or fix refs before promotion."
        }
        $result.hints += "Quality score checks evidence traceability, not semantic truth."
        $result.hints += "Use the source coverage ledger and claim verification report before mounting a generated pack."
    }
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
}

if ($Json) { Write-KnowledgePackJson $result } else { $result }
