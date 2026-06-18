param(
    [string]$RepoRoot = "",
    [string]$FeatureDir = "",
    [string]$Stage = "",
    [string]$DeliveryProfile = "",
    [string]$WorkflowState = "",
    [string]$CandidatesPath = "",
    [switch]$Json
)

. "$PSScriptRoot/common.ps1"
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Get-SpecKitRoot
}

& "$PSScriptRoot/automation-common.ps1" `
    -Tool "validate-knowledge-index" `
    -RepoRoot $RepoRoot `
    -FeatureDir $FeatureDir `
    -Stage $Stage `
    -DeliveryProfile $DeliveryProfile `
    -WorkflowState $WorkflowState `
    -CandidatesPath $CandidatesPath `
    -Json:$Json
