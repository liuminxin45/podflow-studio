#!/usr/bin/env pwsh
# Common PowerShell helpers for Spec Kit scripts.

# Find the Spec Kit installation root by searching upward for .specify.
# In a multi-repository workspace this is the workspace root, not a Git repo.
function Find-SpecifyRoot {
    param([string]$StartDir = (Get-Location).Path)

    # Normalize to absolute path to prevent issues with relative paths
    # Use -LiteralPath to handle paths with wildcard characters ([, ], *, ?)
    $resolved = Resolve-Path -LiteralPath $StartDir -ErrorAction SilentlyContinue
    $current = if ($resolved) { $resolved.Path } else { $null }
    if (-not $current) { return $null }

    while ($true) {
        if (Test-Path -LiteralPath (Join-Path $current ".specify") -PathType Container) {
            return $current
        }
        $parent = Split-Path $current -Parent
        if ([string]::IsNullOrEmpty($parent) -or $parent -eq $current) {
            return $null
        }
        $current = $parent
    }
}

function Get-SpecKitRoot {
    if ($env:SPECIFY_ROOT) {
        $resolved = Resolve-Path -LiteralPath $env:SPECIFY_ROOT -ErrorAction SilentlyContinue
        if ($resolved) { return $resolved.Path }
    }

    $specifyRoot = Find-SpecifyRoot
    if ($specifyRoot) {
        return $specifyRoot
    }

    # Installed scripts live at <spec-kit-root>/.specify/scripts/powershell.
    try {
        $installedMarker = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "../..") -ErrorAction SilentlyContinue
        if ($installedMarker -and (Split-Path -Leaf $installedMarker.Path) -eq ".specify") {
            $installedRoot = Resolve-Path -LiteralPath (Join-Path $installedMarker.Path "..") -ErrorAction SilentlyContinue
            if ($installedRoot -and (Test-Path -LiteralPath (Join-Path $installedRoot.Path ".specify") -PathType Container)) {
                return $installedRoot.Path
            }
        }
    } catch {}

    $currentRepoRoot = Get-CurrentRepoRoot
    if ($currentRepoRoot) {
        return $currentRepoRoot
    }

    # Source-checkout scripts live at <spec-kit-source>/scripts/powershell.
    try {
        $sourceRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "../..") -ErrorAction SilentlyContinue
        if ($sourceRoot -and (Test-Path -LiteralPath (Join-Path $sourceRoot.Path "pyproject.toml") -PathType Leaf)) {
            return (Resolve-Path -LiteralPath (Join-Path $sourceRoot.Path "..")).Path
        }
    } catch {}

    $current = Resolve-Path -LiteralPath (Get-Location).Path -ErrorAction SilentlyContinue
    if ($current) { return $current.Path }
    return (Get-Location).Path
}

function Get-RepoRoot {
    return Get-SpecKitRoot
}

function Get-CurrentRepoRoot {
    if ($env:SPECIFY_REPO_ROOT) {
        $resolved = Resolve-Path -LiteralPath $env:SPECIFY_REPO_ROOT -ErrorAction SilentlyContinue
        if ($resolved) { return $resolved.Path }
    }

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        return $null
    }

    try {
        $result = git rev-parse --show-toplevel 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($result)) {
            return $result
        }
    } catch {}

    return $null
}

function Get-CurrentBranch {
    # First check if SPECIFY_FEATURE environment variable is set
    if ($env:SPECIFY_FEATURE) {
        return $env:SPECIFY_FEATURE
    }

    $repoRoot = Get-CurrentRepoRoot
    if ($repoRoot -and (Test-HasGit)) {
        try {
            $result = git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null
            if ($LASTEXITCODE -eq 0) {
                return $result
            }
        } catch {
            # Git command failed
        }
    }

    # For non-git repos, try to find the latest feature directory
    $specsDir = Join-Path (Get-SpecKitRoot) "specs"

    if (Test-Path $specsDir) {
        $latestFeature = ""
        $highest = 0
        $latestTimestamp = ""

        Get-ChildItem -Path $specsDir -Directory | ForEach-Object {
            if ($_.Name -match '^(\d{8}-\d{6})-') {
                # Timestamp-based branch: compare lexicographically
                $ts = $matches[1]
                if ($ts -gt $latestTimestamp) {
                    $latestTimestamp = $ts
                    $latestFeature = $_.Name
                }
            } elseif ($_.Name -match '^(\d{3,})-') {
                $num = [long]$matches[1]
                if ($num -gt $highest) {
                    $highest = $num
                    # Only update if no timestamp branch found yet
                    if (-not $latestTimestamp) {
                        $latestFeature = $_.Name
                    }
                }
            }
        }

        if ($latestFeature) {
            return $latestFeature
        }
    }

    # Final fallback
    return "main"
}

