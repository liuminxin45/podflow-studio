param([string]$RepoRoot = (Get-Location).Path, [string]$FeatureDir = "", [string]$RubricPath = "", [switch]$Json)
& "$PSScriptRoot/automation-common.ps1" -Tool "validate-rubric-score" -RepoRoot $RepoRoot -FeatureDir $FeatureDir -RubricPath $RubricPath -Json:$Json
