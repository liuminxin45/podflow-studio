param([string]$RepoRoot = (Get-Location).Path, [switch]$Json)
& "$PSScriptRoot/automation-common.ps1" -Tool "inspect-plugin-build-plan" -RepoRoot $RepoRoot -Json:$Json