# Check whether the current working directory is inside a Git work tree.
# Handles both regular repos (.git directory) and worktrees/submodules (.git file)
function Test-HasGit {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        return $false
    }
    $repoRoot = Get-CurrentRepoRoot
    if (-not $repoRoot) {
        return $false
    }

    try {
        $null = git -C $repoRoot rev-parse --is-inside-work-tree 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

# Strip a single optional path segment (e.g. gitflow "feat/004-name" -> "004-name").
# Only when the full name is exactly two slash-free segments; otherwise returns the raw name.
function Get-SpecKitEffectiveBranchName {
    param([string]$Branch)
    if ($Branch -match '^([^/]+)/([^/]+)$') {
        return $Matches[2]
    }
    return $Branch
}

function Test-FeatureBranch {
    param(
        [string]$Branch,
        [bool]$HasGit = $true
    )

    # For non-git repos, we can't enforce branch naming but still provide output
    if (-not $HasGit) {
        Write-Warning "[specify] Warning: Git repository not detected; skipped branch validation"
        return $true
    }

    $raw = $Branch
    $Branch = Get-SpecKitEffectiveBranchName $raw

    # Accept sequential prefix (3+ digits) but exclude malformed timestamps
    # Malformed: 7-or-8 digit date + 6-digit time with no trailing slug (e.g. "2026031-143022" or "20260319-143022")
    $hasMalformedTimestamp = ($Branch -match '^[0-9]{7}-[0-9]{6}-') -or ($Branch -match '^(?:\d{7}|\d{8})-\d{6}$')
    $isSequential = ($Branch -match '^[0-9]{3,}-') -and (-not $hasMalformedTimestamp)
    if (-not $isSequential -and $Branch -notmatch '^\d{8}-\d{6}-') {
        [Console]::Error.WriteLine("ERROR: Not on a feature branch. Current branch: $raw")
        [Console]::Error.WriteLine("Feature branches should be named like: 001-feature-name, 1234-feature-name, or 20260319-143022-feature-name")
        return $false
    }
    return $true
}

# True when .specify/feature.json pins an existing feature directory that
# matches the active FEATURE_DIR from Get-FeaturePathsEnv.
function Test-FeatureJsonMatchesFeatureDir {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$ActiveFeatureDir
    )

    $featureJson = Join-Path (Join-Path $RepoRoot '.specify') 'feature.json'
    if (-not (Test-Path -LiteralPath $featureJson -PathType Leaf)) {
        return $false
    }

    try {
        $raw = Get-Content -LiteralPath $featureJson -Raw
        $cfg = $raw | ConvertFrom-Json
    } catch {
        return $false
    }

    $fd = $cfg.feature_directory
    if ([string]::IsNullOrWhiteSpace([string]$fd)) {
        return $false
    }

    if (-not [System.IO.Path]::IsPathRooted($fd)) {
        $fd = Join-Path $RepoRoot $fd
    }

    if (-not (Test-Path -LiteralPath $fd -PathType Container)) {
        return $false
    }

    # Resolve both paths to canonical absolute form. Prefer Resolve-Path (follows
    # symlinks and is the canonical PS way); fall back to [Path]::GetFullPath when
    # Resolve-Path can't produce a value. Mirrors the pattern used by Find-SpecifyRoot.
    $resolvedJson = Resolve-Path -LiteralPath $fd -ErrorAction SilentlyContinue
    if ($resolvedJson) {
        $normJson = $resolvedJson.Path
    } else {
        $normJson = [System.IO.Path]::GetFullPath($fd)
    }

    $resolvedActive = Resolve-Path -LiteralPath $ActiveFeatureDir -ErrorAction SilentlyContinue
    if ($resolvedActive) {
        $normActive = $resolvedActive.Path
    } else {
        $normActive = [System.IO.Path]::GetFullPath($ActiveFeatureDir)
    }

    # Use case-insensitive compare only on Windows; POSIX filesystems are case-sensitive.
    # PowerShell 5.1 is Windows-only and does not define $IsWindows, so treat its
    # absence as "we're on Windows".
    if ($null -ne $IsWindows) {
        $onWindows = $IsWindows
    } else {
        $onWindows = $true
    }

    if ($onWindows) {
        $comparison = [System.StringComparison]::OrdinalIgnoreCase
    } else {
        $comparison = [System.StringComparison]::Ordinal
    }

    return [string]::Equals($normJson, $normActive, $comparison)
}

