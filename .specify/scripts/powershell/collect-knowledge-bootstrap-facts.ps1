param(
    [string]$RepoRoot = "",
    [string]$OutputDir = "",
    [int]$MaxDepth = 2,
    [switch]$Json
)

$ErrorActionPreference = "Stop"

function Resolve-Root {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        return (Get-Location).Path
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Get-RelativePath {
    param([string]$Root, [string]$Path)
    try {
        $rootUri = [System.Uri]((Resolve-Path -LiteralPath $Root).Path.TrimEnd('\') + '\')
        $pathUri = [System.Uri]((Resolve-Path -LiteralPath $Path).Path)
        return [System.Uri]::UnescapeDataString($rootUri.MakeRelativeUri($pathUri).ToString()).Replace('/', '\')
    } catch {
        return $Path
    }
}

function Read-WorkspaceRepositories {
    param([string]$Root)
    $workspaceFile = Join-Path $Root ".specify\workspace.yml"
    $items = @()
    if (-not (Test-Path -LiteralPath $workspaceFile)) {
        return $items
    }

    $current = $null
    foreach ($line in Get-Content -LiteralPath $workspaceFile) {
        if ($line -match "^\s*-\s*name:\s*(.+?)\s*$") {
            if ($current -and $current.name) { $items += [PSCustomObject]$current }
            $current = [ordered]@{
                name = $Matches[1].Trim().Trim('"').Trim("'")
                path = ""
                required = $false
            }
            continue
        }
        if (-not $current) { continue }
        if ($line -match "^\s*path:\s*(.+?)\s*$") {
            $current.path = $Matches[1].Trim().Trim('"').Trim("'")
            continue
        }
        if ($line -match "^\s*required:\s*(true|false)\s*$") {
            $current.required = ($Matches[1].ToLowerInvariant() -eq "true")
        }
    }
    if ($current -and $current.name) { $items += [PSCustomObject]$current }
    return $items
}

function Find-GitRepositories {
    param([string]$Root, [int]$Depth)
    $results = @()
    $queue = New-Object System.Collections.Queue
    $queue.Enqueue([PSCustomObject]@{ path = $Root; depth = 0 })
    $skipNames = @(".git", ".venv", "node_modules", "build", "dist", ".pytest_cache")

    while ($queue.Count -gt 0) {
        $item = $queue.Dequeue()
        $path = $item.path
        if (Test-Path -LiteralPath (Join-Path $path ".git")) {
            $results += [PSCustomObject]@{
                name = Split-Path -Leaf $path
                path = (Get-RelativePath -Root $Root -Path $path)
                required = $false
            }
        }
        if ($item.depth -ge $Depth) { continue }
        foreach ($child in Get-ChildItem -LiteralPath $path -Directory -Force -ErrorAction SilentlyContinue) {
            if ($skipNames -contains $child.Name) { continue }
            $queue.Enqueue([PSCustomObject]@{ path = $child.FullName; depth = ($item.depth + 1) })
        }
    }
    return $results
}

function Get-MarkerFacts {
    param([string]$RepoPath)
    $markers = [ordered]@{
        "package.json" = "node"
        "pnpm-lock.yaml" = "pnpm"
        "yarn.lock" = "yarn"
        "pyproject.toml" = "python"
        "requirements.txt" = "python"
        "CMakeLists.txt" = "cmake"
        "Cargo.toml" = "rust"
        "go.mod" = "go"
        "pom.xml" = "maven"
        "build.gradle" = "gradle"
        "README.md" = "readme"
        ".github\workflows" = "github-actions"
        "tests" = "tests"
        "test" = "tests"
        "specs" = "specs"
        "contracts" = "contracts"
    }

    $found = @()
    foreach ($marker in $markers.Keys) {
        if (Test-Path -LiteralPath (Join-Path $RepoPath $marker)) {
            $found += [ordered]@{ marker = $marker; kind = $markers[$marker] }
        }
    }
    return $found
}

function Get-CandidateCommands {
    param([array]$Markers)
    $kinds = @($Markers | ForEach-Object { $_.kind } | Select-Object -Unique)
    $commands = @()
    if ($kinds -contains "node") {
        $commands += "npm install"
        $commands += "npm test"
        $commands += "npm run build"
    }
    if ($kinds -contains "pnpm") {
        $commands += "pnpm install"
        $commands += "pnpm test"
        $commands += "pnpm build"
    }
    if ($kinds -contains "python") {
        $commands += "python -m pytest"
    }
    if ($kinds -contains "cmake") {
        $commands += "cmake -S . -B build"
        $commands += "ctest --test-dir build"
    }
    if ($kinds -contains "rust") {
        $commands += "cargo test"
        $commands += "cargo build"
    }
    if ($kinds -contains "go") {
        $commands += "go test ./..."
    }
    if ($kinds -contains "maven") {
        $commands += "mvn test"
    }
    if ($kinds -contains "gradle") {
        $commands += "gradle test"
    }
    return @($commands | Select-Object -Unique)
}

$root = Resolve-Root -Path $RepoRoot
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $root ".specify\knowledge-bootstrap"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$workspaceRepos = @(Read-WorkspaceRepositories -Root $root)
if ($workspaceRepos.Count -eq 0) {
    $workspaceRepos = @(Find-GitRepositories -Root $root -Depth $MaxDepth)
}
if ($workspaceRepos.Count -eq 0) {
    $workspaceRepos = @([PSCustomObject]@{
        name = Split-Path -Leaf $root
        path = "."
        required = $false
    })
}

$repoFacts = @()
foreach ($repo in $workspaceRepos) {
    $repoPath = if ([System.IO.Path]::IsPathRooted($repo.path)) { $repo.path } else { Join-Path $root $repo.path }
    $exists = Test-Path -LiteralPath $repoPath
    $markers = @()
    $commands = @()
    if ($exists) {
        $markers = @(Get-MarkerFacts -RepoPath $repoPath)
        $commands = @(Get-CandidateCommands -Markers $markers)
    }
    $repoFacts += [ordered]@{
        name = $repo.name
        path = $repo.path
        required = [bool]$repo.required
        exists = [bool]$exists
        markers = $markers
        candidate_commands = $commands
    }
}

$payload = [ordered]@{
    tool = "collect-knowledge-bootstrap-facts"
    status = "ok"
    facts = [ordered]@{
        repo_root = $root
        workspace_file = (Join-Path $root ".specify\workspace.yml")
        repository_count = $repoFacts.Count
        repositories = $repoFacts
    }
    blockers = @()
    unknowns = @()
    hints = @(
        "These facts are deterministic inventory, not final knowledge.",
        "Use AI review plus source evidence before promoting generated guides."
    )
}

$factsPath = Join-Path $OutputDir "facts.json"
$inventoryPath = Join-Path $OutputDir "inventory.md"
$payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $factsPath -Encoding utf8

$lines = @("# Knowledge Bootstrap Inventory", "")
$lines += "- Root: $root"
$lines += "- Repository count: $($repoFacts.Count)"
$lines += ""
foreach ($repo in $repoFacts) {
    $lines += "## $($repo.name)"
    $lines += "- Path: $($repo.path)"
    $lines += "- Exists: $($repo.exists)"
    $markerText = if (@($repo.markers).Count -gt 0) { (@($repo.markers | ForEach-Object { $_.marker }) -join ", ") } else { "none" }
    $lines += "- Markers: $markerText"
    $commandText = if (@($repo.candidate_commands).Count -gt 0) { (@($repo.candidate_commands) -join "; ") } else { "none" }
    $lines += "- Candidate commands: $commandText"
    $lines += ""
}
$lines | Set-Content -LiteralPath $inventoryPath -Encoding utf8

if ($Json) {
    $payload | ConvertTo-Json -Depth 8
} else {
    "facts: $factsPath"
    "inventory: $inventoryPath"
}
