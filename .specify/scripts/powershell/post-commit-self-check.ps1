param([string]$RepoRoot = (Get-Location).Path, [string]$FeatureDir = "", [switch]$Json)
& "$PSScriptRoot/automation-common.ps1" -Tool "post-commit-self-check" -RepoRoot $RepoRoot -FeatureDir $FeatureDir -Json:$Json