# Resolve specs/<feature-dir> by numeric/timestamp prefix.
function Find-FeatureDirByPrefix {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$Branch
    )
    $specsDir = Join-Path $RepoRoot 'specs'
    $branchName = Get-SpecKitEffectiveBranchName $Branch

    $prefix = $null
    if ($branchName -match '^(\d{8}-\d{6})-') {
        $prefix = $Matches[1]
    } elseif ($branchName -match '^(\d{3,})-') {
        $prefix = $Matches[1]
    } else {
        return (Join-Path $specsDir $branchName)
    }

    $dirMatches = @()
    if (Test-Path -LiteralPath $specsDir -PathType Container) {
        $dirMatches = @(Get-ChildItem -LiteralPath $specsDir -Filter "$prefix-*" -Directory -ErrorAction SilentlyContinue)
    }

    if ($dirMatches.Count -eq 0) {
        return (Join-Path $specsDir $branchName)
    }
    if ($dirMatches.Count -eq 1) {
        return $dirMatches[0].FullName
    }
    $names = ($dirMatches | ForEach-Object { $_.Name }) -join ' '
    [Console]::Error.WriteLine("ERROR: Multiple spec directories found with prefix '$prefix': $names")
    [Console]::Error.WriteLine('Please ensure only one spec directory exists per prefix.')
    return $null
}

# Branch-based prefix resolution reports failures through stderr + exit 1.
function Get-FeatureDirFromBranchPrefixOrExit {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$CurrentBranch
    )
    $resolved = Find-FeatureDirByPrefix -RepoRoot $RepoRoot -Branch $CurrentBranch
    if ($null -eq $resolved) {
        [Console]::Error.WriteLine('ERROR: Failed to resolve feature directory')
        exit 1
    }
    return $resolved
}

