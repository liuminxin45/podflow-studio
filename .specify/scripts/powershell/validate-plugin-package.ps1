param([string]$RepoRoot = (Get-Location).Path, [string]$PackagePath = "", [switch]$Json)
& "$PSScriptRoot/automation-common.ps1" -Tool "validate-plugin-package" -RepoRoot $RepoRoot -PackagePath $PackagePath -Json:$Json
