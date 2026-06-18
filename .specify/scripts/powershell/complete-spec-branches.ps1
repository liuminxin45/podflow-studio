#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$Branch = "",
    [string]$BaseBranch = "",
    [switch]$KeepBranch,
    [switch]$DeleteBranch,
    [switch]$AllowDirty,
    [switch]$ConfirmCompletion,
    [switch]$PreflightOnly,
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Output "Usage: complete-spec-branches.ps1 [-Branch <name>] [-BaseBranch master|main] [-KeepBranch] [-DeleteBranch] [-AllowDirty] [-PreflightOnly] [-ConfirmCompletion] [-Json]"
    Write-Output "Cherry-picks the local spec branch commits into the base branch across workspace repositories and keeps the local branch by default."
    Write-Output "Use -DeleteBranch only when the user explicitly asks to delete the local spec branch."
    Write-Output "Use -PreflightOnly to inspect every repository without cherry-picking commits."
    Write-Output "Requires feature retrospective artifacts before completion: workflow-record.md and improvement-candidates.md."
    Write-Output "-ConfirmCompletion is accepted for legacy callers but is no longer required after post-commit self-check and rubric gates pass."
    exit 0
}

. "$PSScriptRoot/common.ps1"

function Get-WorkspaceConfig {
    param([string]$RepoRoot)
    $configPath = Join-Path $RepoRoot ".specify/workspace.yml"
    $workspaceRoot = $RepoRoot
    $baseBranch = "master"
    $repos = @([PSCustomObject]@{ name = (Split-Path -Leaf $RepoRoot); path = "."; required = $true; participates_in_spec_branches = $true })

    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $rootText = Select-String -Path $configPath -Pattern '^\s*root:\s*"?([^"]+)"?\s*$' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($rootText) {
            $rootValue = $rootText.Matches[0].Groups[1].Value.Trim("'`"")
            $workspaceRoot = if ([System.IO.Path]::IsPathRooted($rootValue)) { $rootValue } else { Join-Path $RepoRoot $rootValue }
        }
        $baseText = Select-String -Path $configPath -Pattern '^\s*default_base_branch:\s*"?([^"]+)"?\s*$' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($baseText) { $baseBranch = $baseText.Matches[0].Groups[1].Value.Trim("'`"") }

        $parsedRepos = @()
        $current = $null
        foreach ($line in Get-Content -LiteralPath $configPath) {
            if ($line -match '^\s*-\s*name:\s*"?([^"]+)"?\s*$') {
                if ($current) { $parsedRepos += [PSCustomObject]$current }
                $current = @{ name = $Matches[1].Trim("'`""); path = ""; required = $false; participates_in_spec_branches = $true }
            } elseif ($current -and $line -match '^\s*path:\s*"?([^"]+)"?\s*$') {
                $current.path = $Matches[1].Trim("'`"")
            } elseif ($current -and $line -match '^\s*required:\s*(true|false)\s*$') {
                $current.required = ($Matches[1] -eq "true")
            } elseif ($current -and $line -match '^\s*participates_in_spec_branches:\s*(true|false)\s*$') {
                $current.participates_in_spec_branches = ($Matches[1] -eq "true")
            }
        }
        if ($current) { $parsedRepos += [PSCustomObject]$current }
        if ($parsedRepos.Count -gt 0) { $repos = $parsedRepos }
    }

    $workspaceRoot = (Resolve-Path -LiteralPath $workspaceRoot).Path
    [PSCustomObject]@{
        default_base_branch = $baseBranch
        repositories = @($repos | ForEach-Object {
            $repoPath = if ([System.IO.Path]::IsPathRooted($_.path)) { $_.path } else { Join-Path $workspaceRoot $_.path }
            [PSCustomObject]@{ name = $_.name; path = $repoPath; required = [bool]$_.required; participates_in_spec_branches = [bool]$_.participates_in_spec_branches }
        })
    }
}

function Test-GitRepo {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return $false }
    $null = git -C $Path rev-parse --is-inside-work-tree 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Test-GeneratedOrTempPath {
    param([string]$Path)
    $normalized = $Path.Replace("\", "/").Trim('"').ToLowerInvariant()
    if ($normalized -match '(^|/)(\.agents|\.specify|ai|specs|sdkarchive|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.cache|node_modules|dist|build|export|plugin-out|coverage|logs?|tmp|temp)(/|$)') {
        return $true
    }
    if ($normalized -match '(^|/)mock_data/api/pluginmanager(/|$)') {
        return $true
    }
    return ($normalized -match '\.(log|tmp|temp|bak|swp|pid|dmp|cache|pyc|pyo|obj|ilk|pdb)$' -or
        $normalized -match '(^|/)(thumbs\.db|\.ds_store)$')
}

function Get-BlockingDirtyEntries {
    param([string]$Path)
    $classification = Get-DirtyClassification -Path $Path
    return @($classification.tracked_changes + $classification.unclassified_untracked)
}

function Get-DirtyClassification {
    param([string]$Path)
    $status = @(git -C $Path status --porcelain)
    $tracked = @()
    $ignoredUntracked = @()
    $unclassifiedUntracked = @()
    foreach ($line in $status) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line.StartsWith("?? ")) {
            $candidate = $line.Substring(3).Trim()
            if (Test-GeneratedOrTempPath -Path $candidate) {
                $ignoredUntracked += $candidate
            } else {
                $unclassifiedUntracked += $candidate
            }
            continue
        }
        $tracked += $line
    }
    return [PSCustomObject]@{
        tracked_changes = $tracked
        ignored_untracked = $ignoredUntracked
        unclassified_untracked = $unclassifiedUntracked
        has_tracked_changes = ($tracked.Count -gt 0)
        has_unclassified_untracked = ($unclassifiedUntracked.Count -gt 0)
        has_ignored_untracked = ($ignoredUntracked.Count -gt 0)
    }
}

function Test-DirtyBlocksCompletion {
    param(
        [object]$Dirty,
        [int]$CommitCount
    )
    if ($Dirty.has_tracked_changes) { return $true }
    if ($CommitCount -gt 0 -and $Dirty.has_unclassified_untracked) { return $true }
    return $false
}

function Test-Dirty {
    param([string]$Path)
    return (@(Get-BlockingDirtyEntries -Path $Path).Count -gt 0)
}

function Test-BranchExists {
    param([string]$Path, [string]$BranchName)
    $null = git -C $Path show-ref --verify --quiet "refs/heads/$BranchName"
    return ($LASTEXITCODE -eq 0)
}

function Test-BranchHasUpstream {
    param([string]$Path, [string]$BranchName)
    $null = git -C $Path rev-parse --abbrev-ref "$BranchName@{upstream}" 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Get-RemoteDivergence {
    param([string]$Path, [string]$BranchName)
    $upstream = git -C $Path rev-parse --abbrev-ref "$BranchName@{upstream}" 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($upstream)) {
        return [PSCustomObject]@{ upstream = $null; ahead = $null; behind = $null; status = "no-upstream" }
    }
    $counts = git -C $Path rev-list --left-right --count "$BranchName...$upstream" 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($counts)) {
        return [PSCustomObject]@{ upstream = [string]$upstream; ahead = $null; behind = $null; status = "unknown" }
    }
    $parts = $counts.Trim() -split '\s+'
    return [PSCustomObject]@{
        upstream = [string]$upstream
        ahead = [int]$parts[0]
        behind = [int]$parts[1]
        status = "known"
    }
}

function Resolve-BaseBranch {
    param([string]$Path, [string]$Preferred)
    foreach ($candidate in @($Preferred, "master", "main")) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        if (Test-BranchExists -Path $Path -BranchName $candidate) { return $candidate }
    }
    throw "No base branch found in $Path. Tried '$Preferred', master, main."
}

function Get-CherryPickCommits {
    param([string]$Path, [string]$BaseBranchName, [string]$BranchName)
    $commits = git -C $Path rev-list --reverse "$BaseBranchName..$BranchName"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not resolve cherry-pick commit list for '$BranchName' into '$BaseBranchName' in $Path."
    }
    return @($commits | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Get-ConflictFiles {
    param([string]$Path)
    $files = git -C $Path diff --name-only --diff-filter=U
    return @($files | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Resolve-GeneratedArtifactConflicts {
    param([string]$Path, [string[]]$Files)
    $conflicts = @($Files | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($conflicts.Count -eq 0) { return $false }
    foreach ($file in $conflicts) {
        if (-not (Test-GeneratedOrTempPath -Path $file)) { return $false }
    }
    foreach ($file in $conflicts) {
        git -C $Path checkout --ours -- $file | Out-Null
        if ($LASTEXITCODE -ne 0) { return $false }
        git -C $Path add -- $file | Out-Null
        if ($LASTEXITCODE -ne 0) { return $false }
    }
    git -C $Path -c core.editor=true cherry-pick --continue | Out-Null
    if ($LASTEXITCODE -eq 0) { return $true }
    git -C $Path cherry-pick --skip | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Invoke-GitCherryPick {
    param([string]$Path, [string]$Commit)
    Push-Location -LiteralPath $Path
    try {
        git cherry-pick $Commit | Out-Null
        return $LASTEXITCODE
    } finally {
        Pop-Location
    }
}

function Resolve-FeatureDirectory {
    param([string]$RepoRoot, [string]$BranchName)
    $featureJson = Join-Path $RepoRoot ".specify/feature.json"
    if (Test-Path -LiteralPath $featureJson -PathType Leaf) {
        $cfg = Get-Content -LiteralPath $featureJson -Raw | ConvertFrom-Json
        $configuredBranch = [string]$cfg.spec_branch
        $configuredFeatureDir = [string]$cfg.feature_directory
        if (-not [string]::IsNullOrWhiteSpace($configuredFeatureDir) -and
            ([string]::IsNullOrWhiteSpace($configuredBranch) -or $configuredBranch -eq $BranchName)) {
            if ([System.IO.Path]::IsPathRooted($configuredFeatureDir)) { return $configuredFeatureDir }
            return (Join-Path $RepoRoot $configuredFeatureDir)
        }
    }
    return (Join-Path (Join-Path $RepoRoot "specs") $BranchName)
}

function Test-RetrospectiveGate {
    param([string]$RepoRoot, [string]$BranchName)
    $featureDir = Resolve-FeatureDirectory -RepoRoot $RepoRoot -BranchName $BranchName
    $required = @("workflow-record.md", "improvement-candidates.md")
    $missing = @()
    foreach ($fileName in $required) {
        $path = Join-Path $featureDir $fileName
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $missing += $fileName }
    }
    [PSCustomObject]@{
        feature_dir = $featureDir
        required = $required
        missing = $missing
        status = if ($missing.Count -eq 0) { "ok" } else { "blocked" }
    }
}

$repoRoot = Get-RepoRoot
$workspace = Get-WorkspaceConfig -RepoRoot $repoRoot
if ([string]::IsNullOrWhiteSpace($BaseBranch)) { $BaseBranch = $workspace.default_base_branch }

if ([string]::IsNullOrWhiteSpace($Branch)) {
    $featureJson = Join-Path $repoRoot ".specify/feature.json"
    if (Test-Path -LiteralPath $featureJson -PathType Leaf) {
        $cfg = Get-Content -LiteralPath $featureJson -Raw | ConvertFrom-Json
        if ($cfg.spec_branch) { $Branch = [string]$cfg.spec_branch }
        elseif ($cfg.feature_directory) { $Branch = Split-Path -Leaf ([string]$cfg.feature_directory) }
    }
}
if ([string]::IsNullOrWhiteSpace($Branch)) {
    $primaryRepo = @($workspace.repositories | Where-Object { $_.name -eq "CoreRuntime" } | Select-Object -First 1)
    if ($primaryRepo.Count -eq 0) {
        $primaryRepo = @($workspace.repositories | Select-Object -First 1)
    }
    if ($primaryRepo.Count -gt 0 -and (Test-GitRepo $primaryRepo[0].path)) {
        $Branch = git -C $primaryRepo[0].path rev-parse --abbrev-ref HEAD
    }
}
if ([string]::IsNullOrWhiteSpace($Branch) -or $Branch -eq "HEAD") {
    throw "Could not resolve spec branch. Pass -Branch explicitly."
}

$shouldKeepBranch = -not [bool]$DeleteBranch
if ($KeepBranch) { $shouldKeepBranch = $true }

$preflight = @()
$errors = @()
$retrospectiveGate = Test-RetrospectiveGate -RepoRoot $repoRoot -BranchName $Branch
if ($retrospectiveGate.status -ne "ok") {
    $missingText = $retrospectiveGate.missing -join ", "
    $errors += "Retrospective gate failed for '$Branch': missing $missingText in $($retrospectiveGate.feature_dir). Run speckit.retrospective before complete-branch."
}
foreach ($repo in $workspace.repositories) {
    if (-not $repo.participates_in_spec_branches) {
        $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "skipped"; branch = $Branch; base = $BaseBranch; planned_action = "skip"; participates_in_spec_branches = $false }
        continue
    }
    if (-not (Test-Path -LiteralPath $repo.path -PathType Container)) {
        $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "missing"; branch = $Branch; base = $BaseBranch; planned_action = "skip"; participates_in_spec_branches = [bool]$repo.participates_in_spec_branches }
        if ($repo.required) { $errors += "Required repository not found: $($repo.name)" }
        continue
    }
    if (-not (Test-GitRepo $repo.path)) {
        $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "not-git"; branch = $Branch; base = $BaseBranch; planned_action = "error"; participates_in_spec_branches = [bool]$repo.participates_in_spec_branches }
        $errors += "Repository is not a git work tree: $($repo.name)"
        continue
    }
    $dirtyState = Get-DirtyClassification -Path $repo.path
    try {
        $targetBase = Resolve-BaseBranch -Path $repo.path -Preferred $BaseBranch
        $remoteDivergence = Get-RemoteDivergence -Path $repo.path -BranchName $targetBase
    } catch {
        $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "base-missing"; branch = $Branch; base = $BaseBranch; planned_action = "error"; participates_in_spec_branches = [bool]$repo.participates_in_spec_branches }
        $errors += $_.Exception.Message
        continue
    }
    if (-not (Test-BranchExists -Path $repo.path -BranchName $Branch)) {
        if (-not $AllowDirty -and (Test-DirtyBlocksCompletion -Dirty $dirtyState -CommitCount 0)) {
            $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "dirty"; branch = $Branch; base = $targetBase; planned_action = "error"; participates_in_spec_branches = [bool]$repo.participates_in_spec_branches; remote_divergence = $remoteDivergence; dirty_state = $dirtyState }
            $errors += "Repository has tracked or blocking dirty changes: $($repo.name). Commit/stash them before completing the spec."
            continue
        }
        $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "branch-missing"; branch = $Branch; base = $targetBase; planned_action = "switch-to-base"; participates_in_spec_branches = [bool]$repo.participates_in_spec_branches; remote_divergence = $remoteDivergence; dirty_state = $dirtyState }
        if ($repo.required) { $errors += "Required spec branch '$Branch' missing in $($repo.name)" }
        continue
    }
    if (Test-BranchHasUpstream -Path $repo.path -BranchName $Branch) {
        $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "branch-has-upstream"; branch = $Branch; base = $targetBase; planned_action = "error"; participates_in_spec_branches = [bool]$repo.participates_in_spec_branches; remote_divergence = $remoteDivergence; dirty_state = $dirtyState }
        $errors += "Spec branch '$Branch' in $($repo.name) has an upstream; Spec Kit branches must stay local-only."
        continue
    }
    if ($Branch -eq $targetBase) {
        $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "branch-is-base"; branch = $Branch; base = $targetBase; planned_action = "error"; participates_in_spec_branches = [bool]$repo.participates_in_spec_branches; remote_divergence = $remoteDivergence; dirty_state = $dirtyState }
        $errors += "Spec branch '$Branch' is the base branch in $($repo.name); refusing to complete."
        continue
    }
    try {
        $commits = Get-CherryPickCommits -Path $repo.path -BaseBranchName $targetBase -BranchName $Branch
    } catch {
        $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "cherry-pick-list-error"; branch = $Branch; base = $targetBase; planned_action = "error"; participates_in_spec_branches = [bool]$repo.participates_in_spec_branches; remote_divergence = $remoteDivergence; dirty_state = $dirtyState }
        $errors += $_.Exception.Message
        continue
    }
    if (-not $AllowDirty -and (Test-DirtyBlocksCompletion -Dirty $dirtyState -CommitCount $commits.Count)) {
        $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "dirty"; branch = $Branch; base = $targetBase; planned_action = "error"; participates_in_spec_branches = [bool]$repo.participates_in_spec_branches; remote_divergence = $remoteDivergence; dirty_state = $dirtyState }
        $errors += "Repository has tracked or blocking dirty changes: $($repo.name). Commit/stash them before completing the spec."
        continue
    }
    if ($commits.Count -eq 0) {
        $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "already-up-to-date"; branch = $Branch; base = $targetBase; planned_action = "switch-to-base"; participates_in_spec_branches = [bool]$repo.participates_in_spec_branches; remote_divergence = $remoteDivergence; dirty_state = $dirtyState }
        continue
    }
    $deleteAction = if ($shouldKeepBranch) { "cherry-pick" } else { "cherry-pick-and-delete" }
    $preflight += [PSCustomObject]@{ repository = $repo.name; path = $repo.path; status = "ready"; branch = $Branch; base = $targetBase; planned_action = $deleteAction; participates_in_spec_branches = [bool]$repo.participates_in_spec_branches; remote_divergence = $remoteDivergence; dirty_state = $dirtyState }
}