function Get-FeaturePathsEnv {
    $repoRoot = Get-RepoRoot
    $currentBranch = Get-CurrentBranch
    $hasGit = Test-HasGit

    # Resolve feature directory.  Priority:
    #   1. SPECIFY_FEATURE_DIRECTORY env var (explicit override)
    #   2. .specify/feature.json when "spec_branch" matches the current branch
    #   3. Branch-name-based prefix lookup
    $featureJson = Join-Path $repoRoot '.specify/feature.json'
    if ($env:SPECIFY_FEATURE_DIRECTORY) {
        $featureDir = $env:SPECIFY_FEATURE_DIRECTORY
        # Normalize relative paths to absolute under repo root
        if (-not [System.IO.Path]::IsPathRooted($featureDir)) {
            $featureDir = Join-Path $repoRoot $featureDir
        }
    } elseif (Test-Path $featureJson) {
        $featureJsonRaw = Get-Content -LiteralPath $featureJson -Raw
        try {
            $featureConfig = $featureJsonRaw | ConvertFrom-Json
        } catch {
            [Console]::Error.WriteLine("ERROR: Failed to parse .specify/feature.json: $_")
            exit 1
        }
        $effectiveCurrent = Get-SpecKitEffectiveBranchName $currentBranch
        $pinnedBranch = [string]$featureConfig.spec_branch
        if (-not [string]::IsNullOrWhiteSpace($pinnedBranch) -and
            (Get-SpecKitEffectiveBranchName $pinnedBranch) -ne $effectiveCurrent) {
            [Console]::Error.WriteLine("ERROR: .specify/feature.json points to spec branch '$pinnedBranch' but current branch is '$currentBranch'.")
            [Console]::Error.WriteLine('Run /speckit.specify or create-spec-branch for the active spec before continuing.')
            exit 1
        }

        if ($featureConfig.feature_directory -and -not [string]::IsNullOrWhiteSpace($pinnedBranch)) {
            $featureDir = $featureConfig.feature_directory
            # Normalize relative paths to absolute under repo root
            if (-not [System.IO.Path]::IsPathRooted($featureDir)) {
                $featureDir = Join-Path $repoRoot $featureDir
            }
        } else {
            $featureDir = Get-FeatureDirFromBranchPrefixOrExit -RepoRoot $repoRoot -CurrentBranch $currentBranch
        }
    } else {
        $featureDir = Get-FeatureDirFromBranchPrefixOrExit -RepoRoot $repoRoot -CurrentBranch $currentBranch
    }

    [PSCustomObject]@{
        REPO_ROOT     = $repoRoot
        CURRENT_BRANCH = $currentBranch
        HAS_GIT       = $hasGit
        FEATURE_DIR   = $featureDir
        FEATURE_SPEC  = Join-Path $featureDir 'spec.md'
        IMPL_PLAN     = Join-Path $featureDir 'plan.md'
        TASKS         = Join-Path $featureDir 'tasks.md'
        RESEARCH      = Join-Path $featureDir 'research.md'
        DATA_MODEL    = Join-Path $featureDir 'data-model.md'
        QUICKSTART    = Join-Path $featureDir 'quickstart.md'
        CONTRACTS_DIR = Join-Path $featureDir 'contracts'
    }
}

function Test-FileExists {
    param([string]$Path, [string]$Description)
    if (Test-Path -Path $Path -PathType Leaf) {
        Write-Output "  ✓ $Description"
        return $true
    } else {
        Write-Output "  ✗ $Description"
        return $false
    }
}

function Test-DirHasFiles {
    param([string]$Path, [string]$Description)
    if ((Test-Path -Path $Path -PathType Container) -and (Get-ChildItem -Path $Path -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer } | Select-Object -First 1)) {
        Write-Output "  ✓ $Description"
        return $true
    } else {
        Write-Output "  ✗ $Description"
        return $false
    }
}

# Resolve a template name to a file path using the Codex-only priority stack:
#   1. .specify/templates/overrides/
#   2. .specify/templates/ (core)
function Resolve-Template {
    param(
        [Parameter(Mandatory=$true)][string]$TemplateName,
        [Parameter(Mandatory=$true)][string]$RepoRoot
    )

    $base = Join-Path $RepoRoot '.specify/templates'

    # Priority 1: Project overrides
    $override = Join-Path $base "overrides/$TemplateName.md"
    if (Test-Path $override) { return $override }

    # Priority 2: Core templates
    $core = Join-Path $base "$TemplateName.md"
    if (Test-Path $core) { return $core }

    return $null
}

# Resolve a template name to content. Codex-only Spec Kit does not compose
# presets/extensions; project overrides replace core templates.
function Resolve-TemplateContent {
    param(
        [Parameter(Mandatory=$true)][string]$TemplateName,
        [Parameter(Mandatory=$true)][string]$RepoRoot
    )

    $base = Join-Path $RepoRoot '.specify/templates'

    $override = Join-Path $base "overrides/$TemplateName.md"
    if (Test-Path $override) {
        return (Get-Content $override -Raw)
    }

    $core = Join-Path $base "$TemplateName.md"
    if (Test-Path $core) {
        return (Get-Content $core -Raw)
    }

    return $null
}
