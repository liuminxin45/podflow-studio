param(
    [string]$RepoRoot = "",
    [ValidateSet("", "skills", "tools", "scripts", "commands", "prompts", "resources", "templates")]
    [string]$Layer = "",
    [string]$PackId = "",
    [int]$MaxSelected = 6,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\knowledge-pack-common.ps1"

$result = New-KnowledgePackResult "select-capability"

try {
    $root = Resolve-KnowledgePackPath -Path $RepoRoot
    if ([string]::IsNullOrWhiteSpace($root)) { $root = (Get-Location).Path }
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
        Set-KnowledgePackBlocked $result "RepoRoot not found: $root"
    }

    $lockPath = Join-Path $root ".specify\capabilities\lock.yml"
    $published = @()
    if ($result.status -ne "blocked") {
        if (-not (Test-Path -LiteralPath $lockPath -PathType Leaf)) {
            $result.hints += "No .specify/capabilities/lock.yml found; no capability pack layers are currently published."
        } else {
            $inPublished = $false
            $current = $null
            foreach ($line in Get-Content -LiteralPath $lockPath) {
                if ($line -match "^\s*published:\s*$") {
                    $inPublished = $true
                    continue
                }
                if (-not $inPublished) { continue }
                if ($line -match "^\s*-\s+layer:\s*['""]?(.+?)['""]?\s*$") {
                    if ($current) { $published += [PSCustomObject]$current }
                    $current = [ordered]@{
                        layer = $Matches[1].Trim().Trim('"').Trim("'")
                        pack_id = ""
                        path = ""
                        exists = $false
                    }
                    continue
                }
                if ($null -eq $current) { continue }
                if ($line -match "^\s{4}pack_id:\s*['""]?(.+?)['""]?\s*$") {
                    $current.pack_id = $Matches[1].Trim().Trim('"').Trim("'")
                    continue
                }
                if ($line -match "^\s{4}path:\s*['""]?(.+?)['""]?\s*$") {
                    $current.path = $Matches[1].Trim().Trim('"').Trim("'")
                    $resolved = Join-Path $root ($current.path -replace "/", "\")
                    $current.exists = (Test-Path -LiteralPath $resolved)
                    continue
                }
                if ($line -match "^\S") { break }
            }
            if ($current) { $published += [PSCustomObject]$current }
        }
    }

    if ($result.status -ne "blocked") {
        $normalizedPackId = if ([string]::IsNullOrWhiteSpace($PackId)) { "" } else { ConvertTo-KnowledgePackSlug -Value $PackId }
        $matching = @($published | Where-Object {
            ([string]::IsNullOrWhiteSpace($Layer) -or $_.layer -eq $Layer) -and
            ([string]::IsNullOrWhiteSpace($normalizedPackId) -or $_.pack_id -eq $normalizedPackId)
        })
        $selected = @($matching | Select-Object -First $MaxSelected)
        $skipped = @($matching | Select-Object -Skip $MaxSelected)
        $result.facts.repo_root = $root
        $result.facts.lock = $lockPath
        $result.facts.default_context = $false
        $result.facts.progressive_disclosure = $true
        $result.facts.auto_run_scripts = $false
        $result.facts.max_selected = $MaxSelected
        $result.facts.selected = $selected
        $result.facts.skipped = $skipped
    }
} catch {
    Set-KnowledgePackBlocked $result $_.Exception.Message
}

if ($Json) { Write-KnowledgePackJson $result } else { $result }