$preflightPayload = [PSCustomObject]@{
    branch = $Branch
    base_branch = $BaseBranch
    pushed = $false
    confirmed = (-not [bool]$PreflightOnly)
    action = "preflight"
    completion_ready = ($errors.Count -eq 0)
    # Legacy JSON alias retained for older callers. Prefer completion_ready or cherry_pick_ready.
    merge_ready = ($errors.Count -eq 0)
    cherry_pick_ready = ($errors.Count -eq 0)
    keep_branch = $shouldKeepBranch
    preflight = $preflight
    retrospective_gate = $retrospectiveGate
    errors = $errors
    repositories = @()
}

if ($errors.Count -gt 0) {
    $preflightPayload.action = "preflight-failed"
    if ($Json) {
        $preflightPayload | ConvertTo-Json -Depth 8 -Compress
    } else {
        [Console]::Error.WriteLine("ERROR: Preflight failed before cherry-picking or deleting spec branches:")
        foreach ($errorItem in $errors) {
            [Console]::Error.WriteLine(" - $errorItem")
        }
    }
    exit 1
}

if ($PreflightOnly) {
    $preflightPayload.action = "preflight-only"
    if ($Json) {
        $preflightPayload | ConvertTo-Json -Depth 8 -Compress
    } else {
        Write-Output "SPEC_BRANCH: $Branch"
        Write-Output "PUSHED: false"
        Write-Output "PREFLIGHT: passed"
        foreach ($item in $preflight) {
            Write-Output "$($item.repository): $($item.status) -> $($item.planned_action) on $($item.base)"
        }
    }
    exit 0
}

