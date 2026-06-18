param([string]$RepoRoot = "", [switch]$Json)
. "$PSScriptRoot/common.ps1"
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Get-SpecKitRoot
}
& "$PSScriptRoot/automation-common.ps1" -Tool "validate-generated-context" -RepoRoot $RepoRoot -Json:$Json
