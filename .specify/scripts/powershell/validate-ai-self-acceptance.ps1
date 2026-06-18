param([string]$RepoRoot = (Get-Location).Path, [string]$FeatureDir = "", [switch]$Json)
& "$PSScriptRoot/automation-common.ps1" -Tool "validate-ai-self-acceptance" -RepoRoot $RepoRoot -FeatureDir $FeatureDir -Json:$Json