$results = @()
foreach ($item in $preflight) {
    if ($item.status -eq "skipped") {
        $results += [PSCustomObject]@{ repository = $item.repository; path = $item.path; status = "skipped"; branch = $Branch; base = $item.base; participates_in_spec_branches = $false }
        continue
    }
    if ($item.status -eq "missing") {
        $results += [PSCustomObject]@{ repository = $item.repository; path = $item.path; status = $item.status; branch = $Branch; base = $item.base; participates_in_spec_branches = [bool]$item.participates_in_spec_branches }
        continue
    }
    if ($item.status -eq "branch-missing" -or $item.status -eq "already-up-to-date") {
        git -C $item.path switch $item.base | Out-Null
        $results += [PSCustomObject]@{ repository = $item.repository; path = $item.path; status = "$($item.status); switched-to-$($item.base)"; branch = $Branch; base = $item.base; participates_in_spec_branches = [bool]$item.participates_in_spec_branches }
        continue
    }
    git -C $item.path switch $item.base | Out-Null
    $commits = Get-CherryPickCommits -Path $item.path -BaseBranchName $item.base -BranchName $Branch
    $autoResolvedConflicts = @()
    foreach ($commit in $commits) {
        $cherryPickExitCode = Invoke-GitCherryPick -Path $item.path -Commit $commit
        if ($cherryPickExitCode -ne 0) {
            $conflicts = Get-ConflictFiles -Path $item.path
            if (Resolve-GeneratedArtifactConflicts -Path $item.path -Files $conflicts) {
                $autoResolvedConflicts += $conflicts
                continue
            }
            $conflictText = if ($conflicts.Count -gt 0) { $conflicts -join ", " } else { "unknown" }
            throw "Cherry-pick failed in $($item.repository) at $commit. Conflicts: $conflictText"
        }
    }
    $status = "cherry-picked-to-$($item.base)"
    if (-not $shouldKeepBranch) {
        git -C $item.path branch -d $Branch | Out-Null
        $status = "$status; deleted-local-branch"
    } else {
        $status = "$status; kept-local-branch"
    }
    if ($autoResolvedConflicts.Count -gt 0) {
        $uniqueConflicts = @($autoResolvedConflicts | Sort-Object -Unique)
        $status = "$status; auto-resolved-artifact-conflicts=$($uniqueConflicts -join ',')"
    }
    $results += [PSCustomObject]@{ repository = $item.repository; path = $item.path; status = $status; branch = $Branch; base = $item.base; participates_in_spec_branches = [bool]$item.participates_in_spec_branches }
}

$payload = [PSCustomObject]@{
    branch = $Branch
    base_branch = $BaseBranch
    confirmed = $true
    action = "completed"
    completion_ready = $true
    # Legacy JSON alias retained for older callers. Prefer completion_ready or cherry_pick_ready.
    merge_ready = $true
    cherry_pick_ready = $true
    keep_branch = $shouldKeepBranch
    pushed = $false
    retrospective_gate = $retrospectiveGate
    preflight = $preflight
    errors = @()
    repositories = $results
}

if ($Json) {
    $payload | ConvertTo-Json -Depth 8 -Compress
} else {
    Write-Output "SPEC_BRANCH: $Branch"
    Write-Output "PUSHED: false"
    Write-Output "PREFLIGHT: passed"
    foreach ($result in $results) {
        Write-Output "$($result.repository): $($result.status)"
    }
}
