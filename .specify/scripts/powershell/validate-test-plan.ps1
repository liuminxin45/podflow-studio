param([string]$RepoRoot = (Get-Location).Path, [string]$FeatureDir = "", [switch]$Json)
& "$PSScriptRoot/automation-common.ps1" -Tool "validate-test-plan" -RepoRoot $RepoRoot -FeatureDir $FeatureDir -Json:$Json
