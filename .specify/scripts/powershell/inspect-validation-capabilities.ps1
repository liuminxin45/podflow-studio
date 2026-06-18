#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [switch]$Workspace,
    [string]$OutputPath = "",
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path

if ($Help) {
    Write-Output "Usage: inspect-validation-capabilities.ps1 [-RepoRoot <repo>] [-Workspace] [-OutputPath <file>] [-Json]"
    Write-Output "Reports deterministic API/E2E validation capabilities for Spec Kit test planning."
    exit 0
}

function To-RelativePath {
    param([string]$Path, [string]$Root = $RepoRoot)
    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue
    if (-not $resolved) { return $Path }
    $full = $resolved.Path
    if ($full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
        return ($full.Substring($Root.Length).TrimStart('\', '/') -replace "\\", "/")
    }
    return $full
}

function Read-E2eScenarioFiles {
    param([string]$E2eRoot, [string]$Root)
    $scenarioRoot = Join-Path $E2eRoot "scenarios"
    if (-not (Test-Path -LiteralPath $scenarioRoot -PathType Container)) { return @() }
    Get-ChildItem -LiteralPath $scenarioRoot -Recurse -File -Filter "*.yaml" -ErrorAction SilentlyContinue |
        ForEach-Object {
            [ordered]@{
                id = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
                path = To-RelativePath -Path $_.FullName -Root $Root
            }
        }
}

function Get-WorkspaceRepositories {
    param([string]$Root)

    $workspacePath = Join-Path $Root ".specify/workspace.yml"
    if (-not (Test-Path -LiteralPath $workspacePath -PathType Leaf)) {
        return @([PSCustomObject]@{ name = Split-Path -Leaf $Root; path = $Root; role = "primary"; required = $true })
    }

    $workspaceRoot = $Root
    $rootText = Select-String -Path $workspacePath -Pattern '^\s*root:\s*"?([^"]+)"?\s*$' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($rootText -and $rootText.Matches[0].Groups[1].Value) {
        $rootValue = $rootText.Matches[0].Groups[1].Value.Trim("'`"")
        $workspaceRoot = if ([System.IO.Path]::IsPathRooted($rootValue)) { $rootValue } else { Join-Path $Root $rootValue }
        $workspaceRoot = (Resolve-Path -LiteralPath $workspaceRoot).Path
    }

    $repos = @()
    $current = $null
    foreach ($line in Get-Content -LiteralPath $workspacePath) {
        if ($line -match '^\s*-\s*name:\s*"?([^"]+)"?\s*$') {
            if ($current) { $repos += [PSCustomObject]$current }
            $current = @{ name = $Matches[1].Trim("'`""); path = ""; role = ""; required = $false }
        } elseif ($current -and $line -match '^\s*path:\s*"?([^"]+)"?\s*$') {
            $current.path = $Matches[1].Trim("'`"")
        } elseif ($current -and $line -match '^\s*role:\s*"?([^"]+)"?\s*$') {
            $current.role = $Matches[1].Trim("'`"")
        } elseif ($current -and $line -match '^\s*required:\s*(true|false)\s*$') {
            $current.required = ($Matches[1] -eq "true")
        }
    }
    if ($current) { $repos += [PSCustomObject]$current }
    if ($repos.Count -eq 0) {
        return @([PSCustomObject]@{ name = Split-Path -Leaf $Root; path = $Root; role = "primary"; required = $true })
    }

    return @($repos | ForEach-Object {
        $repoPath = if ([System.IO.Path]::IsPathRooted($_.path)) { $_.path } else { Join-Path $workspaceRoot $_.path }
        [PSCustomObject]@{
            name = $_.name
            path = $repoPath
            role = $_.role
            required = [bool]$_.required
        }
    })
}

function Get-RepositoryValidationCapabilities {
    param([string]$Root, [string]$Name = (Split-Path -Leaf $Root), [string]$Role = "")

    $root = (Resolve-Path -LiteralPath $Root).Path
    $e2eScript = Join-Path $root "script/run-e2e.ps1"
    $e2eRoot = Join-Path $root "tests/e2e"
    $e2eSupported = (Test-Path -LiteralPath $e2eScript -PathType Leaf) -and
        (Test-Path -LiteralPath $e2eRoot -PathType Container)
    $nodeModules = Join-Path $e2eRoot "node_modules"
    $e2eDependenciesPresent = Test-Path -LiteralPath $nodeModules -PathType Container
    $scenarioFacts = @()

    if ($e2eSupported) {
        $scenarioFacts = @(Read-E2eScenarioFiles -E2eRoot $e2eRoot -Root $root)
    }

    $cmakeLists = Join-Path $root "CMakeLists.txt"
    $testsRoot = Join-Path $root "tests"
    $apiCandidateCommands = @()
    if (Test-Path -LiteralPath $cmakeLists -PathType Leaf) {
        $apiCandidateCommands += "cmake --build build --config Debug --target run_tests"
        $apiCandidateCommands += "cd build; ctest -C Debug --output-on-failure"
    }
    $apiCandidatePaths = @()
    if (Test-Path -LiteralPath $testsRoot -PathType Container) {
        $apiCandidatePaths += To-RelativePath -Path $testsRoot -Root $root
    }

    return [ordered]@{
        repository = $Name
        role = $Role
        path = To-RelativePath -Path $root -Root $RepoRoot
        api_test_plan_required = $true
        e2e_may_be_na_when_unsupported = $true
        policy = [ordered]@{
            api_test_plan_required = $true
            e2e_may_be_na_when_unsupported = $true
        }
        api = [ordered]@{
            plan_required = $true
            supported = $apiCandidateCommands.Count -gt 0
            candidate_commands = $apiCandidateCommands
            candidate_paths = $apiCandidatePaths
            note = "Always include API/interface/regression rows for affected contracts; verify exact target names against the current build tree before execution."
        }
        e2e = [ordered]@{
            supported = $e2eSupported
            runner = if ($e2eSupported) { To-RelativePath -Path $e2eScript -Root $root } else { "" }
            root = if ($e2eSupported) { To-RelativePath -Path $e2eRoot -Root $root } else { "" }
            list_command = if ($e2eSupported) { "script/run-e2e.ps1 -List" } else { "" }
            run_command = if ($e2eSupported) { "script/run-e2e.ps1 -Product robot-pilot -Scenario <scenario-id>" } else { "" }
            dependencies_present = $e2eDependenciesPresent
            scenarios = $scenarioFacts
            scenario_count = $scenarioFacts.Count
            known_scenarios = $scenarioFacts
            list_output = @($scenarioFacts | ForEach-Object { "$($_.id)`t$($_.path)" })
        }
    }
}

if ($Workspace) {
    $repositories = @(Get-WorkspaceRepositories -Root $RepoRoot)
    $repoFacts = @()
    $hints = @()
    foreach ($repo in $repositories) {
        if (-not (Test-Path -LiteralPath $repo.path -PathType Container)) {
            $hints += "Repository '$($repo.name)' was listed but not found at $($repo.path)."
            continue
        }
        $capability = Get-RepositoryValidationCapabilities -Root $repo.path -Name $repo.name -Role $repo.role
        $repoFacts += $capability
        if (-not $capability.e2e.supported) {
            $hints += "$($repo.name): E2E is not supported; mark E2E as N/A with a reason, but keep the API test plan."
        } elseif (-not $capability.e2e.dependencies_present) {
            $hints += "$($repo.name): E2E is supported but dependencies are missing; run npm install in tests/e2e before executing E2E."
        }
        if (-not $capability.api.supported) {
            $hints += "$($repo.name): No deterministic API command was detected; the API test plan is still required and should cite manual/interface/regression validation rows."
        }
    }

    $matrix = [ordered]@{
        schema_version = "1.0"
        generated_by = "inspect-validation-capabilities"
        policy = [ordered]@{
            api_test_plan_required = $true
            e2e_may_be_na_when_unsupported = $true
            load_on_demand = "Use during clarify/plan before source search for test commands."
        }
        repositories = $repoFacts
    }
    if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
        $target = if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $RepoRoot $OutputPath }
        $parent = Split-Path -Parent $target
        if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        $matrix | ConvertTo-Json -Depth 16 -Compress | Set-Content -LiteralPath $target -Encoding UTF8
    }

    $payload = [ordered]@{
        tool = "inspect-validation-capabilities"
        status = "ok"
        facts = [ordered]@{
            workspace = $true
            repository_count = $repoFacts.Count
            output_path = $OutputPath
            matrix = $matrix
        }
        blockers = @()
        unknowns = @()
        hints = $hints
    }
} else {
    $capability = Get-RepositoryValidationCapabilities -Root $RepoRoot
    $hints = @()
    if (-not $capability.e2e.supported) {
        $hints += "E2E is not supported for this repository; mark E2E as N/A with a reason, but keep the API test plan."
    } elseif (-not $capability.e2e.dependencies_present) {
        $hints += "E2E is supported but dependencies are missing; run npm install in tests/e2e before executing E2E."
    }
    if (-not $capability.api.supported) {
        $hints += "No deterministic API command was detected; the API test plan is still required and should cite manual/interface/regression validation rows."
    }

    $payload = [ordered]@{
        tool = "inspect-validation-capabilities"
        status = "ok"
        facts = $capability
        blockers = @()
        unknowns = @()
        hints = $hints
    }
}

if ($Json) {
    $payload | ConvertTo-Json -Depth 16 -Compress
} else {
    Write-Output "Validation capability inspection is ok."
    if ($Workspace) {
        Write-Output "Workspace repositories inspected: $($payload.facts.repository_count)"
        if (-not [string]::IsNullOrWhiteSpace($OutputPath)) { Write-Output "Output path: $OutputPath" }
    } else {
        Write-Output "API plan required: true"
        Write-Output "E2E supported: $($payload.facts.e2e.supported)"
        if ($payload.facts.e2e.supported) {
            Write-Output "E2E runner: $($payload.facts.e2e.runner)"
        }
    }
}
