param(
    [string]$ToolName = "specify-cli",
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Output "Usage: uninstall.ps1 [-ToolName specify-cli] [-Help]"
    Write-Output "Uninstalls the uv tool executable. This command changes the user-level uv tool environment."
    exit 0
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv is required to uninstall $ToolName."
}

Write-Host "Uninstalling $ToolName via uv"
& uv tool uninstall $ToolName
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
