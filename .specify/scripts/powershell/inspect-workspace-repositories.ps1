param([string]$RepoRoot = (Get-Location).Path, [switch]$Json)
& "$PSScriptRoot/automation-common.ps1" -Tool "inspect-workspace-repositories" -RepoRoot $RepoRoot -Json:$Json
